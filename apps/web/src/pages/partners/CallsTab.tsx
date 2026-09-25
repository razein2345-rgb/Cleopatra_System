import { useEffect, useMemo, useState } from 'react';
import type { CallLog, Lead } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { StatusBadge } from '@/components/cleopatra';
import { DIRECTION_LABELS, OUTCOME_LABELS, OUTCOME_TONES } from '@/pages/call-center/callLabels';
import { buildCallHistory } from './callHistory';

/**
 * Owner (2026-09-25, CRM review) - the customer's call history on their own profile. The profile
 * had a "سجل مكالمة" button but no way to see the calls afterwards (they were only visible in the
 * Call Center screen). When the customer came from a lead, that lead's earlier calls are included
 * (they stay attached to the lead), marked "قبل التحويل". Read-only; the log itself is created
 * with the button in the profile header.
 */
export function CallsTab({ partnerId, canSeeLeads, reloadKey }: { partnerId: string; canSeeLeads: boolean; reloadKey: number }) {
  const [customerCalls, setCustomerCalls] = useState<CallLog[] | null>(null);
  const [leadCalls, setLeadCalls] = useState<CallLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const own = await apiGet<CallLog[]>(`/api/call-logs?partnerId=${partnerId}`);
        if (cancelled) return;
        setError(null);
        setCustomerCalls(own);

        // the lead this customer was converted from, if the user may see leads
        if (canSeeLeads) {
          const leads = await apiGet<Lead[]>('/api/leads').catch(() => [] as Lead[]);
          const origin = leads.find((l) => l.convertedPartnerId === partnerId);
          if (origin) {
            const earlier = await apiGet<CallLog[]>(`/api/call-logs?leadId=${origin.id}`).catch(() => [] as CallLog[]);
            if (!cancelled) setLeadCalls(earlier);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل المكالمات');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId, canSeeLeads, reloadKey]);

  const rows = useMemo(() => buildCallHistory(customerCalls ?? [], leadCalls), [customerCalls, leadCalls]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!customerCalls) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="border-border overflow-x-auto rounded-2xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-start">التاريخ</th>
            <th className="p-2 text-start">النوع</th>
            <th className="p-2 text-start">الغرض</th>
            <th className="p-2 text-start">النتيجة</th>
            <th className="p-2 text-start">الموظف</th>
            <th className="p-2 text-start">المتابعة</th>
            <th className="p-2 text-start">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ log, beforeConversion }) => (
            <tr key={log.id} className="border-border border-t">
              <td className="p-2">
                {new Date(log.createdAt).toLocaleDateString('ar-EG')}
                {beforeConversion && <span className="text-muted-foreground block text-xs">قبل التحويل لعميل</span>}
              </td>
              <td className="p-2">{DIRECTION_LABELS[log.direction]}</td>
              <td className="p-2">{log.purpose}</td>
              <td className="p-2">
                <StatusBadge tone={OUTCOME_TONES[log.outcome]}>{OUTCOME_LABELS[log.outcome]}</StatusBadge>
              </td>
              <td className="text-muted-foreground p-2">{log.staffName ?? '—'}</td>
              <td className="p-2">{log.followUpDate ? new Date(log.followUpDate).toLocaleDateString('ar-EG') : '—'}</td>
              <td className="text-muted-foreground p-2">{log.notes ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="text-muted-foreground p-3" colSpan={7}>
                لا توجد مكالمات مسجّلة مع هذا العميل بعد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
