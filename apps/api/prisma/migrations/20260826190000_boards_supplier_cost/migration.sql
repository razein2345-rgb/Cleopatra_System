-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "boardsBannerSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "boardsVinylPrintCutSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "boardsVinylNormalSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "boardsFlexSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "boardsSeasroSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
