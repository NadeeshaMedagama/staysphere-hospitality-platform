-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "daily_performance" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "roomsAvailable" INTEGER NOT NULL DEFAULT 0,
    "roomsSold" INTEGER NOT NULL DEFAULT 0,
    "roomsOutOfOrder" INTEGER NOT NULL DEFAULT 0,
    "roomRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "serviceRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "arrivals" INTEGER NOT NULL DEFAULT 0,
    "departures" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_facts" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdOn" DATE NOT NULL,
    "arrivalOn" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "booking_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_facts" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "staffId" TEXT NOT NULL,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "minutesWorked" INTEGER NOT NULL DEFAULT 0,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "housekeeping_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "eventId" TEXT NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "daily_performance_hotelId_date_idx" ON "daily_performance"("hotelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_performance_hotelId_date_key" ON "daily_performance"("hotelId", "date");

-- CreateIndex
CREATE INDEX "booking_facts_hotelId_createdOn_idx" ON "booking_facts"("hotelId", "createdOn");

-- CreateIndex
CREATE INDEX "booking_facts_hotelId_arrivalOn_idx" ON "booking_facts"("hotelId", "arrivalOn");

-- CreateIndex
CREATE INDEX "booking_facts_hotelId_channel_createdOn_idx" ON "booking_facts"("hotelId", "channel", "createdOn");

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_facts_hotelId_date_staffId_key" ON "housekeeping_facts"("hotelId", "date", "staffId");

