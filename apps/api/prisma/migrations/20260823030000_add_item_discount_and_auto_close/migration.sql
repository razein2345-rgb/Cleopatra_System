-- Owner (2026-08-23, "تخفيض على صنف محدد وليس بالضرورة كل الفاتورة" +
-- "ان احدد وقت لما يجي الحساب بيتقفل دايركت") — per-item discount on
-- OrderItem/QuotationItem, and a global auto-close time on Setting +
-- an isAutoClosed marker on TreasuryDayClosure.
ALTER TABLE "OrderItem" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "QuotationItem" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Setting" ADD COLUMN "autoCloseDayTime" TEXT;

ALTER TABLE "TreasuryDayClosure" ADD COLUMN "isAutoClosed" BOOLEAN NOT NULL DEFAULT false;
