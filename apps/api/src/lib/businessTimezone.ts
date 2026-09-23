/**
 * Accounting audit fix (2026-09-17, Phase 3 §21) — this file's actual
 * implementation moved to `packages/shared/src/businessTimezone.ts` so the
 * frontend can reuse the exact same Cairo-timezone logic (fixing
 * `CustomerStatementTab.tsx`'s own naive date-filter bug) instead of a
 * second implementation. Re-exported here so every existing
 * `../lib/businessTimezone.js` import across `apps/api` keeps working
 * unchanged — no call site needed to change.
 */
export { BUSINESS_TIMEZONE, businessDayRangeUtc, getTimezoneOffsetMinutes, todayInBusinessTimezone } from '@cleopatra/shared';
