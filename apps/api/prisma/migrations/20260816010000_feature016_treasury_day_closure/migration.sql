-- CreateTable
CREATE TABLE "TreasuryDayClosure" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "closedById" UUID NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAtClose" DECIMAL(12,2) NOT NULL,
    "entryCountAtClose" INTEGER NOT NULL,

    CONSTRAINT "TreasuryDayClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryDayClosure_branchId_date_key" ON "TreasuryDayClosure"("branchId", "date");

-- CreateIndex
CREATE INDEX "TreasuryDayClosure_branchId_idx" ON "TreasuryDayClosure"("branchId");

-- AddForeignKey
ALTER TABLE "TreasuryDayClosure" ADD CONSTRAINT "TreasuryDayClosure_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryDayClosure" ADD CONSTRAINT "TreasuryDayClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
