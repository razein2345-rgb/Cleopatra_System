-- CreateTable
CREATE TABLE "BoardsCatalogItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "supplierCost" DECIMAL(12,2),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardsCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardsCatalogItem_isDeleted_idx" ON "BoardsCatalogItem"("isDeleted");

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "boardsCatalogItemId" UUID;

-- CreateIndex
CREATE INDEX "OrderItem_boardsCatalogItemId_idx" ON "OrderItem"("boardsCatalogItemId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_boardsCatalogItemId_fkey" FOREIGN KEY ("boardsCatalogItemId") REFERENCES "BoardsCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "boardsCatalogItemId" UUID;

-- CreateIndex
CREATE INDEX "QuotationItem_boardsCatalogItemId_idx" ON "QuotationItem"("boardsCatalogItemId");

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_boardsCatalogItemId_fkey" FOREIGN KEY ("boardsCatalogItemId") REFERENCES "BoardsCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (ADR 0029/0030, VISION.md's Database Security "MUST
-- enable RLS on every new application table" rule) — BoardsCatalogItem is
-- the only new table this migration introduces; OrderItem/QuotationItem
-- already have RLS enabled from earlier migrations and are untouched here.
ALTER TABLE "BoardsCatalogItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "BoardsCatalogItem" FOR ALL TO anon, authenticated USING (false);
