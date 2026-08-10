-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sizeFamilyKey" TEXT,
ADD COLUMN     "realSizeLabel" TEXT,
ADD COLUMN     "inventoryItemId" UUID,
ADD COLUMN     "sheetsConsumed" DECIMAL(14,3);

-- CreateIndex
CREATE INDEX "OrderItem_inventoryItemId_idx" ON "OrderItem"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
