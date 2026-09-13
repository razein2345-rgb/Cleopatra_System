-- AlterTable
ALTER TABLE "TreasuryCategory" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "calculateByQuantity" BOOLEAN NOT NULL DEFAULT false;
