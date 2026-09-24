-- Accounting audit (2026-09-17) — Decisions 1-3 + Fix E.
--
-- Data safety note (revised after the first apply attempt failed): a direct
-- query against production found exactly ONE row each in SupplierPurchase
-- and SupplierPayment — both soft-deleted, same partnerId, same date
-- (2026-08-26), and SupplierPurchase's own `description` literally reads
-- "اختبار حي — هيتم حذفه فورًا" ("live test — will be deleted immediately")
-- — leftover verification data from the original supplier-ledger feature
-- build (tekmila 44-46) that was soft-deleted but never actually purged.
-- Per this task's explicit rule against guessing an unmappable historical
-- row's branch/method, `method`/`branchId` below are added NULLABLE (not
-- required) so these two rows are left untouched with NULL in the new
-- columns; the application layer enforces both as required for every NEW
-- purchase/payment going forward (see supplierLedgerService.ts).

-- Decision 1 — SupplierPayment becomes a real Treasury cash outflow.
-- (TreasurySourceType.SUPPLIER_PAYMENT was already added successfully on
-- the first, partially-failed apply attempt — Postgres ADD VALUE is
-- idempotent-safe to skip if already present, so it is not repeated here.)

ALTER TABLE "SupplierPayment" ADD COLUMN "method" "PaymentMethod";

ALTER TABLE "TreasuryEntry" ADD COLUMN "supplierPaymentId" UUID;
CREATE UNIQUE INDEX "TreasuryEntry_supplierPaymentId_key" ON "TreasuryEntry"("supplierPaymentId");
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Decision 2 — SupplierPurchase/SupplierPayment activity becomes
-- branch-scoped (the BusinessPartner supplier record itself stays shared).
ALTER TABLE "SupplierPurchase" ADD COLUMN "branchId" UUID;
CREATE INDEX "SupplierPurchase_branchId_idx" ON "SupplierPurchase"("branchId");
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierPayment" ADD COLUMN "branchId" UUID;
CREATE INDEX "SupplierPayment_branchId_idx" ON "SupplierPayment"("branchId");
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Decision 3 — ItemSupplierTask.cost becomes a real payable once RECEIVED.
-- Idempotency key is this unique FK itself (one task -> at most one
-- purchase), deliberately independent of SupplierPurchase.workOrderId so
-- the two auto-booking mechanisms (this one and the BOARDS one) can never
-- collide on the same key.
ALTER TABLE "SupplierPurchase" ADD COLUMN "itemSupplierTaskId" UUID;
CREATE UNIQUE INDEX "SupplierPurchase_itemSupplierTaskId_key" ON "SupplierPurchase"("itemSupplierTaskId");
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_itemSupplierTaskId_fkey" FOREIGN KEY ("itemSupplierTaskId") REFERENCES "ItemSupplierTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
