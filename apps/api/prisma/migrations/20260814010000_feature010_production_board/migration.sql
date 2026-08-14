-- AlterTable
ALTER TABLE "Order" ADD COLUMN "requiresDesign" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN "productionTrack" "ProductionTrack";
