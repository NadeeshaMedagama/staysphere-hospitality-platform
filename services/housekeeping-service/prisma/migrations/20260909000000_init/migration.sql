-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CHECKOUT_CLEAN', 'STAYOVER_CLEAN', 'DEEP_CLEAN', 'INSPECTION', 'TURNDOWN');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "nextArrivalAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "reworkOfId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeper_shifts" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "housekeeper_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "housekeeping_tasks_hotelId_status_priority_idx" ON "housekeeping_tasks"("hotelId", "status", "priority");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_assignedToId_status_idx" ON "housekeeping_tasks"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_roomId_createdAt_idx" ON "housekeeping_tasks"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "checklist_items_taskId_sortOrder_idx" ON "checklist_items"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "housekeeper_shifts_hotelId_startsAt_idx" ON "housekeeper_shifts"("hotelId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "housekeeper_shifts_staffId_startsAt_key" ON "housekeeper_shifts"("staffId", "startsAt");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "housekeeping_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

