# Rollback Plan — `20260921195220_opening_state_cutover`

Reference doc, written and reviewed **before** `prisma migrate deploy` was run for this
migration, so the recovery steps are available immediately during a real incident instead of
needing to be reconstructed from a chat transcript. Owner reviewed and approved this exact plan
on 2026-09-21 before authorizing the deploy.

Migration file: `apps/api/prisma/migrations/20260921195220_opening_state_cutover/migration.sql`
(schema for `CutoverRecord`, `TreasuryOpening`, `CustomerOpening`, `SupplierOpening`,
`InventoryOpening` + 3 new columns on `Order`/`Payment`/`StockMovement` + the
`backend_only_deny_direct_access` RLS policy on all 5 new tables, in the same file).

---

## Scenario A — fails mid-apply (transaction aborts)

Postgres DDL is transactional, and Prisma wraps each migration file in a single transaction when
applying to Postgres. Nothing in this migration breaks that (no `CREATE INDEX CONCURRENTLY`, no
`ALTER TYPE ... ADD VALUE` outside a transaction — the 3 enums are each created fresh with all
values in one `CREATE TYPE ... AS ENUM`, fully transactional). A failure partway through means
**Postgres auto-rolls back the whole statement batch — zero partial state, guaranteed**, not
just likely.

What you'll see: `_prisma_migrations` gets a row for this migration with `finished_at = NULL`
and the error captured in `logs` — Prisma's own bookkeeping already knows it didn't apply.

Recovery steps (no manual `DROP` needed — nothing committed):

1. `npx prisma migrate status` — confirms it's listed as failed, not applied.
2. Diagnose the actual error from the logs.
3. `npx prisma migrate resolve --rolled-back 20260921195220_opening_state_cutover` — clears the
   failed record so Prisma's history is clean.
4. Fix `migration.sql`, retry `migrate deploy`.

---

## Scenario B — succeeds, but a problem surfaces minutes/hours later

Prisma does not auto-generate down-migrations, so this is the exact down-script, reversing the
up-migration in the opposite order:

```sql
-- 1. Drop RLS policies + disable RLS (5 new tables)
DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "InventoryOpening";
ALTER TABLE "InventoryOpening" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "SupplierOpening";
ALTER TABLE "SupplierOpening" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "CustomerOpening";
ALTER TABLE "CustomerOpening" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "TreasuryOpening";
ALTER TABLE "TreasuryOpening" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "CutoverRecord";
ALTER TABLE "CutoverRecord" DISABLE ROW LEVEL SECURITY;

-- 2. Drop the FKs added to EXISTING tables (must go before dropping their targets)
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_orderId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_inventoryOpeningId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_customerOpeningId_fkey";

-- 3. Drop the indexes added to EXISTING tables
DROP INDEX IF EXISTS "StockMovement_inventoryOpeningId_key";
DROP INDEX IF EXISTS "Order_customerOpeningId_idx";

-- 4. Drop the 5 new tables (CASCADE cleans up their own internal FKs/indexes)
DROP TABLE IF EXISTS "InventoryOpening" CASCADE;
DROP TABLE IF EXISTS "SupplierOpening" CASCADE;
DROP TABLE IF EXISTS "CustomerOpening" CASCADE;
DROP TABLE IF EXISTS "TreasuryOpening" CASCADE;
DROP TABLE IF EXISTS "CutoverRecord" CASCADE;

-- 5. Drop the columns added to EXISTING tables
ALTER TABLE "StockMovement" DROP COLUMN IF EXISTS "orderId";
ALTER TABLE "StockMovement" DROP COLUMN IF EXISTS "inventoryOpeningId";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "sourceType";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "customerOpeningId";

-- 6. Drop the 3 enum types (must be last -- nothing references them anymore)
DROP TYPE IF EXISTS "PaymentSourceType";
DROP TYPE IF EXISTS "VerificationStatus";
DROP TYPE IF EXISTS "CutoverStatus";
```

Then run:

```bash
npx prisma migrate resolve --rolled-back 20260921195220_opening_state_cutover
```

so `_prisma_migrations` stops claiming this migration is applied — otherwise a future
`migrate deploy`/`migrate dev` gets confused about drift.

### Mandatory pre-flight check before running the down-script

Every new column added by this migration is nullable or has a safe default
(`Payment.sourceType` backfills existing rows to `'NORMAL'` via Postgres's fast metadata-only
default-add — no table rewrite, no data risk), so the down-script costs **zero existing data**
in `Order`/`Payment`/`StockMovement`. The only place real data could exist is the 5 brand-new
tables themselves, if the Cutover feature was actually used in the window between deploy and
the rollback decision. Before running step 4 above, always check first:

```sql
SELECT
  (SELECT count(*) FROM "CutoverRecord") AS cutover,
  (SELECT count(*) FROM "TreasuryOpening") AS treasury,
  (SELECT count(*) FROM "CustomerOpening") AS customer,
  (SELECT count(*) FROM "SupplierOpening") AS supplier,
  (SELECT count(*) FROM "InventoryOpening") AS inventory;
```

- **All zero** → the drops above are lossless, safe to run as-is.
- **Any non-zero** → stop. Either back up those specific rows first
  (`pg_dump -t '"CutoverRecord"' ...` per table with real rows) or reconsider whether a rollback
  or a forward-fix is the right call, since dropping at that point destroys real opening-state
  entries someone already entered.
