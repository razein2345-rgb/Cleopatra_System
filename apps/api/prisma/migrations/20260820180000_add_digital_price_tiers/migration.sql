-- Owner (2026-08-20) — new tiered pricing structure for the digital
-- printing track: quarter/A4-direct/A3-direct basis, color/BW, and
-- single/double-sided each get an independent, admin-managed quantity
-- tier list. Purely additive — no existing column touched.

-- CreateEnum
CREATE TYPE "DigitalPrintBasis" AS ENUM ('QUARTER', 'A4_DIRECT', 'A3_DIRECT');

-- CreateEnum
CREATE TYPE "DigitalColorMode" AS ENUM ('COLOR', 'BW');

-- CreateEnum
CREATE TYPE "DigitalSides" AS ENUM ('SINGLE', 'DOUBLE');

-- CreateTable
CREATE TABLE "DigitalPriceTier" (
    "id" UUID NOT NULL,
    "basis" "DigitalPrintBasis" NOT NULL,
    "colorMode" "DigitalColorMode" NOT NULL,
    "sides" "DigitalSides" NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "pricePerUnit" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalPriceTier_basis_colorMode_sides_minQuantity_key" ON "DigitalPriceTier"("basis", "colorMode", "sides", "minQuantity");

-- CreateIndex
CREATE INDEX "DigitalPriceTier_basis_colorMode_sides_idx" ON "DigitalPriceTier"("basis", "colorMode", "sides");
