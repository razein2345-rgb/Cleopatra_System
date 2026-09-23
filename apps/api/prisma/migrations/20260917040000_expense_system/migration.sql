-- Accounting audit fix (2026-09-17, Decision 6 / Phase I) — dedicated
-- Expense system: a real, individually-tracked business expense with a
-- DUE -> PAID lifecycle, distinct from the pre-existing FixedMonthlyExpense
-- (a pure profitability-report amortization input with no payment lifecycle
-- and no Treasury linkage at all). PAID posts exactly one TreasuryEntry
-- (EXPENSE_PAYMENT); DUE posts nothing.

-- AlterEnum
ALTER TYPE "TreasurySourceType" ADD VALUE 'EXPENSE_PAYMENT';

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DUE', 'PAID');

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "payee" TEXT,
    "reference" TEXT,
    "incurredDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "method" "PaymentMethod",
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DUE',
    "branchId" UUID,
    "recordedById" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_isDeleted_idx" ON "Expense"("isDeleted");

-- CreateIndex
CREATE INDEX "Expense_branchId_idx" ON "Expense"("branchId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- AlterTable
ALTER TABLE "TreasuryEntry" ADD COLUMN "expenseId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryEntry_expenseId_key" ON "TreasuryEntry"("expenseId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
