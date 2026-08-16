-- "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — one Order can now span
-- multiple production tracks (one Work Order per track, not one for the
-- whole order). No existing production data at deploy time (verified:
-- Order/WorkOrder/OrderItem all empty), so this ships as a single
-- migration with no backfill step required.

-- 1. WorkOrder.orderId: was @unique (exactly one Work Order per Order).
--    Relax to a plain indexed FK.
DROP INDEX "WorkOrder_orderId_key";
CREATE INDEX "WorkOrder_orderId_idx" ON "WorkOrder"("orderId");

-- 2. WorkOrder.productionTrack — frozen per Work Order (table is empty, so
--    NOT NULL is safe with no default/backfill needed).
ALTER TABLE "WorkOrder" ADD COLUMN "productionTrack" "ProductionTrack" NOT NULL;

-- 3. OrderItem: per-item track (frozen at creation) + link to the Work
--    Order that's producing it (null until that Work Order exists, or
--    permanently null for items with no resolvable track).
ALTER TABLE "OrderItem" ADD COLUMN "productionTrack" "ProductionTrack";
ALTER TABLE "OrderItem" ADD COLUMN "workOrderId" UUID;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "OrderItem_workOrderId_idx" ON "OrderItem"("workOrderId");
CREATE INDEX "OrderItem_orderId_productionTrack_idx" ON "OrderItem"("orderId", "productionTrack");

-- 4. QuotationItem: mirrors OrderItem.productionTrack so a quotation
--    converted to an order carries each item's own track forward instead
--    of losing it (previously no track concept existed on quotations at
--    all, making auto work-order creation on conversion a silent no-op).
ALTER TABLE "QuotationItem" ADD COLUMN "productionTrack" "ProductionTrack";

-- 5. Order: productionTrack/requiresDesign are now meaningless at the
--    order level (superseded by OrderItem.productionTrack and the
--    transient per-track requiresDesignByTrack request field). No data to
--    lose — table is empty.
ALTER TABLE "Order" DROP COLUMN "productionTrack";
ALTER TABLE "Order" DROP COLUMN "requiresDesign";
