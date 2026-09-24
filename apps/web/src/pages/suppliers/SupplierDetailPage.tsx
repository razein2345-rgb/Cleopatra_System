import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  BranchSummary,
  CreateSupplierPaymentInput,
  CreateSupplierPurchaseInput,
  PaymentMethod,
  SupplierStatement,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { CommercialTab } from '@/pages/partners/CommercialTab';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';
import { PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('ar-EG');

/**
 * ملف المورّد — كشف حساب حقيقي (owner: "أقدر اسجل دفعات واطبع كشف حساب"،
 * "أقدر احدد الفترة"). الملف التجاري (شروط الدفع) بيستخدم `CommercialTab`
 * الموجود بالفعل بدل ما نبني نسخة تانية منه — نفس البيانات المشتركة مع
 * صفحة العملاء (partners.credit.manage)، مش منطق مكرر.
 */
export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, authContext } = useAuth();
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[]>([]);

  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
  }, []);
  // Accounting audit fix (2026-09-17, Decision 2) — same "don't offer a
  // branch the backend will just clamp away" narrowing as TreasuryPage's
  // own `accessibleBranches`, now that supplier purchases/payments are
  // branch-scoped too.
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const accessibleBranches = isSuperAdmin ? branches : branches.filter((b) => authContext?.user.accessibleBranchIds.includes(b.id));

  const load = () => {
    if (!id) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    apiGet<SupplierStatement>(`/api/suppliers/${id}/statement${qs ? `?${qs}` : ''}`)
      .then(setStatement)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل كشف الحساب'));
  };

  useEffect(load, [id, from, to]);

  if (!id) return null;
  if (error) return <div className="text-destructive">{error}</div>;
  if (!statement) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const canCreate = can('suppliers.create');
  const canDelete = can('suppliers.delete');

  const deleteEntry = async (kind: 'PURCHASE' | 'PAYMENT', entryId: string) => {
    await apiDelete(`/api/suppliers/${kind === 'PURCHASE' ? 'purchases' : 'payments'}/${entryId}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{statement.nameAr}</h1>
          <Link to={`/partners/${id}`} className="text-muted-foreground text-xs hover:underline">
            الملف الكامل ↗
          </Link>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            طباعة كشف الحساب
          </Button>
          <Button variant="outline" onClick={() => downloadDocumentAsPdf(`كشف-حساب-${statement.nameAr}`)}>
            تنزيل PDF
          </Button>
        </div>
      </div>

      <CommercialTab partnerId={id} canManage={can('partners.credit.manage')} />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">من تاريخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">إلى تاريخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {(from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            مسح الفترة
          </Button>
        )}
        {canCreate && (
          <div className="mr-auto flex gap-2">
            <Button onClick={() => setShowAddPurchase((v) => !v)}>
              {showAddPurchase ? 'إلغاء' : '+ مشترى جديد'}
            </Button>
            <Button variant="outline" onClick={() => setShowAddPayment((v) => !v)}>
              {showAddPayment ? 'إلغاء' : '+ دفعة جديدة'}
            </Button>
          </div>
        )}
      </div>

      {showAddPurchase && (
        <AddPurchaseForm
          partnerId={id}
          branches={accessibleBranches}
          onSaved={() => {
            setShowAddPurchase(false);
            load();
          }}
        />
      )}
      {showAddPayment && (
        <AddPaymentForm
          partnerId={id}
          branches={accessibleBranches}
          onSaved={() => {
            setShowAddPayment(false);
            load();
          }}
        />
      )}

      <div className="document-print-root border-border bg-card space-y-3 rounded-2xl border p-4">
        <div className="hidden print:block">
          <h2 className="text-lg font-bold">كشف حساب — {statement.nameAr}</h2>
          {(from || to) && (
            <p className="text-muted-foreground text-sm">
              الفترة: {from || 'البداية'} — {to || 'اليوم'}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-muted-foreground text-xs">الرصيد الافتتاحي</p>
            <p className="font-semibold">{fmt(statement.openingBalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">الرصيد الختامي</p>
            <p className="font-semibold">{fmt(statement.closingBalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">عدد الحركات</p>
            <p className="font-semibold">{statement.entries.length}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-2">التاريخ</th>
                <th className="p-2">النوع</th>
                <th className="p-2">البيان</th>
                <th className="p-2">المبلغ</th>
                <th className="p-2">الرصيد بعدها</th>
                {canDelete && <th className="p-2 print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {statement.entries.map((entry) => (
                <tr key={entry.id} className="border-border border-b last:border-0">
                  <td className="p-2">{dateOnly(entry.date)}</td>
                  <td className="p-2">{entry.kind === 'PURCHASE' ? 'مشترى (عليك)' : 'دفعة (له)'}</td>
                  <td className="text-muted-foreground p-2">{entry.description ?? '—'}</td>
                  <td className={`p-2 ${entry.kind === 'PURCHASE' ? 'text-destructive' : 'text-success'}`}>
                    {entry.kind === 'PURCHASE' ? '+' : '−'}
                    {fmt(entry.amount)}
                  </td>
                  <td className="p-2 font-medium">{fmt(entry.runningBalance)}</td>
                  {canDelete && (
                    <td className="p-2 print:hidden">
                      <button
                        type="button"
                        onClick={() => deleteEntry(entry.kind, entry.id)}
                        className="text-destructive text-xs hover:underline"
                      >
                        حذف
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {statement.entries.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-2" colSpan={6}>
                    لا توجد حركات في هذه الفترة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddPurchaseForm({ partnerId, branches, onSaved }: { partnerId: string; branches: BranchSummary[]; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Same "adjust local selection once branches finish loading" pattern
  // TreasuryPage's NewEntryForm already uses.
  if (!branchId && branches.length > 0) {
    setBranchId(branches[0].id);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateSupplierPurchaseInput = {
        amount: Number(amount),
        description: description || undefined,
        date: new Date(date).toISOString(),
        branchId,
      };
      await apiPost(`/api/suppliers/${partnerId}/purchases`, input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المشترى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <p className="font-semibold">مشترى جديد — المورّد بياخد منك الفلوس دي (بيزيد المتبقي عليك)</p>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="البيان (مثلاً: اسم الصنف)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <select
          required
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
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'تسجيل المشترى'}
      </Button>
    </form>
  );
}

function AddPaymentForm({ partnerId, branches, onSaved }: { partnerId: string; branches: BranchSummary[]; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Accounting audit fix (2026-09-17) — supplier-payment idempotency key.
  const paymentIdempotency = useIdempotencyKey();

  if (!branchId && branches.length > 0) {
    setBranchId(branches[0].id);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateSupplierPaymentInput = {
        amount: Number(amount),
        note: note || undefined,
        date: new Date(date).toISOString(),
        method,
        branchId,
      };
      await apiPost(`/api/suppliers/${partnerId}/payments`, input, paymentIdempotency.getKey(`supplier-payment:${partnerId}`));
      paymentIdempotency.resetKey(`supplier-payment:${partnerId}`); // definitive success — the next payment (if any) is a genuinely new operation
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدفعة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <p className="font-semibold">دفعة جديدة — أنت بتدفع للمورّد (بتقلل المتبقي عليك). هتتسجل تلقائيًا كخارج من الخزينة.</p>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="ملاحظة (اختياري)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">طريقة الدفع</span>
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
          <span className="text-muted-foreground block">الفرع</span>
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
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'تسجيل الدفعة'}
      </Button>
    </form>
  );
}
