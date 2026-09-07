import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BUSINESS_TIMEZONE, getTimezoneOffsetMinutes } from '../lib/businessTimezone.js';
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

type StaffWithPayrollFields = Prisma.StaffProfileGetPayload<object>;

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Last valid day-of-month for a given year/month (0-indexed month) — clamps e.g. day 31 against February. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function clampToMonth(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

/**
 * WEEKLY → the 7 days ending `referenceDate` (inclusive).
 * MONTHLY → a full cycle anchored on `payDayOfMonth` (owner, 2026-08-20,
 * "عندي موظف بيبدأ قبض من يوم 9 في الشهر مش من يوم 1"): the cycle running
 * from that day-of-month through the day before its next occurrence,
 * containing `referenceDate`. Null (or 1) keeps the original
 * calendar-month behavior unchanged.
 *
 * `referenceDate` defaults to today (the original, only behavior before
 * `computePreviousClosedPeriod` below needed to resolve an arbitrary past
 * anchor point too — passing an explicit date is what lets that reuse this
 * exact cycle math instead of re-deriving it).
 */
export function resolvePeriod(payFrequency: PayFrequency, payDayOfMonth: number | null, referenceDate: Date = new Date()): { periodStart: Date; periodEnd: Date } {
  const today = utcMidnight(referenceDate);
  if (payFrequency === 'WEEKLY') {
    const periodStart = new Date(today);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6);
    return { periodStart, periodEnd: today };
  }

  if (!payDayOfMonth || payDayOfMonth === 1) {
    const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { periodStart, periodEnd };
  }

  let startYear = today.getUTCFullYear();
  let startMonth = today.getUTCMonth();
  if (today.getUTCDate() < clampToMonth(startYear, startMonth, payDayOfMonth)) {
    // This month's pay-day hasn't happened yet — the current cycle started last month.
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  const periodStart = new Date(Date.UTC(startYear, startMonth, clampToMonth(startYear, startMonth, payDayOfMonth)));

  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  const periodEnd = new Date(Date.UTC(endYear, endMonth, clampToMonth(endYear, endMonth, payDayOfMonth) - 1));
  return { periodStart, periodEnd };
}

/**
 * Bug found live (2026-08-20, owner: "شيفته من 10 ل 6، بيحضر من 9:30 ل8،
 * المفروض ليه دقايق مش عليه") — `shiftStartTime`/`shiftEndTime` are
 * "HH:MM" wall-clock strings meant as Egypt local time (the only branch
 * timezone this business has), but were being built with `Date.UTC(...)`
 * directly — i.e. treated as UTC hours, not Cairo hours. The server runs
 * in UTC (Render), so every scheduled start/end was off by Cairo's real
 * UTC offset (+2 or +3 depending on Egypt's DST, which resumed in 2023) —
 * shifting the whole late/early-leave/overtime comparison by 2-3 hours
 * and turning a normal early-arrival/late-departure day into a wrongly
 * "docked" one. `getTimezoneOffsetMinutes` (now shared via
 * `lib/businessTimezone.ts` — `attendanceService.ts`'s day-bucketing bug
 * fix reuses the exact same Cairo-offset primitive) reads the IANA
 * `Africa/Cairo` offset for the given day (so it keeps working correctly
 * across DST transitions, not just today), rather than a fixed hardcoded
 * number.
 */
function combineDayAndTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const offsetMinutes = getTimezoneOffsetMinutes(day, BUSINESS_TIMEZONE);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m) - offsetMinutes * 60000);
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

interface PayrollCore {
  scheduledDaysInPeriod: number;
  dailyRate: number | null;
  hourlyRate: number | null;
  days: EmployeePayrollDay[];
  totalAdjustment: number;
}

/**
 * The day-by-day rate/lateness/overtime math, shared by both the always-
 * live "current period" computation (`computeEmployeePayroll`) and the
 * "just-ended period, about to be frozen" computation
 * (`computePreviousClosedPeriod`) — extracted so a period is priced
 * exactly the same way regardless of which of the two ever calls it,
 * per `periodStart`/`periodEnd`/`effectiveEnd` alone (the caller decides
 * how far into the period to actually look: "up to today" for a still-
 * ongoing period, or "the whole thing" for one that's already over).
 */
