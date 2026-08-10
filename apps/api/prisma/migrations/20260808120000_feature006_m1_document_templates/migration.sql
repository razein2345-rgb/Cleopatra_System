-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "businessNameAr" TEXT,
ADD COLUMN     "businessNameEn" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "commercialRegisterNumber" TEXT;

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" UUID,
    "publishedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "documentTemplateId" UUID,
ADD COLUMN     "documentOverrides" JSONB,
ADD COLUMN     "documentSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "documentTemplateId" UUID,
ADD COLUMN     "documentOverrides" JSONB,
ADD COLUMN     "documentSnapshot" JSONB;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "documentTemplateId" UUID,
ADD COLUMN     "documentOverrides" JSONB,
ADD COLUMN     "documentSnapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_previousVersionId_key" ON "DocumentTemplate"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_documentType_key" ON "DocumentTemplate"("documentType") WHERE ("isDefault" = true AND "isDeleted" = false);

-- CreateIndex
CREATE INDEX "DocumentTemplate_isDeleted_idx" ON "DocumentTemplate"("isDeleted");

-- CreateIndex
CREATE INDEX "DocumentTemplate_documentType_idx" ON "DocumentTemplate"("documentType");

-- CreateIndex
CREATE INDEX "Quotation_documentTemplateId_idx" ON "Quotation"("documentTemplateId");

-- CreateIndex
CREATE INDEX "Order_documentTemplateId_idx" ON "Order"("documentTemplateId");

-- CreateIndex
CREATE INDEX "WorkOrder_documentTemplateId_idx" ON "WorkOrder"("documentTemplateId");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (ADR 0029/0030, VISION.md's Database Security "MUST
-- enable RLS on every new application table" rule) — DocumentTemplate is
-- the only new table this migration introduces; Setting/Quotation/Order/
-- WorkOrder already have RLS enabled from earlier migrations and are
-- untouched here.
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "DocumentTemplate" FOR ALL TO anon, authenticated USING (false);
