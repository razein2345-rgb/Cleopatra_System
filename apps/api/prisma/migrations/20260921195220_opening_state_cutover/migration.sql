-- Opening State / Cutover (Phase 3A/3A.1/3B/3B.1). Generated via
-- `prisma migrate diff --from-config-datasource --to-schema` against the
-- live database (the shadow-database path used by `migrate dev` failed --
-- see this migration's own review notes -- the existing
-- 20260805135821_security_foundation_rls_deny_policies migration's SQL
-- directly manipulates `_prisma_migrations`, which confuses shadow-db
-- bootstrap ordering), then hand-curated: the raw diff also contained
-- unrelated, pre-existing schema drift from separate, still-uncommitted
-- work (Expense system, supplier-accounting fixes, order-item-return-
-- history-fix) -- 6 FK onDelete-behavior mismatches, 4 unrelated dropped
-- indexes, and 5 unrelated `DROP DEFAULT` statements -- all excluded here,
-- confirmed independent (different constraint names/columns, no overlap
-- with anything below) and left for that other work's own migration
-- whenever it is reviewed. A genuinely new gap was also found while
-- verifying this diff -- OrderItemReturn.orderId has no FK/index live at
-- all -- recorded in docs/AI/BUGS/KNOWN_ISSUES.md, not fixed here either.
--
-- Includes the same backend_only_deny_direct_access RLS pattern (ADR
-- 0029) for all 5 new tables in this same migration, deliberately --
-- the 2026-09-21 audit found 27 tables that shipped without it because
-- schema and security landed in separate steps; this migration does not
-- repeat that.

-- CreateEnum
CREATE TYPE "CutoverStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('NORMAL', 'OPENING_CREDIT_APPLICATION');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerOpeningId" UUID;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "sourceType" "PaymentSourceType" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "inventoryOpeningId" UUID,
ADD COLUMN     "orderId" UUID;

-- CreateTable
CREATE TABLE "CutoverRecord" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "lastManualDate" DATE NOT NULL,
    "goLiveDate" DATE NOT NULL,
    "status" "CutoverStatus" NOT NULL DEFAULT 'DRAFT',
    "isSuperseded" BOOLEAN NOT NULL DEFAULT false,
    "supersededById" UUID,
    "supersededAt" TIMESTAMP(3),
    "supersededReason" TEXT,
    "createdById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "activatedById" UUID,
    "activatedAt" TIMESTAMP(3),
    "reopenedById" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "notes" TEXT,
    "selfApprovedException" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CutoverRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryOpening" (
    "id" UUID NOT NULL,
    "cutoverId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "enteredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOpening" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "receivableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CutoverStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "reopenedById" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "enteredById" UUID NOT NULL,
    "creditCorrectedById" UUID,
    "creditCorrectedAt" TIMESTAMP(3),
    "creditCorrectionReason" TEXT,
    "selfApprovedException" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOpening" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "payableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CutoverStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "reopenedById" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "enteredById" UUID NOT NULL,
    "selfApprovedException" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOpening" (
    "id" UUID NOT NULL,
    "cutoverId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCostAtOpening" DECIMAL(12,2),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "enteredById" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CutoverRecord_branchId_idx" ON "CutoverRecord"("branchId");

-- CreateIndex
CREATE INDEX "CutoverRecord_status_idx" ON "CutoverRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CutoverRecord_branchId_key" ON "CutoverRecord"("branchId") WHERE ("isSuperseded" = false);

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryOpening_cutoverId_method_key" ON "TreasuryOpening"("cutoverId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOpening_partnerId_key" ON "CustomerOpening"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOpening_partnerId_key" ON "SupplierOpening"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOpening_cutoverId_inventoryItemId_key" ON "InventoryOpening"("cutoverId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "Order_customerOpeningId_idx" ON "Order"("customerOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_inventoryOpeningId_key" ON "StockMovement"("inventoryOpeningId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerOpeningId_fkey" FOREIGN KEY ("customerOpeningId") REFERENCES "CustomerOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryOpeningId_fkey" FOREIGN KEY ("inventoryOpeningId") REFERENCES "InventoryOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoverRecord" ADD CONSTRAINT "CutoverRecord_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOpening" ADD CONSTRAINT "TreasuryOpening_cutoverId_fkey" FOREIGN KEY ("cutoverId") REFERENCES "CutoverRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOpening" ADD CONSTRAINT "TreasuryOpening_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOpening" ADD CONSTRAINT "CustomerOpening_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOpening" ADD CONSTRAINT "CustomerOpening_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOpening" ADD CONSTRAINT "CustomerOpening_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOpening" ADD CONSTRAINT "CustomerOpening_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOpening" ADD CONSTRAINT "CustomerOpening_creditCorrectedById_fkey" FOREIGN KEY ("creditCorrectedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOpening" ADD CONSTRAINT "SupplierOpening_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOpening" ADD CONSTRAINT "SupplierOpening_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOpening" ADD CONSTRAINT "SupplierOpening_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOpening" ADD CONSTRAINT "SupplierOpening_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpening" ADD CONSTRAINT "InventoryOpening_cutoverId_fkey" FOREIGN KEY ("cutoverId") REFERENCES "CutoverRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpening" ADD CONSTRAINT "InventoryOpening_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpening" ADD CONSTRAINT "InventoryOpening_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: same backend_only_deny_direct_access pattern as ADR 0029, in this
-- same migration, for all 5 new tables -- deliberately not a follow-up
-- step (see this migration's header comment).

ALTER TABLE "CutoverRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "CutoverRecord" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "TreasuryOpening" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "TreasuryOpening" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "CustomerOpening" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "CustomerOpening" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "SupplierOpening" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "SupplierOpening" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "InventoryOpening" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "InventoryOpening" FOR ALL TO anon, authenticated USING (false);
