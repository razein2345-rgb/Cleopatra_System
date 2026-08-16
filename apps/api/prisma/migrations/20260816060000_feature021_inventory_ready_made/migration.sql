-- Held-stock ready-made merchandise (system_specifications_v2.md, 2026-08-16)
ALTER TYPE "MaterialCategory" ADD VALUE 'READY_MADE';

ALTER TABLE "InventoryItem" ADD COLUMN "salePrice" DECIMAL(12,2);
