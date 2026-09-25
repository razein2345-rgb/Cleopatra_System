import type { CallLog } from '@cleopatra/shared';

export interface CallHistoryRow {
  log: CallLog;
  /** True for a call logged against the LEAD this customer was converted from (before they became a customer). */
  beforeConversion: boolean;
}

/**
 * A customer's call history: the calls logged against the customer, plus - when the customer came
 * from a lead - the calls logged against that lead before the conversion (they stay attached to the
 * lead, so without this the history would start at the conversion). Newest first, each call once.
 */
export function buildCallHistory(customerCalls: CallLog[], leadCalls: CallLog[]): CallHistoryRow[] {
  const seen = new Set<string>();
  const rows: CallHistoryRow[] = [];
  for (const log of customerCalls) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    rows.push({ log, beforeConversion: false });
  }
  for (const log of leadCalls) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    rows.push({ log, beforeConversion: true });
  }
  return rows.sort((a, b) => b.log.createdAt.localeCompare(a.log.createdAt));
}
