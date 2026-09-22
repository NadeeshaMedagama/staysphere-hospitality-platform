-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "baseRateMinor" INTEGER NOT NULL,
    "weekendMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "taxBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "minRateMinor" INTEGER,
    "maxRateMinor" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_rates" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "nightlyRateMinor" INTEGER NOT NULL,

    CONSTRAINT "seasonal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "long_stay_discounts" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "minNights" INTEGER NOT NULL,
    "basisPoints" INTEGER NOT NULL,

    CONSTRAINT "long_stay_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromotionType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" INTEGER NOT NULL,
    "currency" CHAR(3),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "minNights" INTEGER NOT NULL DEFAULT 1,
    "minSpendMinor" INTEGER NOT NULL DEFAULT 0,
    "roomTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "maxPerCustomer" INTEGER NOT NULL DEFAULT 1,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "rate_plans_hotelId_roomTypeId_published_idx" ON "rate_plans"("hotelId", "roomTypeId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plans_hotelId_roomTypeId_effectiveFrom_key" ON "rate_plans"("hotelId", "roomTypeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seasonal_rates_ratePlanId_startsOn_endsOn_idx" ON "seasonal_rates"("ratePlanId", "startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "long_stay_discounts_ratePlanId_minNights_key" ON "long_stay_discounts"("ratePlanId", "minNights");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_code_active_idx" ON "promotions"("code", "active");

-- CreateIndex
CREATE INDEX "promotions_hotelId_active_validFrom_validTo_idx" ON "promotions"("hotelId", "active", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotionId_customerId_idx" ON "promotion_redemptions"("promotionId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_promotionId_bookingId_key" ON "promotion_redemptions"("promotionId", "bookingId");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "seasonal_rates" ADD CONSTRAINT "seasonal_rates_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_stay_discounts" ADD CONSTRAINT "long_stay_discounts_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

