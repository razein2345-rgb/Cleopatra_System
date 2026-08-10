-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "partnerId" UUID;

-- Backfill (additive only — UPDATE, no DROP/DELETE): populate partnerId for
-- existing partner-scoped audit rows so the Timeline-readiness column is
-- useful for history that already exists, not just going forward.

-- BusinessPartner audit rows: entityId already IS the partner id
-- (covers CREATE/UPDATE/DELETE/STATUS_CHANGE on the partner itself, plus
-- CATEGORY_CHANGED/TAGS_CHANGED assignment events).
UPDATE "AuditLog" SET "partnerId" = "entityId"
WHERE "entityType" = 'BusinessPartner' AND "partnerId" IS NULL;

-- ContactPerson audit rows: resolve via the ContactPerson row's own partnerId.
UPDATE "AuditLog" a SET "partnerId" = c."partnerId"
FROM "ContactPerson" c
WHERE a."entityType" = 'ContactPerson' AND a."entityId" = c.id AND a."partnerId" IS NULL;

-- PartnerAddress audit rows: resolve via the PartnerAddress row's own partnerId.
UPDATE "AuditLog" a SET "partnerId" = ad."partnerId"
FROM "PartnerAddress" ad
WHERE a."entityType" = 'PartnerAddress' AND a."entityId" = ad.id AND a."partnerId" IS NULL;

-- PartnerNote audit rows: resolve via the PartnerNote row's own partnerId.
UPDATE "AuditLog" a SET "partnerId" = n."partnerId"
FROM "PartnerNote" n
WHERE a."entityType" = 'PartnerNote' AND a."entityId" = n.id AND a."partnerId" IS NULL;

-- CreateIndex
CREATE INDEX "AuditLog_partnerId_createdAt_idx" ON "AuditLog"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
