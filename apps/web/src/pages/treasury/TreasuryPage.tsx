import { useEffect, useState } from 'react';
import type {
  BranchSummary,
  BusinessPartner,
  CreateTreasuryEntryInput,
  MyTreasurySummary,
  PaymentMethod,
  TreasuryBalance,
  TreasuryCategory,
  TreasuryDayClosure,
  TreasuryDayClosurePreview,
  TreasuryEntry,
  TreasuryType,
  UpdateTreasuryEntryInput,
  User,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox, StatusBadge, EditableDateCell, EditableNumberCell, EditableSelectCell, EditableTextCell, useConfirm } from '@/components/cleopatra';
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
  const { can, authContext } = useAuth();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<TreasuryEntry[] | null>(null);
  const [balance, setBalance] = useState<TreasuryBalance | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [closureBranchId, setClosureBranchId] = useState('');
  const [closureRefreshTick, setClosureRefreshTick] = useState(0);
  const isAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN' || r.name === 'ADMIN') ?? false;

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
    apiGet<User[]>('/api/users').then(setStaff).catch(() => undefined);
  }, []);

  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? '—';
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const refreshAll = () => {
    loadList();
    loadBalance();
    setClosureRefreshTick((t) => t + 1);
  };

  /** FEATURE-007 (2026-08-12, owner: "محتاج قسم الوارد والمنصرف ضروري علشان ابدأ افعله عندي واشتغل من عليه") — the module itself already existed end-to-end (this page); the actual gap was no way to fix a mistaken entry, which real daily use immediately needs. Automatic `INVOICE_PAYMENT` entries stay read-only (guarded server-side too — see `ManualEntryOnlyError`). */
  const removeEntry = async (entry: TreasuryEntry) => {
    if (!(await confirm({ title: 'حذف هذه الحركة؟', destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-entries/${entry.id}`);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحركة');
    }
  };

  const updateEntryField = async (entry: TreasuryEntry, patch: UpdateTreasuryEntryInput) => {
    await apiPut(`/api/treasury-entries/${entry.id}`, patch);
    refreshAll();
  };

  /** Owner (2026-08-23, "البيع السريع المفروض اقدر اعدله من الخزينة احذفه مثلا وهكذا") — reuses the same StockMovement delete the inventory screen already had (restocks the item automatically), just reached from here. */
  const removeQuickSaleEntry = async (entry: TreasuryEntry) => {
    if (!(await confirm({ title: 'حذف حركة البيع السريع دي؟', description: 'هيترجع الصنف للمخزون تلقائيًا.', destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-entries/${entry.id}/quick-sale-movement`);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف حركة البيع السريع');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الخزينة والنقدية</h1>
        <div className="flex gap-2">
          {can('employees.edit') && (
            <Button type="button" variant="secondary" onClick={() => setShowAdvanceForm(true)}>
              صرف سلفة لموظف
            </Button>
          )}
          {can('treasury.create') && (
            <Button type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'إلغاء' : '+ حركة جديدة'}
            </Button>
          )}
        </div>
      </div>

      {/* Owner (2026-08-20, "لما ادوس حركة جديدة يظهرها قدامي على طول
          مش انا اللي انزل علشان اوصلها") — this form used to render
          below the balance cards, wallet cards, and branch/day-closure
          card, so clicking the button never actually scrolled it into
          view. Moved above all of that, same fix as the inventory
          "تسجيل بضاعة" form. */}
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

      {/* FEATURE-016, rebuilt 2026-08-18 — admins oversee every branch's register, so unlike ReceptionTreasuryView's implicit "my own branch," this view picks which branch's day to review/close/reopen. */}
      {branches.length > 0 && (
        <div className="space-y-2">
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="text-muted-foreground">الفرع</span>
            <select
              value={closureBranchId || branches[0].id}
              onChange={(e) => setClosureBranchId(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <DailyClosureCard
            branchId={closureBranchId || branches[0].id}
            isAdmin={isAdmin}
            onChanged={refreshAll}
            refreshSignal={closureRefreshTick}
          />
        </div>
      )}

      {showAdvanceForm && (
        <GiveAdvanceDialog
          staff={staff}
          onClose={() => setShowAdvanceForm(false)}
          onCreated={() => {
            setShowAdvanceForm(false);
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
                {can('treasury.delete') && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const canEditEntry = can('treasury.edit') && entry.sourceType === 'MANUAL';
                return (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground p-3">
                      {canEditEntry ? (
                        <EditableDateCell
                          value={entry.date.slice(0, 10)}
                          onSave={(next) => {
                            if (!next) throw new Error('التاريخ مطلوب');
                            return updateEntryField(entry, { date: new Date(next).toISOString() });
                          }}
                        />
                      ) : (
                        new Date(entry.date).toLocaleDateString('en-GB')
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone={treasuryTypeTone(entry.type)}>{TREASURY_TYPE_LABELS[entry.type]}</StatusBadge>
                    </td>
                    <td className="p-3 font-medium">
                      {canEditEntry ? (
                        <EditableNumberCell
                          value={entry.amount}
                          min={0.01}
                          step={0.01}
                          onSave={(next) => updateEntryField(entry, { amount: next })}
                        />
                      ) : (
                        entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <EditableSelectCell
                          value={entry.method ?? 'CASH'}
                          options={PAYMENT_METHOD_OPTIONS}
                          onSave={(next) => updateEntryField(entry, { method: next })}
                        />
                      ) : entry.method ? (
                        PAYMENT_METHOD_LABELS[entry.method]
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <EditableTextCell
                          value={entry.category ?? ''}
                          placeholder="—"
                          onSave={(next) => updateEntryField(entry, { category: next || null })}
                        />
                      ) : (
                        (entry.category ?? '—')
                      )}
                    </td>
                    <td className="text-muted-foreground p-3">
                      {canEditEntry ? (
                        <EditableTextCell
                          value={entry.note ?? ''}
                          placeholder="—"
                          onSave={(next) => updateEntryField(entry, { note: next || null })}
                        />
                      ) : (
                        (entry.note ?? '—')
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <Combobox
                          items={partners}
                          value={entry.partnerId ?? ''}
                          getKey={(p) => p.id}
                          getLabel={(p) => p.nameAr}
                          onChange={(p) => updateEntryField(entry, { partnerId: p.id })}
                          placeholder="— بدون —"
                          className="min-w-[140px]"
                        />
                      ) : (
                        partnerName(entry.partnerId)
                      )}
                      {canEditEntry && entry.partnerId && (
                        <button
                          type="button"
                          onClick={() => void updateEntryField(entry, { partnerId: null })}
                          className="text-destructive ms-1 text-xs hover:underline"
                        >
                          ✕ إزالة
                        </button>
                      )}
                    </td>
                    <td className="text-muted-foreground p-3">{branchName(entry.branchId)}</td>
                    <td className="text-muted-foreground p-3">{staffName(entry.staffId)}</td>
                    <td className="text-muted-foreground p-3">
                      {entry.sourceType === 'INVOICE_PAYMENT' ? 'تحصيل فاتورة تلقائي' : entry.sourceType === 'QUICK_SALE' ? 'بيع سريع' : 'يدوي'}
                    </td>
                    {can('treasury.delete') && (
                      <td className="p-3">
                        {entry.sourceType === 'MANUAL' && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntry(entry)}>
                            حذف
                          </Button>
                        )}
                        {entry.sourceType === 'QUICK_SALE' && can('inventory.delete') && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void removeQuickSaleEntry(entry)}>
                            حذف
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
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
  const confirm = useConfirm();
  const [summary, setSummary] = useState<MyTreasurySummary | null>(null);
  const [myEntries, setMyEntries] = useState<TreasuryEntry[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closureRefreshTick, setClosureRefreshTick] = useState(0);

  const load = () => {
    apiGet<MyTreasurySummary>('/api/treasury-entries/my-summary')
      .then(setSummary)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل ملخص حركاتك'));
    apiGet<TreasuryEntry[]>('/api/treasury-entries')
      .then(setMyEntries)
      .catch(() => undefined);
    setClosureRefreshTick((t) => t + 1);
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => undefined);
  }, []);

  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const myBranchName = authContext ? branchName(authContext.user.branchId) : null;
  const isAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN' || r.name === 'ADMIN') ?? false;

  const removeEntry = async (entry: TreasuryEntry) => {
    if (!(await confirm({ title: 'حذف هذه الحركة؟', destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-entries/${entry.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحركة');
    }
  };

  const updateEntryField = async (entry: TreasuryEntry, patch: UpdateTreasuryEntryInput) => {
    await apiPut(`/api/treasury-entries/${entry.id}`, patch);
    load();
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

      <DailyClosureCard isAdmin={isAdmin} onChanged={load} refreshSignal={closureRefreshTick} />

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
                {can('treasury.delete') && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {myEntries.map((entry) => {
                const canEditEntry = can('treasury.edit') && entry.sourceType === 'MANUAL';
                return (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td className="text-muted-foreground p-3">
                      {canEditEntry ? (
                        <EditableDateCell
                          value={entry.date.slice(0, 10)}
                          onSave={(next) => {
                            if (!next) throw new Error('التاريخ مطلوب');
                            return updateEntryField(entry, { date: new Date(next).toISOString() });
                          }}
                        />
                      ) : (
                        new Date(entry.date).toLocaleDateString('en-GB')
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge tone={treasuryTypeTone(entry.type)}>{TREASURY_TYPE_LABELS[entry.type]}</StatusBadge>
                    </td>
                    <td className="p-3 font-medium">
                      {canEditEntry ? (
                        <EditableNumberCell
                          value={entry.amount}
                          min={0.01}
                          step={0.01}
                          onSave={(next) => updateEntryField(entry, { amount: next })}
                        />
                      ) : (
                        entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <EditableSelectCell
                          value={entry.method ?? 'CASH'}
                          options={PAYMENT_METHOD_OPTIONS}
                          onSave={(next) => updateEntryField(entry, { method: next })}
                        />
                      ) : entry.method ? (
                        PAYMENT_METHOD_LABELS[entry.method]
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <EditableTextCell
                          value={entry.category ?? ''}
                          placeholder="—"
                          onSave={(next) => updateEntryField(entry, { category: next || null })}
                        />
                      ) : (
                        (entry.category ?? '—')
                      )}
                    </td>
                    <td className="text-muted-foreground p-3">
                      {canEditEntry ? (
                        <EditableTextCell
                          value={entry.note ?? ''}
                          placeholder="—"
                          onSave={(next) => updateEntryField(entry, { note: next || null })}
                        />
                      ) : (
                        (entry.note ?? '—')
                      )}
                    </td>
                    <td className="p-3">
                      {canEditEntry ? (
                        <Combobox
                          items={partners}
                          value={entry.partnerId ?? ''}
                          getKey={(p) => p.id}
                          getLabel={(p) => p.nameAr}
                          onChange={(p) => updateEntryField(entry, { partnerId: p.id })}
                          placeholder="— بدون —"
                          className="min-w-[140px]"
                        />
                      ) : (
                        partnerName(entry.partnerId)
                      )}
                      {canEditEntry && entry.partnerId && (
                        <button
                          type="button"
                          onClick={() => void updateEntryField(entry, { partnerId: null })}
                          className="text-destructive ms-1 text-xs hover:underline"
                        >
                          ✕ إزالة
                        </button>
                      )}
                    </td>
                    <td className="text-muted-foreground p-3">{branchName(entry.branchId)}</td>
                    {can('treasury.delete') && (
                      <td className="p-3">
                        {entry.sourceType === 'MANUAL' && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntry(entry)}>
                            حذف
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
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

function ClosureRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger' | 'emphasis';
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'emphasis' ? 'font-semibold' : '';
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={toneClass}>{value}</span>
    </div>
  );
}

/**
 * FEATURE-016, rebuilt 2026-08-18 per the owner's detailed spec — a real
 * cash-drawer reconciliation (Opening + Inflows - Outflows = Expected, vs.
 * what the employee actually counted), replacing the old review-marker-only
 * version. `branchId` unset means "my own branch" (reception's normal
 * case, server defaults to `auth.branchId`); admins on `FullTreasuryView`
 * pass an explicit branch to review/close/reopen any branch's day.
 * Reopening is admin-only client-side too (`isAdmin`) — pure UX, the
 * server enforces the real gate regardless (see `reopenTreasuryDayHandler`).
 */
function DailyClosureCard({
  branchId,
  isAdmin,
  onChanged,
  refreshSignal,
}: {
  branchId?: string;
  isAdmin: boolean;
  onChanged: () => void;
  /** Bumped by the parent whenever an entry is created/edited/deleted elsewhere on the page, so this card's preview numbers stay in sync without re-fetching on every render. */
  refreshSignal?: number;
}) {
  const confirm = useConfirm();
  const [closure, setClosure] = useState<TreasuryDayClosure | null>(null);
  const [preview, setPreview] = useState<TreasuryDayClosurePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const qs = branchId ? `?branchId=${branchId}` : '';

  const load = () => {
    setError(null);
    Promise.all([
      apiGet<TreasuryDayClosure | null>(`/api/treasury-entries/today-closure${qs}`),
      apiGet<TreasuryDayClosurePreview>(`/api/treasury-entries/day-closure-preview${qs}`),
    ])
      .then(([c, p]) => {
        setClosure(c);
        setPreview(p);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات تقفيل اليوم'));
  };

  useEffect(load, [branchId, refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const isClosed = closure !== null && !closure.isOpen;

  const closeDay = async () => {
    if (actualCash.trim() === '' || Number.isNaN(Number(actualCash))) {
      setError('اكتب قيمة النقدية الفعلية اللي في الدرج');
      return;
    }
    if (
      !(await confirm({
        title: 'تقفيل حساب اليوم؟',
        description: 'لن تقدر تسجّل حركات نقدية جديدة على هذا اليوم إلا بإعادة فتحه.',
      }))
    )
      return;
    setClosing(true);
    setError(null);
    try {
      const created = await apiPost<TreasuryDayClosure>('/api/treasury-entries/close-day', {
        actualCountedCash: Number(actualCash),
        notes: closeNotes.trim() || undefined,
        branchId,
      });
      setClosure(created);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تقفيل حساب اليوم');
    } finally {
      setClosing(false);
    }
  };

  const reopenDay = async () => {
    if (!closure) return;
    if (!reopenReason.trim()) {
      setError('اكتب سبب إعادة الفتح');
      return;
    }
    setReopening(true);
    setError(null);
    try {
      const updated = await apiPost<TreasuryDayClosure>('/api/treasury-entries/reopen-day', {
        date: closure.date,
        reason: reopenReason.trim(),
        branchId,
      });
      setClosure(updated);
      setShowReopenForm(false);
      setReopenReason('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعادة فتح اليوم');
    } finally {
      setReopening(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">تقفيل حساب اليوم (كاش)</h2>
        {isClosed && <StatusBadge tone="success">مقفول</StatusBadge>}
        {closure?.isOpen && <StatusBadge tone="warning">معاد فتحه</StatusBadge>}
      </div>

      {error && <div className="text-destructive text-sm">{error}</div>}

      {isClosed && closure ? (
        <div className="space-y-2 text-sm">
          <ClosureRow label="الرصيد الافتتاحي" value={fmt(closure.openingBalance)} />
          <ClosureRow label="الوارد" value={fmt(closure.totalInflows)} />
          <ClosureRow label="المنصرف" value={fmt(closure.totalOutflows)} />
          <ClosureRow label="المتبقي المتوقع" value={fmt(closure.expectedClosingBalance)} tone="emphasis" />
          <ClosureRow label="النقدية الفعلية" value={fmt(closure.actualCountedCash)} tone="emphasis" />
          <ClosureRow
            label={closure.difference === 0 ? 'الفرق' : closure.difference > 0 ? 'زيادة' : 'عجز'}
            value={fmt(closure.difference)}
            tone={closure.difference === 0 ? undefined : closure.difference > 0 ? 'success' : 'danger'}
          />
          {closure.notes && <p className="text-muted-foreground text-xs">ملاحظات: {closure.notes}</p>}
          <p className="text-muted-foreground text-xs">قُفل {new Date(closure.closedAt).toLocaleString('ar-EG')}</p>
          {closure.reopenedAt && (
            <p className="text-warning-foreground text-xs">
              تم إعادة فتحه سابقًا في {new Date(closure.reopenedAt).toLocaleString('ar-EG')}
              {closure.reopenReason ? ` — السبب: ${closure.reopenReason}` : ''}
            </p>
          )}

          {isAdmin && !showReopenForm && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowReopenForm(true)}>
              إعادة فتح اليوم
            </Button>
          )}
          {isAdmin && showReopenForm && (
            <div className="border-warning/40 bg-warning/10 space-y-2 rounded-lg border p-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">سبب إعادة الفتح</span>
                <input
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="مثال: خطأ في العدّ، حركة اتسجلت غلط"
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={reopening} onClick={() => void reopenDay()}>
                  {reopening ? 'جارٍ إعادة الفتح…' : 'تأكيد إعادة الفتح'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowReopenForm(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : preview ? (
        <div className="space-y-3">
          <div className="space-y-2 text-sm">
            <ClosureRow label="الرصيد الافتتاحي" value={fmt(preview.openingBalance)} />
            <ClosureRow label="الوارد (كاش)" value={fmt(preview.totalInflows)} />
            <ClosureRow label="المنصرف (كاش)" value={fmt(preview.totalOutflows)} />
            <ClosureRow label="المتبقي المتوقع" value={fmt(preview.expectedClosingBalance)} tone="emphasis" />
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">النقدية الفعلية في الدرج</span>
            <input
              type="number"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </label>
          {actualCash.trim() !== '' && !Number.isNaN(Number(actualCash)) && (
            <p className="text-muted-foreground text-xs">
              الفرق المتوقع: {fmt(Number(actualCash) - preview.expectedClosingBalance)}
            </p>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظات (اختياري)</span>
            <input
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <Button type="button" disabled={closing} onClick={() => void closeDay()}>
            {closing ? 'جارٍ التقفيل…' : 'تقفيل حساب اليوم'}
          </Button>
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>
      )}
    </Card>
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
  const [categories, setCategories] = useState<TreasuryCategory[]>([]);
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    apiGet<TreasuryCategory[]>('/api/treasury-categories')
      .then((all) => setCategories(all.filter((c) => c.isActive)))
      .catch(() => undefined);
  }, []);
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
            autoFocus
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
          <Combobox
            items={[{ id: '', nameAr: '— بدون —' }, ...partners]}
            value={partnerId}
            getKey={(p) => p.id}
            getLabel={(p) => p.nameAr}
            onChange={(p) => setPartnerId(p.id)}
            placeholder="— بدون —"
            searchPlaceholder="اكتب اسم العميل/المورّد…"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">التصنيف (اختياري)</span>
          {customCategory ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="اكتب تصنيف جديد"
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCustomCategory(false);
                  setCategory('');
                }}
              >
                إلغاء
              </Button>
            </div>
          ) : (
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomCategory(true);
                  setCategory('');
                } else {
                  setCategory(e.target.value);
                }
              }}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">— بدون —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="__custom__">تصنيف آخر (كتابة يدوية)…</option>
            </select>
          )}
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

/**
 * FEATURE-008 (2026-08-13, owner: "هل أقدر إني اصرف سلفه من الخزينة
 * وتتسجل عند الموظف؟"). A second entry point to the exact same
 * `POST /api/employee-advances` endpoint the employee profile page's
 * "+ سلفة جديدة" already uses — not a separate manual Treasury entry with
 * a free-text "سلفة موظف" category (which would show in the ledger but
 * never link to the employee's own advances/salary report). Whichever
 * screen you start from, it's the same atomic advance+TreasuryEntry
 * operation, so the two can never drift apart.
 */
function GiveAdvanceDialog({ staff, onClose, onCreated }: { staff: User[]; onClose: () => void; onCreated: () => void }) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [walletMethod, setWalletMethod] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedStaff = staff.find((s) => s.id === staffId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !selectedStaff) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/employee-advances', {
        staffId,
        branchId: selectedStaff.branchId,
        amount: Number(amount),
        date,
        reason: reason.trim() || undefined,
        walletMethod,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر صرف السلفة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صرف سلفة لموظف</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الموظف</span>
            <Combobox
              items={staff}
              value={staffId}
              getKey={(s) => s.id}
              getLabel={(s) => s.name}
              onChange={(s) => setStaffId(s.id)}
              searchPlaceholder="اكتب اسم الموظف…"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              required
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المحفظة التي صُرف منها</span>
            <select
              value={walletMethod}
              onChange={(e) => setWalletMethod(e.target.value as PaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">السبب (اختياري)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'صرف السلفة'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
