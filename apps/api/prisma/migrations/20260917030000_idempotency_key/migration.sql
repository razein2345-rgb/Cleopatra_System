-- Accounting audit fix (2026-09-17, Phase 3 E) — generic idempotency-key
-- store for financial mutations that opt in via an `Idempotency-Key`
-- header (order creation, payment recording, POS quick sale). A brand new
-- table; no existing data affected.

CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "staffId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");