async function computePayrollCore(staff: StaffWithPayrollFields, periodStart: Date, periodEnd: Date, effectiveEnd: Date): Promise<PayrollCore> {
  const scheduledDays = eachDay(periodStart, periodEnd).filter((d) => staff.workingDays.includes(d.getUTCDay()));
  const scheduledDaysInPeriod = scheduledDays.length;
  if (scheduledDaysInPeriod === 0) {
    return { scheduledDaysInPeriod: 0, dailyRate: null, hourlyRate: null, days: [], totalAdjustment: 0 };
  }

  const baseSalary = staff.baseSalary!.toNumber();
  const dailyRate = baseSalary / scheduledDaysInPeriod;
  const shiftStart0 = combineDayAndTime(scheduledDays[0]!, staff.shiftStartTime!);
  const shiftEnd0 = combineDayAndTime(scheduledDays[0]!, staff.shiftEndTime!);
  const shiftMinutes = shiftEnd0.getTime() > shiftStart0.getTime() ? (shiftEnd0.getTime() - shiftStart0.getTime()) / 60000 : (shiftEnd0.getTime() + 86400000 - shiftStart0.getTime()) / 60000;
  const hourlyRate = dailyRate / (shiftMinutes / 60);

  const scheduledDaysElapsed = scheduledDays.filter((d) => d.getTime() <= effectiveEnd.getTime());
  const entries = await prisma.attendanceEntry.findMany({
    where: { staffId: staff.id, isDeleted: false, date: { gte: scheduledDaysElapsed[0] ?? periodStart, lte: effectiveEnd } },
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
  return { scheduledDaysInPeriod, dailyRate, hourlyRate, days, totalAdjustment };
}

function hasPayrollConfigured(staff: StaffWithPayrollFields | null): staff is StaffWithPayrollFields {
  return Boolean(staff && staff.payFrequency && staff.baseSalary && staff.shiftStartTime && staff.shiftEndTime && staff.workingDays.length > 0);
}

/**
 * Null when the employee has no `payFrequency`/`baseSalary`/shift schedule
 * configured yet — payroll-by-hours simply doesn't apply until an admin
 * fills those in on the employee profile, same "nothing computed until
 * configured" behavior as the rest of this module's optional HR fields.
 */
export async function computeEmployeePayroll(staffId: string): Promise<EmployeePayroll | null> {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
  if (!hasPayrollConfigured(staff)) return null;

  const { periodStart, periodEnd } = resolvePeriod(staff.payFrequency!, staff.payDayOfMonth);
  const today = utcMidnight(new Date());
  const effectiveEnd = periodEnd.getTime() < today.getTime() ? periodEnd : today;

  const core = await computePayrollCore(staff, periodStart, periodEnd, effectiveEnd);
  return {
    staffId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    ...core,
  };
}

/**
 * Owner (2026-09-02, "لما الشهر يخلص يتحسب المرتب بالظبط ويتحفظ") — the
 * MONTHLY pay cycle immediately before the one `computeEmployeePayroll`
 * currently reports as "current" — i.e. the most recent one that has
 * fully ended. Used by `payrollPeriodCloseJob.ts` to freeze it into a
 * `PayrollPeriod` row the moment it's over, so its exact numbers stay
 * reachable even after "today" moves into the next cycle.
 *
 * Scoped to MONTHLY only: WEEKLY's period is a *rolling* 7-day window that
 * ends anew every single day (see `resolvePeriod` above) — there is no
 * single well-defined "period end" event for it to close on, so closing
 * stays a MONTHLY-only concept until/unless the owner asks to extend it.
 * Null for anyone not on a configured MONTHLY cycle, or whose previous
 * cycle had zero scheduled work days (nothing to freeze).
 */
export async function computePreviousClosedPeriod(staffId: string): Promise<{
  staffId: string;
  branchId: string;
  periodStart: Date;
  periodEnd: Date;
  baseSalary: number;
  dailyRate: number | null;
  hourlyRate: number | null;
  totalAdjustment: number;
  grossDue: number;
  days: EmployeePayrollDay[];
} | null> {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
  if (!hasPayrollConfigured(staff) || staff.payFrequency !== 'MONTHLY') return null;

  const { periodStart: currentPeriodStart } = resolvePeriod('MONTHLY', staff.payDayOfMonth);
  const referenceDate = new Date(currentPeriodStart.getTime() - 86400000);
  const { periodStart, periodEnd } = resolvePeriod('MONTHLY', staff.payDayOfMonth, referenceDate);

  const core = await computePayrollCore(staff, periodStart, periodEnd, periodEnd);
  if (core.scheduledDaysInPeriod === 0) return null;

  const baseSalary = staff.baseSalary!.toNumber();
  return {
    staffId,
    branchId: staff.branchId,
    periodStart,
    periodEnd,
    baseSalary,
    dailyRate: core.dailyRate,
    hourlyRate: core.hourlyRate,
    totalAdjustment: core.totalAdjustment,
    grossDue: baseSalary + core.totalAdjustment,
    days: core.days,
  };
}
