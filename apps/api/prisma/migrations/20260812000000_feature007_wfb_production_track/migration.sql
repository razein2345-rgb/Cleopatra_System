-- CreateEnum
CREATE TYPE "ProductionTrack" AS ENUM ('OFFSET', 'DIGITAL', 'BOARDS_SIGNAGE', 'OTHER_PRODUCTS');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "productionTrack" "ProductionTrack";
