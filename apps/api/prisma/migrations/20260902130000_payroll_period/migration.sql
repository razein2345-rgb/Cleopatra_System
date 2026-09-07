-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "dailyRate" DECIMAL(12,2),
    "hourlyRate" DECIMAL(12,2),
    "totalAdjustment" DECIMAL(12,2) NOT NULL,
    "grossDue" DECIMAL(12,2) NOT NULL,
    "days" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "reopenedById" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_staffId_periodStart_periodEnd_key" ON "PayrollPeriod"("staffId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollPeriod_staffId_idx" ON "PayrollPeriod"("staffId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_branchId_idx" ON "PayrollPeriod"("branchId");

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN     "payrollPeriodId" UUID;

-- CreateIndex
CREATE INDEX "SalaryPayment_payrollPeriodId_idx" ON "SalaryPayment"("payrollPeriodId");

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (ADR 0029/0030, VISION.md's Database Security "MUST
-- enable RLS on every new application table" rule) — PayrollPeriod is the
-- only new table this migration introduces.
ALTER TABLE "PayrollPeriod" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "PayrollPeriod" FOR ALL TO anon, authenticated USING (false);
