import { describe, expect, it } from 'vitest';
import { getTimezoneOffsetMinutes, todayInBusinessTimezone } from './businessTimezone.js';

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
