-- TreasuryDayClosure rebuilt from a non-blocking review marker into a real
-- cash-drawer reconciliation (owner spec, 2026-08-18): opening balance +
-- inflows - outflows = expected closing balance, vs. actual counted cash,
-- plus reopen tracking. Table has 0 rows in production, so columns are
-- added as NOT NULL directly (no backfill needed) and the old
-- "totalAtClose" summary column is dropped outright.

-- AlterTable
ALTER TABLE "TreasuryDayClosure"
  ADD COLUMN "openingBalance" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "totalInflows" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "totalOutflows" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "expectedClosingBalance" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "actualCountedCash" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "difference" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reopenedById" UUID,
  ADD COLUMN "reopenedAt" TIMESTAMP(3),
  ADD COLUMN "reopenReason" TEXT;

ALTER TABLE "TreasuryDayClosure" DROP COLUMN "totalAtClose";

-- AddForeignKey
ALTER TABLE "TreasuryDayClosure" ADD CONSTRAINT "TreasuryDayClosure_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
