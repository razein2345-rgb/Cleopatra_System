-- AlterTable
ALTER TABLE "QuotationItem" DROP COLUMN "quantity",
DROP COLUMN "size",
ADD COLUMN     "itemTotal" DECIMAL(12,2),
ADD COLUMN     "sizeFamilyKey" TEXT,
ADD COLUMN     "realSizeLabel" TEXT;
