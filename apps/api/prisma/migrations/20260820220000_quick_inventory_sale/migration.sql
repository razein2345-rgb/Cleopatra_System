-- Owner (2026-08-20, "لو حد خد صنف بسيط من قسم بضاعة من المخزون مش مضطر
-- اطلع عليه فاتورة وعايزة يتسجل في حركة الخزينة ويخصمه من المخزن") — a
-- one-step cash sale with no Order/invoice: pairs a StockMovement (OUT)
-- with a TreasuryEntry atomically.

ALTER TYPE "TreasurySourceType" ADD VALUE 'QUICK_SALE';
