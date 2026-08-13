-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AdvanceRepaymentMethod" AS ENUM ('CASH', 'SALARY_DEDUCTION');

-- AlterEnum
ALTER TYPE "TreasurySourceType" ADD VALUE 'EMPLOYEE_ADVANCE';
ALTER TYPE "TreasurySourceType" ADD VALUE 'EMPLOYEE_ADVANCE_REPAYMENT';

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN "position" TEXT,
ADD COLUMN "hireDate" TIMESTAMP(3),
ADD COLUMN "payFrequency" "PayFrequency",
ADD COLUMN "baseSalary" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "TreasuryEntry" ADD COLUMN "employeeAdvanceId" UUID,
ADD COLUMN "employeeAdvanceRepaymentId" UUID;

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "recordedById" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvanceRepayment" (
    "id" UUID NOT NULL,
    "advanceId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" "AdvanceRepaymentMethod" NOT NULL,
    "note" TEXT,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvanceRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeAdvance_staffId_idx" ON "EmployeeAdvance"("staffId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_branchId_idx" ON "EmployeeAdvance"("branchId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_isDeleted_idx" ON "EmployeeAdvance"("isDeleted");

-- CreateIndex
CREATE INDEX "EmployeeAdvanceRepayment_advanceId_idx" ON "EmployeeAdvanceRepayment"("advanceId");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryEntry_employeeAdvanceId_key" ON "TreasuryEntry"("employeeAdvanceId");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryEntry_employeeAdvanceRepaymentId_key" ON "TreasuryEntry"("employeeAdvanceRepaymentId");

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_employeeAdvanceId_fkey" FOREIGN KEY ("employeeAdvanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_employeeAdvanceRepaymentId_fkey" FOREIGN KEY ("employeeAdvanceRepaymentId") REFERENCES "EmployeeAdvanceRepayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceRepayment" ADD CONSTRAINT "EmployeeAdvanceRepayment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceRepayment" ADD CONSTRAINT "EmployeeAdvanceRepayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
