-- UX_PRODUCT_AUDIT.md § مشكلة 7.3 ("تصنيف مصروفات خزينة قابل للإدارة") —
-- an admin-managed canonical list for TreasuryEntry.category. Purely
-- additive: a new standalone table, mirroring PartnerTag's shape exactly.
-- TreasuryEntry.category itself is untouched (stays a nullable free-text
-- column, no FK, no backfill needed).

-- CreateTable
CREATE TABLE "TreasuryCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryCategory_name_key" ON "TreasuryCategory"("name");

-- CreateIndex
CREATE INDEX "TreasuryCategory_isDeleted_idx" ON "TreasuryCategory"("isDeleted");

-- CreateIndex
CREATE INDEX "TreasuryCategory_isActive_idx" ON "TreasuryCategory"("isActive");
