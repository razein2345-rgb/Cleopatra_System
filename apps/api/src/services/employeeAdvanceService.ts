import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateAdvanceRepaymentInput, CreateEmployeeAdvanceInput, EmployeeAdvance, EmployeeAdvanceSummary } from '@cleopatra/shared';
import { computeEmployeePayroll } from './employeePayrollService.js';
import { assertBranchDayNotClosed } from './treasuryService.js';

/**
 * FEATURE-008 (2026-08-13, owner: "إدارة السلف هتبقى من الخزينة ولا من قسم
 * الموظفين؟"). The advance record is owned here (Employees), not Treasury —
 * but giving one moves real cash, so it's created atomically with a
 * TreasuryEntry, the same Payment+TreasuryEntry pattern `orderService`'s
 * `recordPayment` already uses. A repayment either returns cash (same
 * atomic pattern, INCOME) or is a salary deduction (recorded only — this
 * system has no payroll run to pay out against, so there is nothing for a
 * deduction to move through Treasury).
 */

const advanceInclude = { repayments: true } satisfies Prisma.EmployeeAdvanceInclude;
type AdvanceWithRepayments = Prisma.EmployeeAdvanceGetPayload<{ include: typeof advanceInclude }>;

export class EmployeeAdvanceNotFoundError extends Error {
  constructor() {
    super('Advance not found');
    this.name = 'EmployeeAdvanceNotFoundError';
  }
}

export class AdvanceRepaymentExceedsBalanceError extends Error {
  constructor() {
    super('قيمة السداد أكبر من المتبقي على السلفة');
    this.name = 'AdvanceRepaymentExceedsBalanceError';
  }
}

export class MissingWalletMethodError extends Error {
  constructor() {
    super('اختر المحفظة التي استُلم فيها المبلغ نقدًا');
    this.name = 'MissingWalletMethodError';
  }
}

export function mapAdvanceToDto(advance: AdvanceWithRepayments): EmployeeAdvance {
  const repaidAmount = advance.repayments.reduce((sum, r) => sum + r.amount.toNumber(), 0);
  return {
    id: advance.id,
    staffId: advance.staffId,
    branchId: advance.branchId,
    amount: advance.amount.toNumber(),
    date: advance.date.toISOString(),
    reason: advance.reason,
    recordedById: advance.recordedById,
    repayments: advance.repayments.map((r) => ({
      id: r.id,
      advanceId: r.advanceId,
      amount: r.amount.toNumber(),
      date: r.date.toISOString(),
      method: r.method,
      note: r.note,
      recordedById: r.recordedById,
      createdAt: r.createdAt.toISOString(),
    })),
    repaidAmount,
    remainingBalance: advance.amount.toNumber() - repaidAmount,
    createdAt: advance.createdAt.toISOString(),
    updatedAt: advance.updatedAt.toISOString(),
  };
}

export async function listAdvancesForStaff(staffId: string): Promise<EmployeeAdvance[]> {
  const advances = await prisma.employeeAdvance.findMany({
    where: { staffId, isDeleted: false },
    include: advanceInclude,
    orderBy: { date: 'desc' },
  });
  return advances.map(mapAdvanceToDto);
}

export async function createAdvance(input: CreateEmployeeAdvanceInput, recordedById: string): Promise<EmployeeAdvance> {
  const advance = await prisma.$transaction(async (tx) => {
    await assertBranchDayNotClosed(input.branchId, input.date, tx);

    const created = await tx.employeeAdvance.create({
      data: {
        staffId: input.staffId,
        branchId: input.branchId,
        amount: input.amount,
        date: new Date(input.date),
        reason: input.reason ?? null,
        recordedById,
      },
    });

    await tx.treasuryEntry.create({
      data: {
        type: 'EXPENSE',
        amount: input.amount,
        method: input.walletMethod,
        category: 'سلفة موظف',
        note: input.reason ?? null,
        date: new Date(input.date),
        sourceType: 'EMPLOYEE_ADVANCE',
        employeeAdvanceId: created.id,
        staffId: recordedById,
        branchId: input.branchId,
      },
    });

    return tx.employeeAdvance.findUniqueOrThrow({ where: { id: created.id }, include: advanceInclude });
  });
  return mapAdvanceToDto(advance);
}

