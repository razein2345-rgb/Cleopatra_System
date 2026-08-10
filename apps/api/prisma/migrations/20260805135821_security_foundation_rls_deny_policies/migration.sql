-- Row Level Security: explicit deny-all policy for anon/authenticated on every
-- public-schema table (Security Foundation finalization).
--
-- Every table in this schema is backend-only (see ADR 0028's Defense-in-Depth
-- extension and VISION.md's Database Security section) -- the Express API,
-- authenticated via Prisma as the `postgres` role, is the only legitimate
-- writer/reader. `postgres` and `service_role` both carry BYPASSRLS, so this
-- migration has zero effect on the backend; it exists solely to close the
-- direct-PostgREST exposure via the public `anon` key and any `authenticated`
-- session token.
--
-- Deliberately explicit (ENABLE + a named, visible deny policy) rather than
-- relying on "RLS enabled, zero policies = implicit deny" -- the policy is
-- self-documenting in `pg_policies` for any future auditor.
--
-- No GRANT/REVOKE statements here by design -- anon/authenticated keep their
-- existing table grants; the policy alone is what blocks them. Additive only:
-- no DROP, no data change, fully reversible per table via
-- `DROP POLICY "backend_only_deny_direct_access" ON "<table>"` +
-- `ALTER TABLE "<table>" DISABLE ROW LEVEL SECURITY`.

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Attachment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "AuditLog" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Branch" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "BusinessPartner" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "BusinessPartner" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "BusinessPartnerTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "BusinessPartnerTag" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ContactPerson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ContactPerson" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "DocumentSequence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "DocumentSequence" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "InventoryItem" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Order" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "OrderItem" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "PartnerAddress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PartnerAddress" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "PartnerCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PartnerCategory" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "PartnerCommercialProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PartnerCommercialProfile" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "PartnerNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PartnerNote" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "PartnerTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PartnerTag" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Payment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Permission" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Quotation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Quotation" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "QuotationItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "QuotationItem" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "ReadyProduct" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "ReadyProduct" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Role" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "RolePermission" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Service" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Setting" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SheetType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SheetType" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SizeFamily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SizeFamily" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SizeFamilyEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SizeFamilyEntry" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "StaffProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "StaffProfile" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "StockLevel" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "StockMovement" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SupplierPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SupplierPayment" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SupplierPurchase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SupplierPurchase" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "Tender" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Tender" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "TreasuryEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "TreasuryEntry" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "UserBranchAccess" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "UserBranchAccess" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "UserRole" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkOrder" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "_prisma_migrations" FOR ALL TO anon, authenticated USING (false);
