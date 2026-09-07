import { describe, expect, it } from 'vitest';
import { resolvePeriod } from './employeePayrollService.js';

// `resolvePeriod` is the pure date-math core behind both the always-live
// "current period" computation and `computePreviousClosedPeriod` (which
// depends on it for a correct, non-overlapping "period just before this
// one" — see that function's own doc comment). No DB dependency, so it's
// tested directly here rather than through the DB-backed functions around it.

describe('resolvePeriod', () => {
  it('MONTHLY with no payDayOfMonth resolves the calendar month containing the reference date', () => {
    const { periodStart, periodEnd } = resolvePeriod('MONTHLY', null, new Date(Date.UTC(2026, 7, 20))); // Aug 20, 2026
    expect(periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 7, 1)).toISOString());
    expect(periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 7, 31)).toISOString());
  });

  it('MONTHLY with payDayOfMonth=9 anchors the cycle on the 9th (owner: "بيبدأ قبض من يوم 9")', () => {
    // Reference date after the 9th — cycle already started this month.
    const afterStart = resolvePeriod('MONTHLY', 9, new Date(Date.UTC(2026, 7, 20))); // Aug 20
    expect(afterStart.periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 7, 9)).toISOString());
    expect(afterStart.periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 8, 8)).toISOString());

    // Reference date before the 9th — cycle started last month.
    const beforeStart = resolvePeriod('MONTHLY', 9, new Date(Date.UTC(2026, 7, 5))); // Aug 5
    expect(beforeStart.periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 6, 9)).toISOString());
    expect(beforeStart.periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 7, 8)).toISOString());
  });

  it('clamps payDayOfMonth against short months (e.g. day 31 in February)', () => {
    const { periodStart, periodEnd } = resolvePeriod('MONTHLY', 31, new Date(Date.UTC(2026, 1, 15))); // Feb 15, 2026 (not a leap year)
    // Cycle started Jan 31 (Feb has no 31st), runs through the day before the next clamped occurrence (Feb 28).
    expect(periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 0, 31)).toISOString());
    expect(periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 1, 27)).toISOString());
  });

  it('WEEKLY is a rolling 7-day window ending on the reference date, unaffected by payDayOfMonth', () => {
    const { periodStart, periodEnd } = resolvePeriod('WEEKLY', null, new Date(Date.UTC(2026, 7, 20)));
    expect(periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  /**
   * `computePreviousClosedPeriod` resolves "the cycle immediately before
   * the current one" by calling this same function again with
   * `referenceDate = currentPeriodStart - 1 day` — this is the exact
   * contract that relies on, verified directly: the two periods must be
   * perfectly back-to-back (no gap, no overlap) for every anchor case.
   */
  it('resolving with referenceDate = currentPeriodStart - 1 day yields the immediately preceding, non-overlapping cycle', () => {
    const cases: Array<[number | null, Date]> = [
      [null, new Date(Date.UTC(2026, 7, 20))],
      [9, new Date(Date.UTC(2026, 7, 20))],
      [9, new Date(Date.UTC(2026, 7, 5))],
      [31, new Date(Date.UTC(2026, 1, 15))],
    ];
    for (const [payDayOfMonth, referenceDate] of cases) {
      const current = resolvePeriod('MONTHLY', payDayOfMonth, referenceDate);
      const dayBefore = new Date(current.periodStart.getTime() - 86400000);
      const previous = resolvePeriod('MONTHLY', payDayOfMonth, dayBefore);
      expect(previous.periodEnd.toISOString()).toBe(dayBefore.toISOString());
      expect(previous.periodStart.getTime()).toBeLessThan(previous.periodEnd.getTime());
      expect(previous.periodEnd.getTime()).toBeLessThan(current.periodStart.getTime() + 1); // strictly before current, contiguous
    }
  });
});
