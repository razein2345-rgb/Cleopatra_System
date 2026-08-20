-- Links a quick-sale TreasuryEntry back to the StockMovement it was paired
-- with, so editing/deleting the movement can cascade to the entry.
ALTER TABLE "TreasuryEntry" ADD COLUMN "stockMovementId" UUID;
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_stockMovementId_key" UNIQUE ("stockMovementId");
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
