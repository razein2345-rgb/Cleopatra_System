/**
 * The single physical timezone this whole business operates in. Bug found
 * live (2026-08-20, owner: "شيفته من 10 ل 6، بيحضر من 9:30 ل8، المفروض ليه
 * دقايق مش عليه") in `employeePayrollService.ts` — never hardcode a fixed
 * UTC offset here: Egypt's DST (resumed 2023) shifts the real offset by an
 * hour across the year, so the IANA zone must be read fresh for whichever
 * date is in question.
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
