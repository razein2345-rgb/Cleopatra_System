import { useEffect, useMemo, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CallLog, Lead } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { buildFollowUpRows, localDateKey } from '@/lib/followUps';
import { useAuth } from '@/state/AuthContext';
import { Card } from '@/components/ui/card';
import type { DashboardWidgetDefinition } from '../types';

const MAX_ROWS = 6;

/**
 * Owner (2026-09-25, CRM review) - "المتابعات المتأخرة": leads whose follow-up date has come and
 * calls left "محتاج متابعة" whose follow-up date has come. Both dates were being recorded but
 * surfaced nowhere unless someone opened the right screen and filtered. Reads only what the
 * user may see (leads.view / call-logs.view, each optional); a user with neither gets no card.
 * The lists are already branch-scoped by the API.
 */
function FollowUpsWidgetComponent() {
  const { can } = useAuth();
  const canSeeLeads = can('leads.view');
  const canSeeCalls = can('call-logs.view');
  const [leads, setLeads] = useState<Lead[] | null>(canSeeLeads ? null : []);
  const [calls, setCalls] = useState<CallLog[] | null>(canSeeCalls ? null : []);

  useEffect(() => {
    if (canSeeLeads) apiGet<Lead[]>('/api/leads').then(setLeads).catch(() => setLeads([]));
    if (canSeeCalls) apiGet<CallLog[]>('/api/call-logs').then(setCalls).catch(() => setCalls([]));
  }, [canSeeLeads, canSeeCalls]);

  const loading = leads === null || calls === null;
  const rows = useMemo(
    () => (loading ? [] : buildFollowUpRows(leads, calls, localDateKey(new Date()))),
    [loading, leads, calls],
  );

  if (!canSeeLeads && !canSeeCalls) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BellRing className="text-muted-foreground size-4" />
          <span className="text-sm font-bold">متابعات متأخرة أو مستحقة النهاردة</span>
          {rows.length > 0 && <span className="bg-danger text-danger-foreground rounded-full px-2 text-xs font-bold">{rows.length}</span>}
        </div>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">مفيش متابعات متأخرة.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.slice(0, MAX_ROWS).map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3">
              <Link to={r.to} className="min-w-0 truncate hover:underline">
                <span className="text-muted-foreground text-xs">{r.kind === 'lead' ? 'عميل محتمل' : 'مكالمة'} — </span>
                <span className="font-medium">{r.name}</span>
                {r.detail && <span className="text-muted-foreground"> — {r.detail}</span>}
              </Link>
              <span className={r.daysOverdue > 0 ? 'text-destructive shrink-0 text-xs' : 'text-warning shrink-0 text-xs'}>
                {r.daysOverdue > 0 ? `متأخر ${r.daysOverdue} يوم` : 'النهاردة'}
              </span>
            </li>
          ))}
          {rows.length > MAX_ROWS && (
            <li className="text-muted-foreground text-xs">
              و{rows.length - MAX_ROWS} متابعة تانية — افتح{' '}
              <Link to="/leads" className="text-primary hover:underline">
                العملاء المحتملون
              </Link>{' '}
              أو{' '}
              <Link to="/call-center" className="text-primary hover:underline">
                مركز الاتصال
              </Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

export const followUpsWidget: DashboardWidgetDefinition = {
  id: 'follow-ups',
  // no single permission: the component checks leads.view / call-logs.view itself (either is enough)
  Component: FollowUpsWidgetComponent,
  span: 'lg',
};
