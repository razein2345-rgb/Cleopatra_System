-- "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19, owner-approved) — a
-- lightweight OrderItemGroup/QuotationItemGroup link table (no price, no
-- approval field — approval lives entirely in the existing Workflow
-- Engine) plus per-OrderItem production progress columns, independent of
-- the shared WorkOrder/WorkflowInstance's own stage. Purely additive:
-- every new column is nullable or defaulted, every existing column is
-- untouched, no data migration/backfill needed.

-- CreateEnum
CREATE TYPE "OrderItemProductionStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "OrderItemGroup" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItemGroup_orderId_idx" ON "OrderItemGroup"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItemGroup" ADD CONSTRAINT "OrderItemGroup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "QuotationItemGroup" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationItemGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationItemGroup_quotationId_idx" ON "QuotationItemGroup"("quotationId");

-- AddForeignKey
ALTER TABLE "QuotationItemGroup" ADD CONSTRAINT "QuotationItemGroup_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: OrderItem — grouping + per-variant production tracking
ALTER TABLE "OrderItem"
  ADD COLUMN "groupId" UUID,
  ADD COLUMN "requiredQuantity" INTEGER,
  ADD COLUMN "producedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "productionStatus" "OrderItemProductionStatus" NOT NULL DEFAULT 'WAITING',
  ADD COLUMN "productionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "productionUpdatedById" UUID;

-- CreateIndex
CREATE INDEX "OrderItem_groupId_idx" ON "OrderItem"("groupId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrderItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productionUpdatedById_fkey" FOREIGN KEY ("productionUpdatedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: QuotationItem — same grouping mirror as OrderItem
ALTER TABLE "QuotationItem"
  ADD COLUMN "groupId" UUID,
  ADD COLUMN "requiredQuantity" INTEGER;

-- CreateIndex
CREATE INDEX "QuotationItem_groupId_idx" ON "QuotationItem"("groupId");

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuotationItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
