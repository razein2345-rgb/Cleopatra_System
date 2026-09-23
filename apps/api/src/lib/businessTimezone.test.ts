import { describe, expect, it } from 'vitest';
import { businessDayRangeUtc, getTimezoneOffsetMinutes, todayInBusinessTimezone } from './businessTimezone.js';

describe('todayInBusinessTimezone', () => {
  it('returns the same UTC calendar day when Cairo has not crossed midnight yet', () => {
    // 2026-08-25T10:00:00Z + Cairo's +3h (EEST) offset = 13:00 Cairo, same day.
    const now = new Date('2026-08-25T10:00:00.000Z');
    expect(todayInBusinessTimezone(now).toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  it('rolls over to the next UTC day once Cairo has already crossed midnight, even though UTC has not yet', () => {
    // Bug found live (2026-08-26, owner: "أنا مسجل حضور وانصراف... ومظهرليش
    // حاجة") — 2026-08-25T22:00:00Z + Cairo's +3h offset = 2026-08-26T01:00
    // Cairo local. The naive `Date.UTC(now.getUTCFullYear(), ...)` approach
    // would wrongly return 2026-08-25 here (still "today" in raw UTC terms),
    // silently filing an early-Cairo-morning check-in under the wrong day.
    const now = new Date('2026-08-25T22:00:00.000Z');
    expect(todayInBusinessTimezone(now).toISOString()).toBe('2026-08-26T00:00:00.000Z');
  });

  it('matches getTimezoneOffsetMinutes direction (Cairo is east of UTC, offset is positive)', () => {
    const offset = getTimezoneOffsetMinutes(new Date('2026-08-25T12:00:00.000Z'));
    expect(offset).toBeGreaterThan(0);
  });
});

/**
 * Accounting audit fix (2026-09-17, Decision 4) — regression coverage for
 * report date-range filters. Before this, `from=2026-08-25` parsed via
 * plain `new Date('2026-08-25')` meant UTC midnight, silently excluding
 * the first ~3 Cairo-hours of that day and leaking into the report window
 * of the *previous* Cairo day near the `to` boundary.
 */
describe('businessDayRangeUtc', () => {
  it('a requested Cairo calendar day starts before UTC midnight of the same date (EEST, +3h)', () => {
    const { start } = businessDayRangeUtc('2026-08-25');
    // Cairo midnight on Aug 25 is 21:00 UTC on Aug 24 — 3 hours EARLIER
    // than the naive `new Date('2026-08-25')` (UTC midnight) a plain
    // parse would have used.
    expect(start.toISOString()).toBe('2026-08-24T21:00:00.000Z');
  });

  it('the range end is the same Cairo day at 23:59:59.999, not UTC midnight', () => {
    const { end } = businessDayRangeUtc('2026-08-25');
    expect(end.toISOString()).toBe('2026-08-25T20:59:59.999Z');
  });

  it('the range spans exactly 24 hours', () => {
    const { start, end } = businessDayRangeUtc('2026-08-25');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('a transaction at 01:00 Cairo time (still the previous UTC day) falls inside its own Cairo day range, not the day before', () => {
    // 2026-08-24T22:00:00Z + 3h Cairo offset = 2026-08-25T01:00 Cairo —
    // this is the exact bug class: naive UTC-day filtering would file this
    // moment under Aug 24, not Aug 25.
    const earlyCairoMorning = new Date('2026-08-24T22:00:00.000Z');
    const { start, end } = businessDayRangeUtc('2026-08-25');
    expect(earlyCairoMorning.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(earlyCairoMorning.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});
