/**
 * The single physical timezone this whole business operates in. Bug found
 * live (2026-08-20, owner: "شيفته من 10 ل 6، بيحضر من 9:30 ل8، المفروض ليه
 * دقايق مش عليه") in `employeePayrollService.ts` — never hardcode a fixed
 * UTC offset here: Egypt's DST (resumed 2023) shifts the real offset by an
 * hour across the year, so the IANA zone must be read fresh for whichever
 * date is in question.
 *
 * Accounting audit fix (2026-09-17, Phase 3 §21) — moved from
 * `apps/api/src/lib/businessTimezone.ts` into `packages/shared` so the
 * frontend (`CustomerStatementTab.tsx`'s own naive date-filter bug) can
 * reuse the EXACT same implementation instead of a second one — the API's
 * own `apps/api/src/lib/businessTimezone.ts` now just re-exports this file
 * so every existing `../lib/businessTimezone.js` import there keeps
 * working unchanged.
 */
export const BUSINESS_TIMEZONE = 'Africa/Cairo';

/** Cairo's UTC offset (in minutes) for the given moment — positive east of UTC. Handles DST transitions correctly since it re-derives the offset per date rather than using a fixed constant. */
export function getTimezoneOffsetMinutes(date: Date, timeZone: string = BUSINESS_TIMEZONE): number {
  const utcAsLocal = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzAsLocal = new Date(date.toLocaleString('en-US', { timeZone }));
  return (tzAsLocal.getTime() - utcAsLocal.getTime()) / 60000;
}

/**
 * Bug found live (2026-08-26, owner: "أنا مسجل حضور وانصراف... ومظهرليش
 * حاجة") — attendance's day-bucketing (`AttendanceEntry.date`, one row per
 * staff per calendar day) was computed from plain UTC midnight
 * (`Date.UTC(now.getUTCFullYear(), ...)`), not Cairo's calendar day. Cairo
 * runs 2-3 hours ahead of UTC, so any check-in between Cairo midnight and
 * Cairo's current UTC offset (00:00–02:00/03:00 Cairo time) got filed
 * under the *previous* UTC day — invisible to a same-Cairo-day "today"
 * query made later, once the UTC clock itself rolled over, even though
 * both moments fall on the same Cairo calendar day. Returns a UTC `Date`
 * whose year/month/day match Cairo's *local* calendar day right now (the
 * anchor value stays UTC-midnight shaped since every other day-bucketed
 * column in this codebase already expects that shape — only which
 * calendar day it names changes).
 */
export function todayInBusinessTimezone(now: Date = new Date()): Date {
  const offsetMinutes = getTimezoneOffsetMinutes(now, BUSINESS_TIMEZONE);
  const local = new Date(now.getTime() + offsetMinutes * 60000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * Accounting audit fix (2026-09-17, Decision 4) — the reverse of
 * `todayInBusinessTimezone`: given a date-only string from a plain
 * `<input type="date">` (e.g. "2026-09-17", exactly what every financial
 * report's `from`/`to` query param carries), returns the real UTC instant
 * range that Cairo calendar day actually spans. Before this, report
 * date-range filters parsed the string with `new Date('YYYY-MM-DD')`,
 * which JS treats as UTC midnight — for a `from=X` filter this silently
 * excludes the first 2-3 hours of Cairo's day X (still UTC day X-1), and
 * for a `to=X` filter (typically used as an upper bound) it cuts off
 * almost all of Cairo's day X. `end` is the same Cairo day's 23:59:59.999,
 * expressed in UTC, so a single `{gte: start, lte: end}` correctly spans
 * exactly one Cairo calendar day.
 */
export function businessDayRangeUtc(dateOnlyString: string): { start: Date; end: Date } {
  const naiveUtcMidnight = new Date(`${dateOnlyString}T00:00:00.000Z`);
  const offsetMinutes = getTimezoneOffsetMinutes(naiveUtcMidnight, BUSINESS_TIMEZONE);
  const start = new Date(naiveUtcMidnight.getTime() - offsetMinutes * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}
