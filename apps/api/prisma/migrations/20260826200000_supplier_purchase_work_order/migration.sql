-- AlterTable
ALTER TABLE "SupplierPurchase" ADD COLUMN     "workOrderId" UUID;

-- CreateIndex
CREATE INDEX "SupplierPurchase_workOrderId_idx" ON "SupplierPurchase"("workOrderId");

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
