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
 * `periodStart`/`periodEnd` are always resolved here from
 * `computeEmployeePayroll` (never accepted from the caller) — this must
 * reflect the real current pay period, not whatever a client claims.
 */
export async function createSalaryPayment(input: CreateSalaryPaymentInput, recordedById: string): Promise<SalaryPayment> {
  const payroll = await computeEmployeePayroll(input.staffId);
  if (!payroll) throw new NoPayrollConfiguredError();

  const periodStart = new Date(payroll.periodStart);
  const periodEnd = new Date(payroll.periodEnd);
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
