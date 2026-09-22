-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('IN_HOUSE', 'CHECKED_OUT', 'DEPARTED_UNSETTLED');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FolioLineKind" AS ENUM ('ROOM', 'SERVICE', 'TAX', 'DISCOUNT', 'ADJUSTMENT', 'PAYMENT', 'REFUND');

-- CreateTable
CREATE TABLE "stays" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "guestNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "status" "StayStatus" NOT NULL DEFAULT 'IN_HOUSE',
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedInById" TEXT NOT NULL,
    "expectedCheckOut" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "checkedOutById" TEXT,
    "currency" CHAR(3) NOT NULL,
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_lines" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "kind" "FolioLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sourceId" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folio_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduledFor" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "stays_bookingId_key" ON "stays"("bookingId");

-- CreateIndex
CREATE INDEX "stays_hotelId_status_idx" ON "stays"("hotelId", "status");

-- CreateIndex
CREATE INDEX "stays_customerId_checkedInAt_idx" ON "stays"("customerId", "checkedInAt");

-- CreateIndex
CREATE INDEX "stays_roomId_status_idx" ON "stays"("roomId", "status");

-- CreateIndex
CREATE INDEX "folio_lines_stayId_postedAt_idx" ON "folio_lines"("stayId", "postedAt");

-- CreateIndex
CREATE INDEX "folio_lines_stayId_kind_idx" ON "folio_lines"("stayId", "kind");

-- CreateIndex
CREATE INDEX "service_requests_stayId_status_idx" ON "service_requests"("stayId", "status");

-- CreateIndex
CREATE INDEX "service_requests_status_scheduledFor_idx" ON "service_requests"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_hotelId_code_key" ON "service_catalog"("hotelId", "code");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

