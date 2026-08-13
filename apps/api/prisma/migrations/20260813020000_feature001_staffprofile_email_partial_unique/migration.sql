-- A plain unique index on email permanently blocked that email once its
-- StaffProfile was soft-deleted (found live 2026-08-13: two stuck test
-- invites could never be re-added). Scope uniqueness to non-deleted rows
-- only, same pattern already used by ContactPerson/PartnerAddress.
DROP INDEX "StaffProfile_email_key";
CREATE UNIQUE INDEX "StaffProfile_email_key" ON "StaffProfile"("email") WHERE ("isDeleted" = false);
