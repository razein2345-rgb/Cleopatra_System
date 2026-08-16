-- Multi-material pricing for NOTEBOOK/DIGITAL items (2026-08-17). A single
-- Order Item can now consume multiple materials (notebook original/copy/
-- second copy, or arbitrary digital components like cover/interior), each
-- with its own InventoryItem/price/sheet count. OrderItem.inventoryItemId/
-- sheetsConsumed stay untouched for every other kind (LOOSE_PAPER/FOLDER/...)
-- — this table is purely additive, no existing column is modified. Order/
-- OrderItem tables verified empty at deploy time, so no backfill needed.

CREATE TABLE "OrderItemMaterial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderItemId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "inventoryItemId" UUID NOT NULL,
    "paperName" TEXT NOT NULL,
    "sheetPrice" DECIMAL(12,2) NOT NULL,
    "sheetsConsumed" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemMaterial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderItemMaterial_orderItemId_idx" ON "OrderItemMaterial"("orderItemId");
CREATE INDEX "OrderItemMaterial_inventoryItemId_idx" ON "OrderItemMaterial"("inventoryItemId");

ALTER TABLE "OrderItemMaterial" ADD CONSTRAINT "OrderItemMaterial_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItemMaterial" ADD CONSTRAINT "OrderItemMaterial_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
