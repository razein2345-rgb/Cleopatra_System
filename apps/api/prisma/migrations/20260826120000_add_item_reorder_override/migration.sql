-- CreateTable
CREATE TABLE "ItemReorderOverride" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "dailyConsumptionRate" DOUBLE PRECISION,
    "manualNextDate" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemReorderOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemReorderOverride_partnerId_idx" ON "ItemReorderOverride"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemReorderOverride_partnerId_itemKey_key" ON "ItemReorderOverride"("partnerId", "itemKey");

-- AddForeignKey
ALTER TABLE "ItemReorderOverride" ADD CONSTRAINT "ItemReorderOverride_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
