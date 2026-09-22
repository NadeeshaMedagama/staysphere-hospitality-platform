-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYHERE', 'PAYPAL', 'CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'CASH', 'WALLET');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stayId" TEXT,
    "hotelId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "capturedMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CARD',
    "providerReference" TEXT,
    "cardLast4" CHAR(4),
    "cardBrand" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "retriable" BOOLEAN NOT NULL DEFAULT false,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerReference_key" ON "payments"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_customerId_createdAt_idx" ON "payments"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_hotelId_status_createdAt_idx" ON "payments"("hotelId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_providerReference_key" ON "refunds"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotencyKey_key" ON "refunds"("idempotencyKey");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_processedAt_idx" ON "webhook_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEventId_key" ON "webhook_events"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

