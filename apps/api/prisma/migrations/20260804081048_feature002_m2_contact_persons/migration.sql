-- CreateEnum
CREATE TYPE "PreferredContactMethod" AS ENUM ('PHONE', 'MOBILE', 'WHATSAPP', 'EMAIL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PRIMARY_CHANGED';

-- CreateTable
CREATE TABLE "ContactPerson" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "mobile" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "preferredContactMethod" "PreferredContactMethod",
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canApproveQuotations" BOOLEAN NOT NULL DEFAULT false,
    "canApproveWorkOrders" BOOLEAN NOT NULL DEFAULT false,
    "canApproveFinancialDocuments" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactPerson_partnerId_idx" ON "ContactPerson"("partnerId");

-- CreateIndex
CREATE INDEX "ContactPerson_isDeleted_idx" ON "ContactPerson"("isDeleted");

-- CreateIndex
CREATE INDEX "ContactPerson_isPrimary_idx" ON "ContactPerson"("isPrimary");

-- AddForeignKey
ALTER TABLE "ContactPerson" ADD CONSTRAINT "ContactPerson_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
