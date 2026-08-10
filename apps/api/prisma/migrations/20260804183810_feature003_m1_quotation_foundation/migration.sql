-- CreateEnum
CREATE TYPE "QuotationApprovalState" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_REVISION');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_CHANGED';

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "approvalState" "QuotationApprovalState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "customerNotes" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "previousVersionId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "itemType" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "readyProductId" UUID,
ADD COLUMN     "serviceId" UUID,
ADD COLUMN     "size" TEXT,
ALTER COLUMN "kind" DROP NOT NULL,
ALTER COLUMN "breakdown" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_previousVersionId_key" ON "Quotation"("previousVersionId");

-- CreateIndex
CREATE INDEX "Quotation_approvalState_idx" ON "Quotation"("approvalState");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_readyProductId_idx" ON "QuotationItem"("readyProductId");

-- CreateIndex
CREATE INDEX "QuotationItem_serviceId_idx" ON "QuotationItem"("serviceId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_readyProductId_fkey" FOREIGN KEY ("readyProductId") REFERENCES "ReadyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
