-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_barcode_key" ON "InventoryItem"("barcode");
