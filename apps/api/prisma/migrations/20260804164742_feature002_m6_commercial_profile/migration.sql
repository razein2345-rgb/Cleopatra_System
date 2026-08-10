-- CreateEnum
CREATE TYPE "PartnerCommercialStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "PartnerRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "PartnerCommercialProfile" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "creditLimit" DECIMAL(12,2),
    "paymentTermsDays" INTEGER,
    "preferredPaymentMethod" "PaymentMethod",
    "priceTier" TEXT,
    "status" "PartnerCommercialStatus" NOT NULL DEFAULT 'ACTIVE',
    "riskLevel" "PartnerRiskLevel",
    "preferredCurrency" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCommercialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommercialProfile_partnerId_key" ON "PartnerCommercialProfile"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerCommercialProfile_status_idx" ON "PartnerCommercialProfile"("status");

-- AddForeignKey
ALTER TABLE "PartnerCommercialProfile" ADD CONSTRAINT "PartnerCommercialProfile_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
