import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BranchSummary, CreateLeadInput, Lead, LeadSource, LeadStage } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, paginate, Pagination, useConfirm, type StatusTone } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_OPTIONS } from '@/pages/partners/partnerLabels';

const PAGE_SIZE = 25;

const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  QUALIFIED: 'مؤهل',
  CONVERTED: 'تحول لعميل',
  REJECTED: 'مرفوض',
};

const LEAD_STAGE_TONES: Record<LeadStage, StatusTone> = {
  NEW: 'neutral',
  CONTACTED: 'info',
  QUALIFIED: 'warning',
  CONVERTED: 'success',
  REJECTED: 'danger',
};

/** The one forward step each open stage advances to — CONVERTED/REJECTED are their own dedicated actions, never reached via this. */
const NEXT_STAGE: Partial<Record<LeadStage, 'CONTACTED' | 'QUALIFIED'>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'QUALIFIED',
};

/**
 * PRODUCT_ROADMAP.md §2 ("المرحلة الثانية") — a Lead pipeline separate
 * from the Partners directory. Owner (2026-08-20, "طالما مطلبش قبل كده...
 * لحد ما يقبل اول عرض السعر") — "اعمل عرض سعر" is the only conversion
 * path: it creates the real customer record (status: Prospect) and drops
 * staff straight into the normal quotation composer in the same motion,
 * never a bare "convert" with nothing behind it.
 */
export function LeadsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingLead, setRejectingLead] = useState<Lead | null>(null);

  const load = () => {
    Promise.all([apiGet<Lead[]>('/api/leads'), apiGet<BranchSummary[]>('/api/branches')])
      .then(([l, b]) => {
        setLeads(l);
        setBranches(b);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الـLeads'));
  };

  useEffect(load, []);

  const advance = async (lead: Lead) => {
    const next = NEXT_STAGE[lead.stage];
    if (!next) return;
    setBusyId(lead.id);
    try {
      await apiPut(`/api/leads/${lead.id}/stage`, { stage: next });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث المرحلة');
    } finally {
      setBusyId(null);
    }
  };

  /** Converts the Lead (real BusinessPartner, status Prospect) then goes straight to the quotation composer — one motion, no dead-end "converted" screen. */
  const createQuotation = async (lead: Lead) => {
    setBusyId(lead.id);
    setError(null);
    try {
      const result = await apiPost<{ leadId: string; partnerId: string }>(`/api/leads/${lead.id}/convert`, {});
      navigate(`/orders/new?partnerId=${result.partnerId}&documentType=QUOTATION`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التحويل');
      setBusyId(null);
    }
  };

  const reject = async (lead: Lead, reason: string) => {
    setBusyId(lead.id);
    try {
      await apiPost(`/api/leads/${lead.id}/reject`, { reason: reason || undefined });
      setRejectingLead(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفض الـLead');
    } finally {
      setBusyId(null);
    }
  };

  const deleteLead = async (lead: Lead) => {
    if (!(await confirm({ title: `حذف الـLead "${lead.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/leads/${lead.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الـLead');
    }
  };

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  if (error && !leads) return <div className="text-destructive">{error}</div>;
  if (!leads) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const pageLeads = paginate(leads, page, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">العملاء المحتملون (Leads)</h1>
          <p className="text-muted-foreground text-xs">جديد ← تم التواصل ← مؤهل ← تحول لعميل، أو مرفوض.</p>
        </div>
        {can('leads.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ Lead جديد'}</Button>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showCreate && (
        <CreateLeadForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">الاسم</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">المصدر</th>
              <th className="p-3">الفرع</th>
              <th className="p-3">المرحلة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageLeads.map((lead) => {
              const isOpen = lead.stage === 'NEW' || lead.stage === 'CONTACTED' || lead.stage === 'QUALIFIED';
              const busy = busyId === lead.id;
              return (
                <tr key={lead.id} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">{lead.name}</td>
                  <td className="text-muted-foreground p-3" dir="ltr">
                    {lead.phone}
                  </td>
                  <td className="p-3">{lead.source ? LEAD_SOURCE_LABELS[lead.source] : '—'}</td>
                  <td className="p-3">{branchName(lead.branchId)}</td>
                  <td className="p-3">
                    <StatusBadge tone={LEAD_STAGE_TONES[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</StatusBadge>
                    {lead.stage === 'REJECTED' && lead.rejectedReason && (
                      <p className="text-muted-foreground mt-0.5 text-xs">{lead.rejectedReason}</p>
                    )}
                  </td>
                  <td className="p-3">
                    {isOpen && can('leads.edit') && (
                      <div className="flex flex-wrap items-center gap-2">
                        {NEXT_STAGE[lead.stage] && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void advance(lead)}
                            className="text-primary text-xs hover:underline disabled:opacity-50"
                          >
                            نقل لـ{LEAD_STAGE_LABELS[NEXT_STAGE[lead.stage]!]}
                          </button>
                        )}
                        {can('leads.convert') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void createQuotation(lead)}
                            className="text-success text-xs font-medium hover:underline disabled:opacity-50"
                          >
                            اعمل عرض سعر
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRejectingLead(lead)}
                          className="text-destructive text-xs hover:underline disabled:opacity-50"
                        >
                          رفض
                        </button>
                      </div>
                    )}
                    {can('leads.delete') && (
                      <button
                        type="button"
                        onClick={() => void deleteLead(lead)}
                        className="text-muted-foreground mt-1 block text-xs hover:underline"
                      >
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={6}>
                  لا يوجد Leads مسجّلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {rejectingLead && (
        <RejectLeadDialog
          lead={rejectingLead}
          onClose={() => setRejectingLead(null)}
          onReject={(reason) => void reject(rejectingLead, reason)}
        />
      )}
    </div>
  );
}

function CreateLeadForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateLeadInput = {
        name,
        phone,
        branchId,
        source: source || undefined,
        notes: notes.trim() || undefined,
      };
      await apiPost('/api/leads', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الـLead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          autoFocus
          required
          placeholder="الاسم"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="الهاتف"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as LeadSource | '')}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">المصدر (اختياري)</option>
          {LEAD_SOURCE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          placeholder="ملاحظات (اختياري)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-4"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ الـLead'}
      </Button>
    </form>
  );
}

function RejectLeadDialog({
  lead,
  onClose,
  onReject,
}: {
  lead: Lead;
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض "{lead.name}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">السبب (اختياري)</span>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onReject(reason)}>
              تأكيد الرفض
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
