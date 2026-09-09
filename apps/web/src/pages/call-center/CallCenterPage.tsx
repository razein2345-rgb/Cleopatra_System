import { useEffect, useState } from 'react';
import type { BranchSummary, BusinessPartner, CallDirection, CallLog, CallOutcome, CreateCallLogInput, Lead } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Combobox, PartnerCombobox, StatusBadge, useConfirm, type StatusTone } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { whatsappLink } from '@/lib/whatsapp';

const DIRECTION_LABELS: Record<CallDirection, string> = { INBOUND: 'وارد', OUTBOUND: 'صادر' };
const OUTCOME_LABELS: Record<CallOutcome, string> = { RESOLVED: 'تم الحل', NEEDS_FOLLOWUP: 'محتاج متابعة' };
const OUTCOME_TONES: Record<CallOutcome, StatusTone> = { RESOLVED: 'success', NEEDS_FOLLOWUP: 'warning' };
const PURPOSE_SUGGESTIONS = ['استفسار', 'متابعة طلب', 'شكوى', 'تأكيد أوردر', 'استفسار عن سعر'];

function callerLabel(log: CallLog): string {
  return log.partnerName ?? log.leadName ?? log.contactName ?? '—';
}

/**
 * Owner (2026-09-09, "المرحلة الرابعة... أبدأ بداشبورد Call Center الأول")
 * — Phase 4's first shipped piece, chosen over Unified Inbox specifically
 * because Inbox needs an official WhatsApp Business Platform account
 * (external blocker, see CLAUDE.md §10) while Call Center is pure
 * in-system record-keeping — a manual log of a call that already
 * happened, not a real telephony/dialer integration.
 */
