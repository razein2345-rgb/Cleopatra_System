-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'SHIPPING', 'OFFICE', 'FACTORY', 'BRANCH', 'WAREHOUSE', 'REGISTERED', 'OTHER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DEFAULT_CHANGED';

-- CreateTable
CREATE TABLE "PartnerAddress" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "country" TEXT,
    "governorate" TEXT,
    "city" TEXT,
    "district" TEXT,
    "street" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "apartment" TEXT,
    "postalCode" TEXT,
    "googleMapsUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerAddress_partnerId_idx" ON "PartnerAddress"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerAddress_isDeleted_idx" ON "PartnerAddress"("isDeleted");

-- CreateIndex
CREATE INDEX "PartnerAddress_type_idx" ON "PartnerAddress"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAddress_partnerId_type_key" ON "PartnerAddress"("partnerId", "type") WHERE ("isDefault" = true AND "isDeleted" = false);

-- CreateIndex
CREATE UNIQUE INDEX "ContactPerson_partnerId_key" ON "ContactPerson"("partnerId") WHERE ("isPrimary" = true AND "isDeleted" = false);

-- AddForeignKey
ALTER TABLE "PartnerAddress" ADD CONSTRAINT "PartnerAddress_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
