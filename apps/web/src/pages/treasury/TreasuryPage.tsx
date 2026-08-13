import { useEffect, useState } from 'react';
import type {
  BranchSummary,
  BusinessPartner,
  CreateTreasuryEntryInput,
  MyTreasurySummary,
  PaymentMethod,
  TreasuryBalance,
  TreasuryEntry,
  TreasuryType,
  UpdateTreasuryEntryInput,
  User,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';
import { TREASURY_TYPE_LABELS, TREASURY_TYPE_OPTIONS, treasuryTypeTone, WALLET_COLORS } from './treasuryLabels';

/**
 * FEATURE-006 M4 — "الخزينة والنقدية," a real, first-class module (not a
 * dashboard card, not nested inside an invoice screen). Manual entries
 * (income/expense/transfer) are recorded here; `sourceType:
 * 'INVOICE_PAYMENT'` entries (M3's automatic Treasury posting on every
 * payment) appear in the same list read-only — one ledger, not two.
 *
 * FEATURE-007 M3 — a caller with only `treasury.create` (reception) sees a
 * deliberately narrower version of this same page: they can record
 * entries and see their own running total, but never the org-wide balance
 * (locked decision — never a "true" balance leaks to reception). This is
 * one component branching by permission, not two separate pages, so the
 * two views can never drift apart in fields or layout.
 */
export function TreasuryPage() {
  const { can } = useAuth();
  const canSeeAll = can('treasury.view');

  return canSeeAll ? <FullTreasuryView /> : <ReceptionTreasuryView />;
}

function FullTreasuryView() {
  const { can } = useAuth();
  const [entries, setEntries] = useState<TreasuryEntry[] | null>(null);
  const [balance, setBalance] = useState<TreasuryBalance | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TreasuryType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadList = () => {
    const params = new URLSearchParams();
    if (typeFilter !== 'ALL') params.set('type', typeFilter);
    if (search.trim()) params.set('search', search.trim());
    apiGet<TreasuryEntry[]>(`/api/treasury-entries?${params.toString()}`)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل حركات الخزينة'));
  };

  const loadBalance = () => {
    apiGet<TreasuryBalance>('/api/treasury-entries/balance')
      .then(setBalance)
      .catch(() => undefined);
  };

  useEffect(loadList, [typeFilter, search]);
  useEffect(() => {
    loadBalance();
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => undefined);
    apiGet<User[]>('/api/users').then(setStaff).catch(() => undefined);
  }, []);

  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? '—';
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const refreshAll = () => {
    loadList();
    loadBalance();
  };

  /** FEATURE-007 (2026-08-12, owner: "محتاج قسم الوارد والمنصرف ضروري علشان ابدأ افعله عندي واشتغل من عليه") — the module itself already existed end-to-end (this page); the actual gap was no way to fix a mistaken entry, which real daily use immediately needs. Automatic `INVOICE_PAYMENT` entries stay read-only (guarded server-side too — see `ManualEntryOnlyError`). */
  const removeEntry = async (entry: TreasuryEntry) => {
    if (!confirm('حذف هذه الحركة؟')) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-entries/${entry.id}`);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحركة');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الخزينة والنقدية</h1>
        {can('treasury.create') && (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'إلغاء' : '+ حركة جديدة'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">الرصيد الحالي</p>
          <p className="text-xl font-bold">{(balance?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">إجمالي الوارد</p>
          <p className="text-success text-xl font-bold">{(balance?.totalIncome ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">إجمالي المنصرف</p>
          <p className="text-danger text-xl font-bold">{(balance?.totalExpense ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">إجمالي التحويلات</p>
          <p className="text-xl font-bold">{(balance?.totalTransfer ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </Card>
      </div>

      {/* FEATURE-007 M3 — الرصيد مقسّم حسب طريقة الدفع (الفلوس دي جاية منين).
          كل الأربع محافظ تظهر دايمًا (حتى لو رصيدها صفر)، كل واحدة بلون
          البراند بتاعها، مش بس اللي فيها حركات. */}
      {balance && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PAYMENT_METHOD_OPTIONS.map(([method, label]) => {
            const methodBalance = balance.byMethod.find((m) => m.method === method)?.balance ?? 0;
            const colors = WALLET_COLORS[method];
            return (
              <Card key={method} className={`p-4 ${colors.bg}`}>
                <p className={`text-sm ${colors.text}`}>{label}</p>
                <p className={`text-lg font-bold ${colors.text}`}>
                  {methodBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <NewEntryForm
          branches={branches}
          partners={partners}
          onCreated={() => {
            setShowForm(false);
            refreshAll();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TreasuryType | 'ALL')}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">كل الأنواع</option>
          {TREASURY_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في الملاحظات أو التصنيف…"
          className="border-input bg-background min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {!entries ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">التاريخ</th>
                <th className="p-3">النوع</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">طريقة الدفع</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3">الملاحظات</th>
                <th className="p-3">العميل/المورّد</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">بواسطة</th>
                <th className="p-3">المصدر</th>
                {(can('treasury.edit') || can('treasury.delete')) && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td colSpan={11} className="p-3">
                      <EditTreasuryEntryForm
                        entry={entry}
                        onSaved={() => {
                          setEditingId(null);
                          refreshAll();
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground p-3">{new Date(entry.date).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      <StatusBadge tone={treasuryTypeTone(entry.type)}>{TREASURY_TYPE_LABELS[entry.type]}</StatusBadge>
                    </td>
                    <td className="p-3 font-medium">{entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">{entry.method ? PAYMENT_METHOD_LABELS[entry.method] : '—'}</td>
                    <td className="p-3">{entry.category ?? '—'}</td>
                    <td className="text-muted-foreground p-3">{entry.note ?? '—'}</td>
                    <td className="p-3">{partnerName(entry.partnerId)}</td>
                    <td className="text-muted-foreground p-3">{branchName(entry.branchId)}</td>
                    <td className="text-muted-foreground p-3">{staffName(entry.staffId)}</td>
                    <td className="text-muted-foreground p-3">
                      {entry.sourceType === 'INVOICE_PAYMENT' ? 'تحصيل فاتورة تلقائي' : 'يدوي'}
                    </td>
                    {(can('treasury.edit') || can('treasury.delete')) && (
                      <td className="p-3">
                        {entry.sourceType === 'MANUAL' && (
                          <div className="flex gap-1">
                            {can('treasury.edit') && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(entry.id)}>
                                تعديل
                              </Button>
                            )}
                            {can('treasury.delete') && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntry(entry)}>
                                حذف
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ),
              )}
              {entries.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-3 text-center" colSpan={11}>
                    لا توجد حركات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * FEATURE-007 M3 — what a `treasury.create`-only caller (reception) sees:
 * a form to record entries, and their own running total. No balance, no
 * per-wallet breakdown, no other staff's entries — matches the locked
 * decision exactly ("يشوف إجمالي حركاته هو بس").
 */
function ReceptionTreasuryView() {
  const { can, authContext } = useAuth();
  const [summary, setSummary] = useState<MyTreasurySummary | null>(null);
  const [myEntries, setMyEntries] = useState<TreasuryEntry[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => {
    apiGet<MyTreasurySummary>('/api/treasury-entries/my-summary')
      .then(setSummary)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل ملخص حركاتك'));
    apiGet<TreasuryEntry[]>('/api/treasury-entries')
      .then(setMyEntries)
      .catch(() => undefined);
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => undefined);
  }, []);

  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const myBranchName = authContext ? branchName(authContext.user.branchId) : null;

  const removeEntry = async (entry: TreasuryEntry) => {
    if (!confirm('حذف هذه الحركة؟')) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-entries/${entry.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحركة');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الوارد والمنصرف{myBranchName ? ` — ${myBranchName}` : ''}</h1>

      {/* FEATURE-007 M3 (2026-08-13, owner: "لو حاطه في فرع كليوباترا يبقى الوارد والمنصرف بتاعه في كليوباترا بس") — this total/list is the caller's own branch's ledger, not just entries they personally recorded within it. */}
      <Card className="p-4">
        <p className="text-muted-foreground text-sm">إجمالي حركات الفرع</p>
        <p className="text-xl font-bold">{(summary?.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        <p className="text-muted-foreground mt-1 text-xs">{summary?.entryCount ?? 0} حركة</p>
      </Card>

      <NewEntryForm branches={branches} partners={partners} onCreated={load} />

      {!myEntries ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">التاريخ</th>
                <th className="p-3">النوع</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">طريقة الدفع</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3">الملاحظات</th>
                <th className="p-3">العميل/المورّد</th>
                <th className="p-3">الفرع</th>
                {(can('treasury.edit') || can('treasury.delete')) && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {myEntries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td colSpan={9} className="p-3">
                      <EditTreasuryEntryForm
                        entry={entry}
                        onSaved={() => {
                          setEditingId(null);
                          load();
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground p-3">{new Date(entry.date).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      <StatusBadge tone={treasuryTypeTone(entry.type)}>{TREASURY_TYPE_LABELS[entry.type]}</StatusBadge>
                    </td>
                    <td className="p-3 font-medium">{entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">{entry.method ? PAYMENT_METHOD_LABELS[entry.method] : '—'}</td>
                    <td className="p-3">{entry.category ?? '—'}</td>
                    <td className="text-muted-foreground p-3">{entry.note ?? '—'}</td>
                    <td className="p-3">{partnerName(entry.partnerId)}</td>
                    <td className="text-muted-foreground p-3">{branchName(entry.branchId)}</td>
                    {(can('treasury.edit') || can('treasury.delete')) && (
                      <td className="p-3">
                        {entry.sourceType === 'MANUAL' && (
                          <div className="flex gap-1">
                            {can('treasury.edit') && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(entry.id)}>
                                تعديل
                              </Button>
                            )}
                            {can('treasury.delete') && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntry(entry)}>
                                حذف
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ),
              )}
              {myEntries.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-3 text-center" colSpan={9}>
                    لا توجد حركات مسجّلة على الفرع بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** FEATURE-007 (2026-08-12) — inline correction for a manual entry (amount/method/category/note/date only — `type`/`branchId`/`partnerId` stay fixed, matching `updateTreasuryEntrySchema`'s own shape). */
function EditTreasuryEntryForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: TreasuryEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(entry.amount.toString());
  const [method, setMethod] = useState<PaymentMethod>(entry.method ?? 'CASH');
  const [category, setCategory] = useState(entry.category ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: UpdateTreasuryEntryInput = {
        amount: Number(amount),
        method,
        category: category || null,
        note: note || null,
        date: new Date(date).toISOString(),
      };
      await apiPut(`/api/treasury-entries/${entry.id}`, input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {error && <div className="text-destructive w-full text-xs">{error}</div>}
      <label className="w-28 space-y-1 text-xs">
        <span className="text-muted-foreground">المبلغ</span>
        <input
          type="number"
          min={0}
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-40 space-y-1 text-xs">
        <span className="text-muted-foreground">طريقة الدفع</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        >
          {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="w-36 space-y-1 text-xs">
        <span className="text-muted-foreground">التاريخ</span>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">التصنيف (اختياري)</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="مثال: إيجار، مرتبات، كهرباء"
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">تفاصيل — اتصرفت في إيه بالظبط؟ (اختياري)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? '...' : 'حفظ'}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}

function NewEntryForm({
  branches,
  partners,
  onCreated,
}: {
  branches: BranchSummary[];
  partners: BusinessPartner[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<TreasuryType>('INCOME');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [partnerId, setPartnerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Adjust local selection during render when `branches` finishes loading
  // after this form has already mounted — the same pattern already used
  // by QuotationDetail.tsx's QuotationLifecycle, avoiding an effect-
  // triggered cascading render.
  if (!branchId && branches.length > 0) {
    setBranchId(branches[0].id);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateTreasuryEntryInput = {
        type,
        method,
        amount: Number(amount),
        category: category || undefined,
        note: note || undefined,
        date: new Date(date).toISOString(),
        branchId,
        partnerId: partnerId || undefined,
      };
      await apiPost('/api/treasury-entries', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الحركة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">النوع</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TreasuryType)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(TREASURY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">المبلغ</span>
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">طريقة الدفع</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">التاريخ</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الفرع</span>
          <select
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">العميل/المورّد (اختياري)</span>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— بدون —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">التصنيف (اختياري)</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="مثال: إيجار، مرتبات، كهرباء"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">تفاصيل — اتصرفت في إيه بالظبط؟ (اختياري)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="مثال: صيانة ماكينة الطباعة الكبيرة"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ الحركة'}
      </Button>
    </form>
  );
}
