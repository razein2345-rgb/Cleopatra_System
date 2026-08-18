-- Owner (2026-08-17): (1) visibility-only print counter on Quotation, never
-- enforced as a limit ("تتبع العدد بس، من غير منع"); (2) OrderTemplate for
-- the "save this order as a recurring template" prompt after order
-- creation. Purely additive — no existing column touched, no backfill
-- needed (printCount defaults to 0 for existing rows).

ALTER TABLE "Quotation" ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OrderTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "partnerId" UUID,
    "itemsSnapshot" JSONB NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderTemplate_branchId_idx" ON "OrderTemplate"("branchId");
CREATE INDEX "OrderTemplate_partnerId_idx" ON "OrderTemplate"("partnerId");
CREATE INDEX "OrderTemplate_isDeleted_idx" ON "OrderTemplate"("isDeleted");

ALTER TABLE "OrderTemplate" ADD CONSTRAINT "OrderTemplate_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderTemplate" ADD CONSTRAINT "OrderTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderTemplate" ADD CONSTRAINT "OrderTemplate_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
