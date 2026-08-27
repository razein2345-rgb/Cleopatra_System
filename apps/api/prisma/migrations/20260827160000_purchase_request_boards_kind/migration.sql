-- CreateEnum
CREATE TYPE "PurchaseRequestKind" AS ENUM ('STOCK_SHORTFALL', 'BOARDS_PURCHASE', 'BOARDS_ASSEMBLY');

-- AlterTable
ALTER TABLE "BoardsCatalogItem" ADD COLUMN     "purchaseSupplierId" UUID,
ADD COLUMN     "assemblySupplierId" UUID;

-- CreateIndex
CREATE INDEX "BoardsCatalogItem_purchaseSupplierId_idx" ON "BoardsCatalogItem"("purchaseSupplierId");

-- CreateIndex
CREATE INDEX "BoardsCatalogItem_assemblySupplierId_idx" ON "BoardsCatalogItem"("assemblySupplierId");

-- AddForeignKey
ALTER TABLE "BoardsCatalogItem" ADD CONSTRAINT "BoardsCatalogItem_purchaseSupplierId_fkey" FOREIGN KEY ("purchaseSupplierId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardsCatalogItem" ADD CONSTRAINT "BoardsCatalogItem_assemblySupplierId_fkey" FOREIGN KEY ("assemblySupplierId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "kind" "PurchaseRequestKind" NOT NULL DEFAULT 'STOCK_SHORTFALL',
ADD COLUMN     "boardsCatalogItemId" UUID,
ALTER COLUMN "inventoryItemId" DROP NOT NULL,
ALTER COLUMN "quantityNeeded" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PurchaseRequest_boardsCatalogItemId_idx" ON "PurchaseRequest"("boardsCatalogItemId");

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_boardsCatalogItemId_fkey" FOREIGN KEY ("boardsCatalogItemId") REFERENCES "BoardsCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
