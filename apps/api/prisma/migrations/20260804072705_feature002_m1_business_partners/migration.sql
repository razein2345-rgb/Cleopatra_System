-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PartnerRole" AS ENUM ('CUSTOMER', 'SUPPLIER', 'GOVERNMENT', 'SCHOOL', 'HOSPITAL', 'COMPANY', 'PRINTING_HOUSE', 'INTERNAL_DEPARTMENT');

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_customerId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPayment" DROP CONSTRAINT "SupplierPayment_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierPurchase" DROP CONSTRAINT "SupplierPurchase_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "Tender" DROP CONSTRAINT "Tender_customerId_fkey";

-- DropForeignKey
ALTER TABLE "TreasuryEntry" DROP CONSTRAINT "TreasuryEntry_customerId_fkey";

-- DropIndex
DROP INDEX "Attachment_customerId_idx";

-- DropIndex
DROP INDEX "Order_customerId_idx";

-- DropIndex
DROP INDEX "Quotation_customerId_idx";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "customerId",
ADD COLUMN     "partnerId" UUID;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "customerId",
ADD COLUMN     "partnerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "customerId",
ADD COLUMN     "partnerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "SupplierPayment" DROP COLUMN "supplierId",
ADD COLUMN     "partnerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "SupplierPurchase" DROP COLUMN "supplierId",
ADD COLUMN     "partnerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Tender" DROP COLUMN "customerId",
ADD COLUMN     "partnerId" UUID;

-- AlterTable
ALTER TABLE "TreasuryEntry" DROP COLUMN "customerId",
ADD COLUMN     "partnerId" UUID;

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Supplier";

-- CreateTable
CREATE TABLE "BusinessPartner" (
    "id" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "shortName" TEXT,
    "isIndividual" BOOLEAN NOT NULL DEFAULT false,
    "roles" "PartnerRole"[],
    "status" "PartnerStatus" NOT NULL DEFAULT 'PROSPECT',
    "branchId" UUID NOT NULL,
    "salesRepId" UUID,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessPartner_isDeleted_idx" ON "BusinessPartner"("isDeleted");

-- CreateIndex
CREATE INDEX "BusinessPartner_status_idx" ON "BusinessPartner"("status");

-- CreateIndex
CREATE INDEX "BusinessPartner_branchId_idx" ON "BusinessPartner"("branchId");

-- CreateIndex
CREATE INDEX "BusinessPartner_nameAr_idx" ON "BusinessPartner"("nameAr");

-- CreateIndex
CREATE INDEX "Attachment_partnerId_idx" ON "Attachment"("partnerId");

-- CreateIndex
CREATE INDEX "Order_partnerId_idx" ON "Order"("partnerId");

-- CreateIndex
CREATE INDEX "Quotation_partnerId_idx" ON "Quotation"("partnerId");

-- AddForeignKey
ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
