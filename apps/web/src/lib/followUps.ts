import type { CallLog, Lead } from '@cleopatra/shared';

/**
 * Follow-ups that need attention today (owner, 2026-09-25 - CRM review): a lead whose
 * "موعد المتابعة" has come, and a call log left "محتاج متابعة" whose follow-up date has come.
 * Both used to be recorded but surfaced nowhere except by opening the right screen and
 * filtering. Pure logic (no fetching) so it can be unit-tested; the dashboard widget feeds it.
 */

export interface FollowUpRow {
  kind: 'lead' | 'call';
  id: string;
  /** The person / company to follow up with. */
  name: string;
  /** For a call: what the call was about. */
  detail: string | null;
  /** yyyy-mm-dd of the follow-up date. */
  dueDate: string;
  /** Whole days past due; 0 = due today. */
  daysOverdue: number;
  /** Where to act on it. */
  to: string;
}

const OPEN_LEAD_STAGES = new Set<Lead['stage']>(['NEW', 'CONTACTED', 'QUALIFIED']);

/** yyyy-mm-dd of `now` in the browser's local calendar (the business runs in one timezone). */
export function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days between two yyyy-mm-dd keys (later - earlier), DST-safe because both are read as UTC midnights. */
function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

/**
 * Overdue and due-today follow-ups from open leads and unresolved call logs, most overdue first
 * (ties: leads before calls, then by name). A follow-up date is a calendar date, so the ISO
 * string's own date part is compared - never converted through a timezone.
 */
export function buildFollowUpRows(leads: Lead[], calls: CallLog[], today: string): FollowUpRow[] {
  const rows: FollowUpRow[] = [];

  for (const lead of leads) {
    if (!OPEN_LEAD_STAGES.has(lead.stage) || !lead.nextFollowUpAt) continue;
    const dueDate = lead.nextFollowUpAt.slice(0, 10);
    if (dueDate > today) continue;
    rows.push({ kind: 'lead', id: lead.id, name: lead.name, detail: null, dueDate, daysOverdue: daysBetween(dueDate, today), to: '/leads' });
  }

  for (const call of calls) {
    if (call.outcome !== 'NEEDS_FOLLOWUP' || !call.followUpDate) continue;
    const dueDate = call.followUpDate.slice(0, 10);
    if (dueDate > today) continue;
    rows.push({
      kind: 'call',
      id: call.id,
      name: call.partnerName ?? call.leadName ?? call.contactName ?? 'مكالمة',
      detail: call.purpose,
      dueDate,
      daysOverdue: daysBetween(dueDate, today),
      to: '/call-center',
    });
  }

  return rows.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || (a.kind === b.kind ? 0 : a.kind === 'lead' ? -1 : 1) || a.name.localeCompare(b.name, 'ar'),
  );
}
