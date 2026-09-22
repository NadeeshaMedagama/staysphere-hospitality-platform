-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "hotelId" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "failureCode" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "audit_entries_actorId_occurredAt_idx" ON "audit_entries"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_entries_resource_resourceId_occurredAt_idx" ON "audit_entries"("resource", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_entries_hotelId_occurredAt_idx" ON "audit_entries"("hotelId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_entries_correlationId_idx" ON "audit_entries"("correlationId");

