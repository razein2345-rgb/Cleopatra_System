-- Per explicit direction: do not enable RLS on `_prisma_migrations`. It is
-- Prisma's own internal migration-bookkeeping table, not an application/
-- business table, and every prior "every table" statement in ADR 0029/
-- VISION.md's Database Security section refers to application tables --
-- this table is the one deliberate, named exception.
--
-- Reversing the previous migration's effect on this table only: no other
-- table is touched. Only the `postgres` role (Prisma itself) ever reads or
-- writes this table, and `postgres` bypasses RLS regardless, so this has
-- zero effect on Prisma's own functionality either way -- it exists purely
-- to keep RLS scoped to application tables, matching intent.
--
-- Residual, accepted fact: the public `anon` key can once again SELECT
-- migration file names/timestamps/checksums from this table via
-- PostgREST -- no business data, low sensitivity, explicitly accepted.

DROP POLICY IF EXISTS "backend_only_deny_direct_access" ON "_prisma_migrations";
ALTER TABLE "_prisma_migrations" DISABLE ROW LEVEL SECURITY;
