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
} from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TreasuryType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

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
  }, []);

  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');

  const refreshAll = () => {
    loadList();
    loadBalance();
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
                <th className="p-3">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
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
                  <td className="text-muted-foreground p-3">
                    {entry.sourceType === 'INVOICE_PAYMENT' ? 'تحصيل فاتورة تلقائي' : 'يدوي'}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-3 text-center" colSpan={8}>
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
  const [summary, setSummary] = useState<MyTreasurySummary | null>(null);
  const [myEntries, setMyEntries] = useState<TreasuryEntry[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الوارد والمنصرف</h1>

      <Card className="p-4">
        <p className="text-muted-foreground text-sm">إجمالي حركاتك</p>
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
                <th className="p-3">العميل/المورّد</th>
              </tr>
            </thead>
            <tbody>
              {myEntries.map((entry) => (
                <tr key={entry.id} className="border-border border-b last:border-0">
                  <td className="text-muted-foreground p-3">{new Date(entry.date).toLocaleDateString('en-GB')}</td>
                  <td className="p-3">
                    <StatusBadge tone={treasuryTypeTone(entry.type)}>{TREASURY_TYPE_LABELS[entry.type]}</StatusBadge>
                  </td>
                  <td className="p-3 font-medium">{entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3">{entry.method ? PAYMENT_METHOD_LABELS[entry.method] : '—'}</td>
                  <td className="p-3">{entry.category ?? '—'}</td>
                  <td className="p-3">{partnerName(entry.partnerId)}</td>
                </tr>
              ))}
              {myEntries.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-3 text-center" colSpan={6}>
                    لسه معملتش أي حركة.
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
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات (اختياري)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ الحركة'}
      </Button>
    </form>
  );
}
