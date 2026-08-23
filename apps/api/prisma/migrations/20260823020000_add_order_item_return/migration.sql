-- Owner (2026-08-23, "مرتجعات") — scoped to INVENTORY_RETAIL items,
-- supports partial-quantity returns, refund always paid out as cash.
-- AlterTable
ALTER TABLE "TreasuryEntry" ADD COLUMN "orderItemReturnId" UUID;

-- CreateTable
CREATE TABLE "OrderItemReturn" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "recordedById" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItemReturn_orderItemId_idx" ON "OrderItemReturn"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemReturn_branchId_idx" ON "OrderItemReturn"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryEntry_orderItemReturnId_key" ON "TreasuryEntry"("orderItemReturnId");

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_orderItemReturnId_fkey" FOREIGN KEY ("orderItemReturnId") REFERENCES "OrderItemReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
