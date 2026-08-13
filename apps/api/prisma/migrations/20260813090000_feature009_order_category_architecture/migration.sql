-- AlterEnum
ALTER TYPE "ServiceCategory" ADD VALUE 'WEBSITES';
ALTER TYPE "ServiceCategory" ADD VALUE 'PHOTOGRAPHY';
ALTER TYPE "ServiceCategory" ADD VALUE 'MARKETING';

-- AlterEnum
ALTER TYPE "ProductionTrack" ADD VALUE 'SERVICES';
ALTER TYPE "ProductionTrack" ADD VALUE 'READY_PRODUCTS';

-- CreateEnum
CREATE TYPE "ProductSourceType" AS ENUM ('INTERNAL_PRODUCTION', 'EXTERNAL_SUPPLIER');

-- AlterTable
ALTER TABLE "ReadyProduct" ADD COLUMN "sourceType" "ProductSourceType";
