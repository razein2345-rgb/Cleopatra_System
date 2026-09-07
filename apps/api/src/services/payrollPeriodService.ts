import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { EmployeePayrollDay, PayrollPeriod } from '@cleopatra/shared';
import { computePreviousClosedPeriod } from './employeePayrollService.js';

/**
 * Owner (2026-09-02, "بالنسبة للمرتبات عايز لما الشهر يخلص يتحسب المرتب
 * بالظبط ويتحفظ لحد ما يتصرف للموظف والشهر الجديد يكون منفصل عن القديم
 * علشان منخلطش بين الشهور") — closing/reopening a `PayrollPeriod` mirrors
 * `treasuryService.ts`'s `closeTreasuryDay`/`reopenTreasuryDay` exactly:
 * upsert-by-unique-key, `isOpen: false` = a valid frozen closure,
 * `isOpen: true` = reopened and due for the next sweep to recompute.
 */

const withPayments = { include: { salaryPayments: { where: { isDeleted: false }, select: { amount: true } } } } satisfies { include: Prisma.PayrollPeriodInclude };
type PayrollPeriodWithPayments = Prisma.PayrollPeriodGetPayload<typeof withPayments>;

export class PayrollPeriodNotFoundError extends Error {
  constructor() {
    super('لم يتم العثور على فترة المرتب');
    this.name = 'PayrollPeriodNotFoundError';
  }
}

export class PayrollPeriodAlreadyOpenError extends Error {
  constructor() {
    super('الفترة دي متفتحة بالفعل');
    this.name = 'PayrollPeriodAlreadyOpenError';
  }
}

export class PayrollPeriodAlreadyPaidError extends Error {
  constructor() {
    super('اتصرف من الفترة دي بالفعل — لازم يتصرف عكسها الأول قبل إعادة الفتح');
    this.name = 'PayrollPeriodAlreadyPaidError';
  }
}

export function mapPayrollPeriodToDto(period: PayrollPeriodWithPayments): PayrollPeriod {
  const paidAmount = period.salaryPayments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
  return {
    id: period.id,
    staffId: period.staffId,
    branchId: period.branchId,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    baseSalary: period.baseSalary.toNumber(),
    dailyRate: period.dailyRate ? period.dailyRate.toNumber() : null,
    hourlyRate: period.hourlyRate ? period.hourlyRate.toNumber() : null,
    totalAdjustment: period.totalAdjustment.toNumber(),
    grossDue: period.grossDue.toNumber(),
    days: period.days as unknown as EmployeePayrollDay[],
    closedAt: period.closedAt.toISOString(),
    isOpen: period.isOpen,
    reopenedById: period.reopenedById,
    reopenedAt: period.reopenedAt ? period.reopenedAt.toISOString() : null,
    reopenReason: period.reopenReason,
    paidAmount,
  };
}

export async function listPayrollPeriodsForStaff(staffId: string): Promise<PayrollPeriod[]> {
  const periods = await prisma.payrollPeriod.findMany({
    where: { staffId },
    ...withPayments,
    orderBy: { periodStart: 'desc' },
  });
  return periods.map(mapPayrollPeriodToDto);
}

/**
 * The oldest closed (not reopened) period that still owes more than it's
 * been paid — what `EmployeeAdvanceSummary.pendingPayrollPeriodId` and the
 * "صرف مرتب" dialog settle against. Null once every closed period for this
 * employee has been paid off in full (or none has closed yet), in which
 * case the caller falls back to the original live-computation behavior.
 */
export async function getPendingPayrollPeriodForStaff(staffId: string): Promise<PayrollPeriod | null> {
  const periods = await prisma.payrollPeriod.findMany({
    where: { staffId, isOpen: false },
    ...withPayments,
    orderBy: { periodEnd: 'asc' },
  });
  for (const period of periods) {
    const dto = mapPayrollPeriodToDto(period);
    if (dto.paidAmount < dto.grossDue) return dto;
  }
  return null;
}

/**
 * Idempotent sweep — safe to call repeatedly (`payrollPeriodCloseJob.ts`
 * ticks it on an interval, same shape as `autoCloseDayJob.ts`). For every
 * MONTHLY-paid staff member whose previous pay cycle has fully ended,
 * freezes it into a `PayrollPeriod` row unless one already exists and is
 * still closed (`isOpen: false`) — a reopened row (`isOpen: true`) gets
 * recomputed and re-closed here instead, which is the entire mechanism
 * behind "إعادة فتح الشهر وإعادة الحساب": reopening never triggers a
 * recompute itself, it just clears the way for this sweep to do it.
 */
export async function closeDuePayrollPeriods(): Promise<number> {
  const staff = await prisma.staffProfile.findMany({
    where: { isDeleted: false, isActive: true, payFrequency: 'MONTHLY' },
    select: { id: true },
  });

  let closedCount = 0;
  for (const s of staff) {
    const computed = await computePreviousClosedPeriod(s.id);
    if (!computed) continue;

    const existing = await prisma.payrollPeriod.findUnique({
      where: { staffId_periodStart_periodEnd: { staffId: computed.staffId, periodStart: computed.periodStart, periodEnd: computed.periodEnd } },
    });
    if (existing && !existing.isOpen) continue;

    const data = {
      staffId: computed.staffId,
      branchId: computed.branchId,
      periodStart: computed.periodStart,
      periodEnd: computed.periodEnd,
      baseSalary: computed.baseSalary,
      dailyRate: computed.dailyRate,
      hourlyRate: computed.hourlyRate,
      totalAdjustment: computed.totalAdjustment,
      grossDue: computed.grossDue,
      days: computed.days as unknown as Prisma.InputJsonValue,
      closedAt: new Date(),
      isOpen: false,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
    };

    if (existing) {
      await prisma.payrollPeriod.update({ where: { id: existing.id }, data });
    } else {
      await prisma.payrollPeriod.create({ data });
    }
    closedCount += 1;
  }
  return closedCount;
}

/**
 * Owner (2026-09-02, "يسمح بإعادة فتح الشهر وإعادة الحساب") — restricted to
 * SUPER_ADMIN/ADMIN at the controller layer (same elevated bar as
 * `reopenTreasuryDay`). Refused once any real payment has been recorded
 * against the period — a correction at that point belongs in a fresh
 * advance/adjustment, not in silently discarding numbers cash already
 * moved against.
 */
export async function reopenPayrollPeriod(periodId: string, staffId: string, reason: string): Promise<PayrollPeriod> {
  const existing = await prisma.payrollPeriod.findUnique({ where: { id: periodId }, ...withPayments });
  if (!existing) throw new PayrollPeriodNotFoundError();
  if (existing.isOpen) throw new PayrollPeriodAlreadyOpenError();
  const paidAmount = existing.salaryPayments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
  if (paidAmount > 0) throw new PayrollPeriodAlreadyPaidError();

  const updated = await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { isOpen: true, reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
    ...withPayments,
  });
  return mapPayrollPeriodToDto(updated);
}
