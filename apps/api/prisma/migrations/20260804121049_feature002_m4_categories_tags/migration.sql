-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE_CATEGORY';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_CATEGORY';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_CATEGORY';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_TAG';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_TAG';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_TAG';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'TAGS_CHANGED';

-- AlterTable
ALTER TABLE "BusinessPartner" ADD COLUMN     "categoryId" UUID;

-- CreateTable
CREATE TABLE "PartnerCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPartnerTag" (
    "partnerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessPartnerTag_pkey" PRIMARY KEY ("partnerId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCategory_name_key" ON "PartnerCategory"("name");

-- CreateIndex
CREATE INDEX "PartnerCategory_isDeleted_idx" ON "PartnerCategory"("isDeleted");

-- CreateIndex
CREATE INDEX "PartnerCategory_isActive_idx" ON "PartnerCategory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTag_name_key" ON "PartnerTag"("name");

-- CreateIndex
CREATE INDEX "PartnerTag_isDeleted_idx" ON "PartnerTag"("isDeleted");

-- CreateIndex
CREATE INDEX "PartnerTag_isActive_idx" ON "PartnerTag"("isActive");

-- CreateIndex
CREATE INDEX "BusinessPartnerTag_tagId_idx" ON "BusinessPartnerTag"("tagId");

-- CreateIndex
CREATE INDEX "BusinessPartner_categoryId_idx" ON "BusinessPartner"("categoryId");

-- AddForeignKey
ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartnerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPartnerTag" ADD CONSTRAINT "BusinessPartnerTag_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPartnerTag" ADD CONSTRAINT "BusinessPartnerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PartnerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
