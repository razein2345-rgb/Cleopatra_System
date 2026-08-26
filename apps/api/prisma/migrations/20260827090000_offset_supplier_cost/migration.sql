-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "zincSupplierCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SheetType" ADD COLUMN     "costPrice" DECIMAL(12,2);
