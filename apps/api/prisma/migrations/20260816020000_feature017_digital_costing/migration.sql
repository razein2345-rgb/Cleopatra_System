-- AlterTable
ALTER TABLE "Setting"
  ADD COLUMN "digitalPrintPricePerQuarter" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "digitalSellophanePricePerQuarter" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "digitalQuarterWidthCm" DECIMAL(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN "digitalQuarterHeightCm" DECIMAL(6,2) NOT NULL DEFAULT 35;
