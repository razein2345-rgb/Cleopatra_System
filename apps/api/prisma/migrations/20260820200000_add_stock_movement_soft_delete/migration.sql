-- Owner (2026-08-20, "لا عايز اقدر اعدل الحركة واحذفها") — StockMovement
-- gains real edit/delete support. Soft-delete columns matching every other
-- sensitive-delete model in this codebase (isDeleted/deletedAt/deletedBy),
-- plus updatedAt to track edits.
ALTER TABLE "StockMovement" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StockMovement" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "StockMovement" ADD COLUMN "deletedBy" UUID;
ALTER TABLE "StockMovement" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
