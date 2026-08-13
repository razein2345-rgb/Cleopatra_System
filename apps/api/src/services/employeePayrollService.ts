import { prisma } from '../lib/prisma.js';
import type { EmployeePayroll, EmployeePayrollDay, PayFrequency } from '@cleopatra/shared';

/**
 * FEATURE-008 (2026-08-13) — see employeePayroll.ts's doc comment for the
 * full formula. Owner decisions this implements exactly:
 * - Absence (no check-in at all): flagged only, never auto-deducted.
 * - Early leave: deducted the same way as lateness.
 * - Overtime: paid extra at the same hourly rate.
 * - Monthly-frequency staff: identical logic, just a different period.
 * - A flat 15-minute grace period at the start of the day only.
 */
const GRACE_MINUTES = 15;

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** WEEKLY → the 7 days ending today (inclusive); MONTHLY → the current calendar month so far. */
function resolvePeriod(payFrequency: PayFrequency): { periodStart: Date; periodEnd: Date } {
  const today = utcMidnight(new Date());
  if (payFrequency === 'WEEKLY') {
    const periodStart = new Date(today);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6);
    return { periodStart, periodEnd: today };
  }
  const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return { periodStart, periodEnd };
}

function combineDayAndTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Null when the employee has no `payFrequency`/`baseSalary`/shift schedule
 * configured yet — payroll-by-hours simply doesn't apply until an admin
 * fills those in on the employee profile, same "nothing computed until
 * configured" behavior as the rest of this module's optional HR fields.
 */
export async function computeEmployeePayroll(staffId: string): Promise<EmployeePayroll | null> {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
  if (!staff || !staff.payFrequency || !staff.baseSalary || !staff.shiftStartTime || !staff.shiftEndTime || staff.workingDays.length === 0) {
    return null;
  }

  const { periodStart, periodEnd } = resolvePeriod(staff.payFrequency);
  const today = utcMidnight(new Date());
  const effectiveEnd = periodEnd.getTime() < today.getTime() ? periodEnd : today;

  const scheduledDays = eachDay(periodStart, periodEnd).filter((d) => staff.workingDays.includes(d.getUTCDay()));
  const scheduledDaysInPeriod = scheduledDays.length;
  if (scheduledDaysInPeriod === 0) {
    return {
      staffId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      scheduledDaysInPeriod: 0,
      dailyRate: null,
      hourlyRate: null,
      days: [],
      totalAdjustment: 0,
    };
  }

  const baseSalary = staff.baseSalary.toNumber();
  const dailyRate = baseSalary / scheduledDaysInPeriod;
  const shiftStart0 = combineDayAndTime(scheduledDays[0]!, staff.shiftStartTime);
  const shiftEnd0 = combineDayAndTime(scheduledDays[0]!, staff.shiftEndTime);
  const shiftMinutes = shiftEnd0.getTime() > shiftStart0.getTime() ? (shiftEnd0.getTime() - shiftStart0.getTime()) / 60000 : (shiftEnd0.getTime() + 86400000 - shiftStart0.getTime()) / 60000;
  const hourlyRate = dailyRate / (shiftMinutes / 60);

  const scheduledDaysElapsed = scheduledDays.filter((d) => d.getTime() <= effectiveEnd.getTime());
  const entries = await prisma.attendanceEntry.findMany({
    where: { staffId, isDeleted: false, date: { gte: scheduledDaysElapsed[0] ?? periodStart, lte: effectiveEnd } },
  });
  const entryByDate = new Map(entries.map((e) => [e.date.toISOString(), e]));

  const days: EmployeePayrollDay[] = scheduledDaysElapsed.map((day) => {
    const entry = entryByDate.get(day.toISOString());
    if (!entry?.checkInAt) {
      return {
        date: day.toISOString(),
        isAbsent: true,
        checkInAt: null,
        checkOutAt: entry?.checkOutAt?.toISOString() ?? null,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        adjustment: 0,
      };
    }

    const scheduledStart = combineDayAndTime(day, staff.shiftStartTime!);
    const scheduledEnd = combineDayAndTime(day, staff.shiftEndTime!);
    const graceEnd = new Date(scheduledStart.getTime() + GRACE_MINUTES * 60000);

    const lateMinutes = Math.max(0, (entry.checkInAt.getTime() - graceEnd.getTime()) / 60000);
    const earlyLeaveMinutes = entry.checkOutAt && entry.checkOutAt.getTime() < scheduledEnd.getTime() ? (scheduledEnd.getTime() - entry.checkOutAt.getTime()) / 60000 : 0;
    const overtimeMinutes = entry.checkOutAt && entry.checkOutAt.getTime() > scheduledEnd.getTime() ? (entry.checkOutAt.getTime() - scheduledEnd.getTime()) / 60000 : 0;
    const adjustment = ((overtimeMinutes - lateMinutes - earlyLeaveMinutes) / 60) * hourlyRate;

    return {
      date: day.toISOString(),
      isAbsent: false,
      checkInAt: entry.checkInAt.toISOString(),
      checkOutAt: entry.checkOutAt ? entry.checkOutAt.toISOString() : null,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      adjustment,
    };
  });

  const totalAdjustment = days.reduce((sum, d) => sum + d.adjustment, 0);

  return {
    staffId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    scheduledDaysInPeriod,
    dailyRate,
    hourlyRate,
    days,
    totalAdjustment,
  };
}
