-- AlterTable
ALTER TABLE "TreasuryEntry" ADD COLUMN     "method" "PaymentMethod";

-- Backfill existing INVOICE_PAYMENT entries from their linked Payment row.
-- Pre-existing MANUAL entries (recorded before this column existed) stay
-- NULL — there is no source of truth for which wallet they used.
UPDATE "TreasuryEntry" AS te
SET "method" = p."method"
FROM "Payment" AS p
WHERE te."paymentId" = p."id" AND te."method" IS NULL;
