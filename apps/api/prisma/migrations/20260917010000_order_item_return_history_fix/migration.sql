-- Accounting audit fix (2026-09-17) — OrderItemReturn history must survive
-- an order edit. `updateOrder` replaces every OrderItem on every save
-- (delete + recreate), which previously cascade-hard-deleted any
-- OrderItemReturn tied to a replaced item, permanently destroying refund
-- history and silently reverting `Order.netTotal` upward.
--
-- Fix: give OrderItemReturn a direct, denormalized `orderId` link (so the
-- row's own order stays traceable even once detached from its OrderItem),
-- and change `orderItemId` from a required Cascade FK to a nullable
-- SetNull FK (an edit now detaches the return from its old item instead of
-- destroying the row).
--
-- Data safety: every existing OrderItemReturn row today has a live,
-- non-orphaned `orderItemId` (this bug has never yet had a chance to
-- destroy a row — this migration is what prevents the first occurrence),
-- so the backfill below is a 100% reliable, exact derivation with zero
-- ambiguous/unmappable rows. No historical `quantity`/`refundAmount`/
-- `reason`/`treasuryEntry` data is touched.

-- 1. Add the new column, nullable for now so the backfill can populate it.
ALTER TABLE "OrderItemReturn" ADD COLUMN "orderId" UUID;

-- 2. Backfill from the still-intact orderItemId -> OrderItem.orderId.
UPDATE "OrderItemReturn" r
SET "orderId" = oi."orderId"
FROM "OrderItem" oi
WHERE r."orderItemId" = oi."id";

-- 3. Now that every row is populated, enforce NOT NULL.
ALTER TABLE "OrderItemReturn" ALTER COLUMN "orderId" SET NOT NULL;

-- 4. FK + index for the new column (Restrict, matching the identity-field
--    convention already used for OrderItemReturn.staffId/branchId-style
--    relations elsewhere in this schema — an Order is only ever
--    soft-deleted, so this constraint is not expected to ever block a
--    real deletion).
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OrderItemReturn_orderId_idx" ON "OrderItemReturn"("orderId");

-- 5. Change orderItemId from required+Cascade to nullable+SetNull.
ALTER TABLE "OrderItemReturn" DROP CONSTRAINT "OrderItemReturn_orderItemId_fkey";
ALTER TABLE "OrderItemReturn" ALTER COLUMN "orderItemId" DROP NOT NULL;
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
