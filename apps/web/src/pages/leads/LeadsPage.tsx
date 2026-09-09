import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  BranchSummary,
  CreateLeadInput,
  Lead,
  LeadImportRow,
  LeadImportRowResult,
  LeadSource,
  LeadStage,
  ParsedLeadImportRow,
  UpdateLeadInput,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPostFormData, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ContactLinks,
  EditableSelectCell,
  EditableTextCell,
  LogCallDialog,
  StatusBadge,
  paginate,
  Pagination,
  useConfirm,
  type StatusTone,
} from '@/components/cleopatra';
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
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingLead, setRejectingLead] = useState<Lead | null>(null);
  const [loggingCallLead, setLoggingCallLead] = useState<Lead | null>(null);

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
  const branchOptions = branches.map((b) => [b.id, b.name] as const);
  const canEditFields = can('leads.edit');

  /** Owner (2026-09-09, "عايز اقدر اعدل على جدول الليدز من بره") — same direct-in-table edit `EditableTextCell`/`EditableSelectCell` already give the Partners list, applied here too. */
  const updateLeadField = async (id: string, patch: UpdateLeadInput) => {
    const updated = await apiPut<Lead>(`/api/leads/${id}`, patch);
    setLeads((prev) => prev?.map((l) => (l.id === id ? updated : l)) ?? prev);
  };

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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              استيراد من Excel
            </Button>
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ Lead جديد'}</Button>
          </div>
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

      {showImport && (
        <ImportLeadsDialog
          branches={branches}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
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
              <th className="p-3">تواصل مباشر</th>
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
                  <td className="p-3 font-medium">
                    {canEditFields ? (
                      <EditableTextCell value={lead.name} onSave={(next) => updateLeadField(lead.id, { name: next })} />
                    ) : (
                      lead.name
                    )}
                  </td>
                  <td className="text-muted-foreground p-3" dir="ltr">
                    {canEditFields ? (
                      <EditableTextCell value={lead.phone} onSave={(next) => updateLeadField(lead.id, { phone: next })} />
                    ) : (
                      lead.phone
                    )}
                  </td>
                  <td className="p-3">
                    <ContactLinks phone={lead.phone} email={lead.email} facebookUrl={lead.facebookUrl} />
                  </td>
                  <td className="p-3">
                    {canEditFields ? (
                      <EditableSelectCell
                        value={lead.source ?? ''}
                        options={[['', '— بدون —'], ...LEAD_SOURCE_OPTIONS]}
                        onSave={(next) => updateLeadField(lead.id, { source: next ? (next as LeadSource) : null })}
                        renderValue={(v) => (v ? LEAD_SOURCE_LABELS[v as LeadSource] : '—')}
                      />
                    ) : lead.source ? (
                      LEAD_SOURCE_LABELS[lead.source]
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3">
                    {canEditFields ? (
                      <EditableSelectCell
                        value={lead.branchId}
                        options={branchOptions}
                        onSave={(next) => updateLeadField(lead.id, { branchId: next })}
                        renderValue={branchName}
                      />
                    ) : (
                      branchName(lead.branchId)
                    )}
                  </td>
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {can('call-logs.create') && (
                        <button
                          type="button"
                          onClick={() => setLoggingCallLead(lead)}
                          className="text-primary text-xs hover:underline"
                        >
                          📞 سجل مكالمة
                        </button>
                      )}
                      {can('leads.delete') && (
                        <button
                          type="button"
                          onClick={() => void deleteLead(lead)}
                          className="text-muted-foreground text-xs hover:underline"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={7}>
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
      {loggingCallLead && (
        <LogCallDialog
          targetName={loggingCallLead.name}
          leadId={loggingCallLead.id}
          branches={branches}
          defaultBranchId={loggingCallLead.branchId}
          onClose={() => setLoggingCallLead(null)}
        />
      )}
    </div>
  );
}

function CreateLeadForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
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
        email: email.trim() || undefined,
        facebookUrl: facebookUrl.trim() || undefined,
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
          type="email"
          placeholder="الإيميل (اختياري)"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="لينك فيسبوك (اختياري)"
          dir="ltr"
          value={facebookUrl}
          onChange={(e) => setFacebookUrl(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="ملاحظات (اختياري)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-2"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ الـLead'}
      </Button>
    </form>
  );
}

interface PreviewRow extends ParsedLeadImportRow {
  included: boolean;
}

/**
 * Owner (2026-09-08, "عايز اقدر ادخل sheet excell للصفحه بتاعت الليدز") —
 * two-step flow: upload → server parses into rows (nothing saved yet) →
 * user reviews/fixes/excludes rows here → only then actually imported. One
 * branch + one optional source apply to the whole batch (the sheet itself
 * only needs name/phone/email/facebookUrl columns).
 */
function ImportLeadsDialog({
  branches,
  onClose,
  onImported,
}: {
  branches: BranchSummary[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ successCount: number; failCount: number; results: LeadImportRowResult[] } | null>(null);

  const parse = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const parsed = await apiPostFormData<{ rows: ParsedLeadImportRow[] }>('/api/leads/import/parse', formData);
      setRows(parsed.rows.map((r) => ({ ...r, included: !r.error })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر قراءة الملف');
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (rowNumber: number, patch: Partial<PreviewRow>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)) : prev));
  };

  const submit = async () => {
    if (!rows) return;
    const included = rows.filter((r) => r.included);
    if (included.length === 0) {
      setError('لازم تختار صف واحد على الأقل');
      return;
    }
    if (!branchId) {
      setError('اختار الفرع أولاً');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const payload: { branchId: string; source?: LeadSource; rows: LeadImportRow[] } = {
        branchId,
        source: source || undefined,
        rows: included.map((r) => ({ rowNumber: r.rowNumber, name: r.name, phone: r.phone, email: r.email, facebookUrl: r.facebookUrl })),
      };
      const res = await apiPost<{ successCount: number; failCount: number; results: LeadImportRowResult[] }>('/api/leads/import', payload);
      setResult(res);
      if (res.failCount === 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الاستيراد');
    } finally {
      setBusy(false);
    }
  };

  const includedCount = rows?.filter((r) => r.included).length ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>استيراد Leads من Excel / CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {result && (
            <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
              <p>
                تم استيراد <strong>{result.successCount}</strong> بنجاح
                {result.failCount > 0 && (
                  <>
                    {' '}
                    وفشل <strong className="text-destructive">{result.failCount}</strong>
                  </>
                )}
                .
              </p>
              {result.failCount > 0 && (
                <ul className="text-destructive list-inside list-disc text-xs">
                  {result.results
                    .filter((r) => !r.success)
                    .map((r) => (
                      <li key={r.rowNumber}>
                        صف {r.rowNumber}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button onClick={onImported}>تم</Button>
              </div>
            </div>
          )}

          {!rows && !result && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                ملف Excel (xlsx) أو CSV — أعمدة: الاسم، الهاتف، الإيميل (اختياري)، لينك فيسبوك (اختياري). لو الملف من
                غير عناوين أعمدة، النظام هياخدهم بنفس الترتيب ده.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  إلغاء
                </Button>
                <Button onClick={() => void parse()} disabled={!file || busy}>
                  {busy ? 'جارٍ القراءة…' : 'معاينة'}
                </Button>
              </div>
            </div>
          )}

          {rows && !result && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource | '')}
                  className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">المصدر لكل الدفعة (اختياري)</option>
                  {LEAD_SOURCE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-border max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr className="*:p-2 *:text-start">
                      <th></th>
                      <th>الاسم</th>
                      <th>الهاتف</th>
                      <th>الإيميل</th>
                      <th>فيسبوك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className={`border-border border-t ${row.error ? 'bg-destructive/10' : ''}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            title={row.error}
                            checked={row.included}
                            onChange={(e) => updateRow(row.rowNumber, { included: e.target.checked })}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={row.name}
                            onChange={(e) => updateRow(row.rowNumber, { name: e.target.value })}
                            className="border-input bg-background w-full rounded border px-2 py-1"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            dir="ltr"
                            value={row.phone}
                            onChange={(e) => updateRow(row.rowNumber, { phone: e.target.value })}
                            className="border-input bg-background w-full rounded border px-2 py-1"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            dir="ltr"
                            value={row.email ?? ''}
                            onChange={(e) => updateRow(row.rowNumber, { email: e.target.value || undefined })}
                            className="border-input bg-background w-full rounded border px-2 py-1"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            dir="ltr"
                            value={row.facebookUrl ?? ''}
                            onChange={(e) => updateRow(row.rowNumber, { facebookUrl: e.target.value || undefined })}
                            className="border-input bg-background w-full rounded border px-2 py-1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.some((r) => r.error) && (
                <p className="text-destructive text-xs">
                  الصفوف المُلوّنة فيها اسم أو هاتف ناقص — مستبعدة تلقائيًا، صححها لو عايز تستوردها أو سيبها.
                </p>
              )}

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={() => setRows(null)}>
                  رجوع
                </Button>
                <Button onClick={() => void submit()} disabled={busy || includedCount === 0}>
                  {busy ? 'جارٍ الاستيراد…' : `استيراد (${includedCount})`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