export async function createRepayment(
  advanceId: string,
  input: CreateAdvanceRepaymentInput,
  recordedById: string,
): Promise<EmployeeAdvance> {
  return prisma.$transaction(async (tx) => {
    const advance = await tx.employeeAdvance.findUnique({ where: { id: advanceId }, include: advanceInclude });
    if (!advance || advance.isDeleted) {
      throw new EmployeeAdvanceNotFoundError();
    }

    const repaidSoFar = advance.repayments.reduce((sum, r) => sum + r.amount.toNumber(), 0);
    const remaining = advance.amount.toNumber() - repaidSoFar;
    if (input.amount > remaining) {
      throw new AdvanceRepaymentExceedsBalanceError();
    }

    const repayment = await tx.employeeAdvanceRepayment.create({
      data: {
        advanceId,
        amount: input.amount,
        date: new Date(input.date),
        method: input.method,
        note: input.note ?? null,
        recordedById,
      },
    });

    if (input.method === 'CASH') {
      if (!input.walletMethod) {
        throw new MissingWalletMethodError();
      }
      await assertBranchDayNotClosed(advance.branchId, input.date, tx);
      await tx.treasuryEntry.create({
        data: {
          type: 'INCOME',
          amount: input.amount,
          method: input.walletMethod,
          category: 'استرداد سلفة',
          note: input.note ?? null,
          date: new Date(input.date),
          sourceType: 'EMPLOYEE_ADVANCE_REPAYMENT',
          employeeAdvanceRepaymentId: repayment.id,
          staffId: recordedById,
          branchId: advance.branchId,
        },
      });
    }

    const updated = await tx.employeeAdvance.findUniqueOrThrow({ where: { id: advanceId }, include: advanceInclude });
    return mapAdvanceToDto(updated);
  });
}

/**
 * FEATURE-008 (2026-08-13, owner: "هل هيطلعلي تقرير بالسلف بتاعت كل موظف
 * ومتبقيله كام من المرتب"). One row per employee with any advance history
 * or salary data. `attendanceAdjustment` folds in the current pay
 * period's lateness/early-leave deductions and overtime additions (see
 * employeePayrollService.ts) — 0 for anyone without a shift schedule
 * configured yet, never a hard failure.
 */
export async function getEmployeeAdvanceSummaries(): Promise<EmployeeAdvanceSummary[]> {
  const staff = await prisma.staffProfile.findMany({
    where: {
      isDeleted: false,
      OR: [{ advancesReceived: { some: { isDeleted: false } } }, { baseSalary: { not: null } }],
    },
    include: { advancesReceived: { where: { isDeleted: false }, include: { repayments: true } } },
    orderBy: { name: 'asc' },
  });

  return Promise.all(
    staff.map(async (s) => {
      const totalOutstanding = s.advancesReceived.reduce((sum, advance) => {
        const repaid = advance.repayments.reduce((rSum, r) => rSum + r.amount.toNumber(), 0);
        return sum + (advance.amount.toNumber() - repaid);
      }, 0);
      const baseSalary = s.baseSalary ? s.baseSalary.toNumber() : null;
      const payroll = await computeEmployeePayroll(s.id);
      const attendanceAdjustment = payroll?.totalAdjustment ?? 0;

      // Owner (2026-08-20, "لو لا طب هنعمل ده ازاي") — sum of any
      // SalaryPayment already recorded for this exact period, so the "صرف
      // مرتب" screen can warn before a possible double-pay (never a hard
      // block — a legitimate correction/top-up must still be possible).
      let paidThisPeriod = 0;
      if (payroll) {
        const payments = await prisma.salaryPayment.findMany({
          where: {
            staffId: s.id,
            isDeleted: false,
            periodStart: new Date(payroll.periodStart),
            periodEnd: new Date(payroll.periodEnd),
          },
          select: { amount: true },
        });
        paidThisPeriod = payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
      }

      return {
        staffId: s.id,
        staffName: s.name,
        branchId: s.branchId,
        payFrequency: s.payFrequency,
        baseSalary,
        totalOutstanding,
        attendanceAdjustment,
        netDue: baseSalary !== null ? baseSalary - totalOutstanding + attendanceAdjustment : null,
        periodStart: payroll?.periodStart ?? null,
        periodEnd: payroll?.periodEnd ?? null,
        paidThisPeriod,
      };
    }),
  );
}
