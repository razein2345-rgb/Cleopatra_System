-- AlterTable
ALTER TABLE "SupplierPurchase" ADD COLUMN     "recordedById" UUID NOT NULL,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" UUID;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "recordedById" UUID NOT NULL,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" UUID;

-- CreateIndex
CREATE INDEX "SupplierPurchase_partnerId_idx" ON "SupplierPurchase"("partnerId");

-- CreateIndex
CREATE INDEX "SupplierPurchase_isDeleted_idx" ON "SupplierPurchase"("isDeleted");

-- CreateIndex
CREATE INDEX "SupplierPayment_partnerId_idx" ON "SupplierPayment"("partnerId");

-- CreateIndex
CREATE INDEX "SupplierPayment_isDeleted_idx" ON "SupplierPayment"("isDeleted");

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
