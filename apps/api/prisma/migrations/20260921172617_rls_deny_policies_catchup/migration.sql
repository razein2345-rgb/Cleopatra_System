-- Row Level Security: catch-up deny-all policy for anon/authenticated on
-- every public-schema table added since the original Security Foundation
-- migration (20260805135821_security_foundation_rls_deny_policies, ADR
-- 0029). Same pattern, zero deviation -- these 27 tables were added after
-- that migration and never received the now-mandatory RLS treatment
-- (VISION.md's Database Security section, MASTER_PROMPT.md's Database
-- Checklist, ADR 0030), discovered by a live audit on 2026-09-21 using
-- the public anon key against Supabase's auto-generated PostgREST API.
--
-- postgres and service_role both carry BYPASSRLS, so this migration has
-- zero effect on the backend (Prisma via DATABASE_URL, supabaseAdmin via
-- SUPABASE_SERVICE_ROLE_KEY); it exists solely to close the direct-
-- PostgREST exposure via the public anon key and any authenticated
-- session token. No GRANT/REVOKE statements -- the policy alone blocks
-- access regardless of existing grants. Additive only: no DROP, no data
-- change, fully reversible per table via
-- `DROP POLICY "backend_only_deny_direct_access" ON "<table>"` +
-- `ALTER TABLE "<table>" DISABLE ROW LEVEL SECURITY`.
--
-- _prisma_migrations remains deliberately exempt, per
-- 20260805142832_prisma_migrations_rls_exempt -- Prisma's own internal
-- bookkeeping table, not an application table.

ALTER TABLE "AttendanceEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "AttendanceEntry" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "CallLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "CallLog" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Campaign" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "CommunicationHubLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "CommunicationHubLink" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ContentCalendarEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ContentCalendarEntry" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "DigitalPriceTier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "DigitalPriceTier" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "EmployeeAdvance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "EmployeeAdvance" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "EmployeeAdvanceRepayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "EmployeeAdvanceRepayment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Expense" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ExtraServiceOption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ExtraServiceOption" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "FieldAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "FieldAssignment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "FixedMonthlyExpense" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "FixedMonthlyExpense" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "IdempotencyKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "IdempotencyKey" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "InventoryCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "InventoryCategory" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ItemReorderOverride" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ItemReorderOverride" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ItemSupplierTask" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ItemSupplierTask" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Lead" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Machine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Machine" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "OrderItemGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "OrderItemGroup" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "OrderItemMaterial" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "OrderItemMaterial" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "OrderItemReturn" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "OrderItemReturn" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "OrderTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "OrderTemplate" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "QuotationItemGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "QuotationItemGroup" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SalaryPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SalaryPayment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "TreasuryCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "TreasuryCategory" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "TreasuryDayClosure" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "TreasuryDayClosure" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "TrustedDevice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "TrustedDevice" FOR ALL TO anon, authenticated USING (false);