export function CallCenterPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [logs, setLogs] = useState<CallLog[] | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [followUpOnly, setFollowUpOnly] = useState(false);

  const load = () => {
    Promise.all([
      apiGet<CallLog[]>('/api/call-logs'),
      apiGet<BusinessPartner[]>('/api/partners'),
      apiGet<Lead[]>('/api/leads'),
      apiGet<BranchSummary[]>('/api/branches'),
    ])
      .then(([l, p, ld, b]) => {
        setLogs(l);
        setPartners(p);
        setLeads(ld);
        setBranches(b);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل سجل المكالمات'));
  };

  useEffect(load, []);

  const remove = async (log: CallLog) => {
    if (!(await confirm({ title: `حذف سجل المكالمة مع "${callerLabel(log)}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/call-logs/${log.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  if (error && !logs) return <div className="text-destructive">{error}</div>;
  if (!logs) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const visibleLogs = followUpOnly ? logs.filter((l) => l.outcome === 'NEEDS_FOLLOWUP') : logs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مركز الاتصال</h1>
          <p className="text-muted-foreground text-xs">سجل مكالمة جديدة وتابع كل المكالمات اللي محتاجة رد.</p>
        </div>
        {can('call-logs.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ سجل مكالمة جديدة'}</Button>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showCreate && (
        <CreateCallLogForm
          partners={partners}
          leads={leads}
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <label className="flex w-fit items-center gap-2 text-sm">
        <input type="checkbox" checked={followUpOnly} onChange={(e) => setFollowUpOnly(e.target.checked)} />
        اللي محتاج متابعة بس
      </label>

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">التاريخ</th>
              <th className="p-3">الاسم</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الغرض</th>
              <th className="p-3">النتيجة</th>
              <th className="p-3">الموظف</th>
              <th className="p-3">الفرع</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log) => (
              <tr key={log.id} className="border-border border-b last:border-0">
                <td className="text-muted-foreground p-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('ar-EG')}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{callerLabel(log)}</span>
                    {log.contactPhone && whatsappLink(log.contactPhone) && (
                      <a href={whatsappLink(log.contactPhone)!} target="_blank" rel="noopener noreferrer" title="واتساب" className="text-success">
                        ⚡
                      </a>
                    )}
                  </div>
                </td>
                <td className="p-3">{DIRECTION_LABELS[log.direction]}</td>
                <td className="p-3">{log.purpose}</td>
                <td className="p-3">
                  <StatusBadge tone={OUTCOME_TONES[log.outcome]}>{OUTCOME_LABELS[log.outcome]}</StatusBadge>
                  {log.followUpDate && (
                    <p className="text-muted-foreground mt-0.5 text-xs">متابعة: {new Date(log.followUpDate).toLocaleDateString('ar-EG')}</p>
                  )}
                </td>
                <td className="text-muted-foreground p-3">{log.staffName ?? '—'}</td>
                <td className="text-muted-foreground p-3">{branchName(log.branchId)}</td>
                <td className="p-3">
                  {can('call-logs.delete') && (
                    <button type="button" onClick={() => void remove(log)} className="text-destructive text-xs hover:underline">
                      حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visibleLogs.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={8}>
                  لا يوجد مكالمات مسجّلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CallerMode = 'PARTNER' | 'LEAD' | 'NEW';

function CreateCallLogForm({
  partners,
  leads,
  branches,
  onCreated,
}: {
  partners: BusinessPartner[];
  leads: Lead[];
  branches: BranchSummary[];
  onCreated: () => void;
}) {
  const [callerMode, setCallerMode] = useState<CallerMode>('PARTNER');
  const [partnerId, setPartnerId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [direction, setDirection] = useState<CallDirection>('INBOUND');
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>('RESOLVED');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateCallLogInput = {
        direction,
        purpose,
        outcome,
        notes: notes.trim() || undefined,
        branchId,
        followUpDate: followUpDate || undefined,
        partnerId: callerMode === 'PARTNER' ? partnerId || undefined : undefined,
        leadId: callerMode === 'LEAD' ? leadId || undefined : undefined,
        contactName: callerMode === 'NEW' ? contactName.trim() || undefined : undefined,
        contactPhone: callerMode === 'NEW' ? contactPhone.trim() || undefined : undefined,
      };
      await apiPost('/api/call-logs', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المكالمة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="space-y-1">
        <span className="text-muted-foreground text-sm">المتصل</span>
        <div className="flex gap-2">
          {(['PARTNER', 'LEAD', 'NEW'] as CallerMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCallerMode(mode)}
              className={`rounded-md border px-3 py-1.5 text-sm ${callerMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-input'}`}
            >
              {mode === 'PARTNER' ? 'عميل موجود' : mode === 'LEAD' ? 'Lead' : 'رقم جديد'}
            </button>
          ))}
        </div>
      </div>

      {callerMode === 'PARTNER' && <PartnerCombobox partners={partners} value={partnerId} onChange={setPartnerId} placeholder="ابحث عن العميل" />}
      {callerMode === 'LEAD' && (
        <Combobox
          items={leads}
          value={leadId}
          getKey={(l) => l.id}
          getLabel={(l) => l.name}
          getSubLabel={(l) => l.phone}
          onChange={(l) => setLeadId(l.id)}
          placeholder="ابحث عن الـ Lead"
          searchPlaceholder="اكتب اسم الـ Lead أو رقم الهاتف…"
        />
      )}
      {callerMode === 'NEW' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            required
            placeholder="اسم المتصل"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
          <input
            placeholder="رقم الهاتف (اختياري)"
            dir="ltr"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select value={direction} onChange={(e) => setDirection(e.target.value as CallDirection)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
          <option value="INBOUND">وارد</option>
          <option value="OUTBOUND">صادر</option>
        </select>
        <input
          required
          list="call-purpose-suggestions"
          placeholder="الغرض من المكالمة"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <datalist id="call-purpose-suggestions">
          {PURPOSE_SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
          <option value="RESOLVED">تم الحل</option>
          <option value="NEEDS_FOLLOWUP">محتاج متابعة</option>
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {outcome === 'NEEDS_FOLLOWUP' && (
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">تاريخ المتابعة (اختياري)</span>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات (اختياري)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ المكالمة'}
      </Button>
    </form>
  );
}
