import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateSalaryPaymentInput, SalaryPayment } from '@cleopatra/shared';
import { computeEmployeePayroll } from './employeePayrollService.js';
import { assertBranchDayNotClosed } from './treasuryService.js';

/**
 * Owner (2026-08-20, "هل بيطلعلي عملية مباشرة آخر الاسبوع بمرتبات الناس
 * جاهزة تتخصم من الخزينة؟... لو لا طب هنعمل ده ازاي") — confirmed there's
 * no automatic run; this is the manual "صرف مرتب" action per employee.
 * Paying a salary is real cash leaving the drawer — created atomically
 * with a TreasuryEntry, the exact same pattern `employeeAdvanceService.ts`'s
 * `createAdvance` already uses.
 */

type SalaryPaymentRecord = Prisma.SalaryPaymentGetPayload<object>;

export class NoPayrollConfiguredError extends Error {
  constructor() {
    super('لازم تحدد الراتب الأساسي ودورة الصرف ومواعيد الوردية وأيام العمل للموظف أولًا');
    this.name = 'NoPayrollConfiguredError';
  }
}

/** `payrollPeriodId` re-verified server-side, never trusted at face value — this is the mismatch/already-reopened case. */
export class InvalidPayrollPeriodError extends Error {
  constructor() {
    super('فترة المرتب دي مش صالحة للصرف — ممكن تكون اتفتحت تاني أو مش بتاعة الموظف ده');
    this.name = 'InvalidPayrollPeriodError';
  }
}

export function mapSalaryPaymentToDto(payment: SalaryPaymentRecord): SalaryPayment {
  return {
    id: payment.id,
    staffId: payment.staffId,
    branchId: payment.branchId,
    periodStart: payment.periodStart.toISOString(),
    periodEnd: payment.periodEnd.toISOString(),
    amount: payment.amount.toNumber(),
    method: payment.method,
    note: payment.note,
    recordedById: payment.recordedById,
    payrollPeriodId: payment.payrollPeriodId,
    createdAt: payment.createdAt.toISOString(),
  };
}

export async function listSalaryPaymentsForStaff(staffId: string): Promise<SalaryPayment[]> {
  const payments = await prisma.salaryPayment.findMany({
    where: { staffId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
  });
  return payments.map(mapSalaryPaymentToDto);
}

/**
 * `periodStart`/`periodEnd` are always resolved here server-side, never
 * accepted from the caller — this must reflect the real pay period being
 * settled, not whatever a client claims.
 *
 * Owner (2026-09-02, "لما الشهر يخلص يتحسب المرتب بالظبط ويتحفظ لحد ما
 * يتصرف للموظف") — `input.payrollPeriodId` (from
 * `EmployeeAdvanceSummary.pendingPayrollPeriodId`) is re-verified here
 * (belongs to this staff member, still closed) rather than trusted, and
 * takes priority: pay against the frozen closed period when one exists.
 * Falls back to the original live `computeEmployeePayroll` period exactly
 * as before this feature when it doesn't (WEEKLY staff, or nothing closed
 * yet) — zero behavior change for those cases.
 */
export async function createSalaryPayment(input: CreateSalaryPaymentInput, recordedById: string): Promise<SalaryPayment> {
  let periodStart: Date;
  let periodEnd: Date;
  let payrollPeriodId: string | null = null;

  if (input.payrollPeriodId) {
    const period = await prisma.payrollPeriod.findUnique({ where: { id: input.payrollPeriodId } });
    if (!period || period.staffId !== input.staffId || period.isOpen) {
      throw new InvalidPayrollPeriodError();
    }
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
    payrollPeriodId = period.id;
  } else {
    const payroll = await computeEmployeePayroll(input.staffId);
    if (!payroll) throw new NoPayrollConfiguredError();
    periodStart = new Date(payroll.periodStart);
    periodEnd = new Date(payroll.periodEnd);
  }

  const now = new Date();

  const payment = await prisma.$transaction(async (tx) => {
    await assertBranchDayNotClosed(input.branchId, now, tx);

    const created = await tx.salaryPayment.create({
      data: {
        staffId: input.staffId,
        branchId: input.branchId,
        periodStart,
        periodEnd,
        amount: input.amount,
        method: input.method,
        note: input.note ?? null,
        recordedById,
        payrollPeriodId,
      },
    });

    await tx.treasuryEntry.create({
      data: {
        type: 'EXPENSE',
        amount: input.amount,
        method: input.method,
        category: 'مرتبات',
        note: input.note ?? null,
        date: now,
        sourceType: 'SALARY_PAYMENT',
        salaryPaymentId: created.id,
        staffId: recordedById,
        branchId: input.branchId,
      },
    });

    return created;
  });

  return mapSalaryPaymentToDto(payment);
}
