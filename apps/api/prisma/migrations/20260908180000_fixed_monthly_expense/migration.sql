-- CreateTable
CREATE TABLE "FixedMonthlyExpense" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "branchId" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedMonthlyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedMonthlyExpense_isDeleted_idx" ON "FixedMonthlyExpense"("isDeleted");

-- CreateIndex
CREATE INDEX "FixedMonthlyExpense_branchId_idx" ON "FixedMonthlyExpense"("branchId");

-- AddForeignKey
ALTER TABLE "FixedMonthlyExpense" ADD CONSTRAINT "FixedMonthlyExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
