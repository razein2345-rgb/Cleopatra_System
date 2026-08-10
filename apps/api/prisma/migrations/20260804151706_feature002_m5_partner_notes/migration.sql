-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PIN';
ALTER TYPE "AuditAction" ADD VALUE 'UNPIN';

-- CreateTable
CREATE TABLE "PartnerNote" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "color" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerNote_partnerId_idx" ON "PartnerNote"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerNote_isDeleted_idx" ON "PartnerNote"("isDeleted");

-- CreateIndex
CREATE INDEX "PartnerNote_isPinned_idx" ON "PartnerNote"("isPinned");

-- AddForeignKey
ALTER TABLE "PartnerNote" ADD CONSTRAINT "PartnerNote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
