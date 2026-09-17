import { useEffect, useState } from 'react';
import type { BranchSummary, CreateExpenseInput, Expense, ExpenseStatus, PaymentMethod } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useIdempotencyKeyMap } from '@/lib/useIdempotencyKey';
import { Button } from '@/components/ui/button';
import { StatusBadge, useConfirm, type StatusTone } from '@/components/cleopatra';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';
import { useAuth } from '@/state/AuthContext';

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  DUE: 'مستحق',
  PAID: 'مدفوع',
};
const STATUS_TONES: Record<ExpenseStatus, StatusTone> = {
  DUE: 'warning',
  PAID: 'success',
};

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('ar-EG');

/**
 * Accounting audit fix (2026-09-17, Decision 6 / Phase I) — a dedicated,
 * individually-tracked business expense with a DUE -> PAID lifecycle,
 * distinct from "المصاريف الشهرية الثابتة" (embedded inside the Treasury
 * page itself, Super-Admin-only recurring overhead used for profit
 * reporting only — see `FixedMonthlyExpensesEditor.tsx`). This is the
 * operational "سجّل مصروف واحد وادفعه لما
 * تدفعه فعلًا" screen — a DUE row never touches Treasury; marking it PAID
 * atomically posts exactly one Treasury OUT.
 */
export function ExpensesPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canCreate = can('expenses.create');
  const canEdit = can('expenses.edit');
  const canDelete = can('expenses.delete');

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | ExpenseStatus>('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  // Accounting audit fix (2026-09-17) — mark-paid had no in-flight guard at
  // all (unlike every other mutation on this page). `submittingPayId` is
  // deliberately separate from `payingId` (which row's pay-form is OPEN):
  // it tracks which row's request is actually in flight, so a double-click
  // on the same row's "تأكيد" is blocked while a different row's payment
  // (a genuinely independent operation) is never blocked by it. Keyed by
  // expense id, same reasoning as the two quick-sale flows' per-line keys.
  const [submittingPayId, setSubmittingPayId] = useState<string | null>(null);
  const markPaidIdempotency = useIdempotencyKeyMap<string>();

  const load = () => {
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    apiGet<Expense[]>(`/api/expenses${qs}`)
      .then(setExpenses)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المصروفات'));
  };

  useEffect(load, [statusFilter]);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
  }, []);

  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'الشركة كلها');

  const remove = async (expense: Expense) => {
    if (!(await confirm({ title: `حذف مصروف "${expense.description}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/expenses/${expense.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  const markPaid = async (id: string, method: PaymentMethod) => {
    if (submittingPayId === id) return;
    setError(null);
    setSubmittingPayId(id);
    try {
      await apiPost(`/api/expenses/${id}/mark-paid`, { method }, markPaidIdempotency.getKey(id));
      markPaidIdempotency.resetKey(id); // definitive success — paying this expense again is impossible (already PAID), but keep the map tidy
      setPayingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل السداد');
    } finally {
      setSubmittingPayId(null);
    }
  };

  if (error && !expenses) return <div className="text-destructive">{error}</div>;
  if (!expenses) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المصروفات</h1>
          <p className="text-muted-foreground text-xs">
            سجّل مصروف مستحق، وسدّده لما تدفعه فعلًا — السداد هو اللي بيتسجل في الخزينة، مش تسجيل المصروف نفسه.
          </p>
        </div>
        {canCreate && <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ مصروف جديد'}</Button>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showCreate && (
        <CreateExpenseForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="flex gap-2 text-sm">
        {(['', 'DUE', 'PAID'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s
                ? 'bg-primary text-primary-foreground rounded-full px-3 py-1'
                : 'bg-muted text-muted-foreground rounded-full px-3 py-1'
            }
          >
            {s ? STATUS_LABELS[s] : 'الكل'}
          </button>
        ))}
      </div>

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">الوصف</th>
              <th className="p-3">الفئة</th>
              <th className="p-3">الجهة</th>
              <th className="p-3">تاريخ الاستحقاق</th>
              <th className="p-3">المبلغ</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الفرع</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-border border-b last:border-0">
                <td className="p-3 font-medium">{e.description}</td>
                <td className="text-muted-foreground p-3">{e.category ?? '—'}</td>
                <td className="text-muted-foreground p-3">{e.payee ?? '—'}</td>
                <td className="p-3">{dateOnly(e.incurredDate)}</td>
                <td className="p-3" dir="ltr">
                  {money(e.amount)}
                </td>
                <td className="p-3">
                  <StatusBadge tone={STATUS_TONES[e.status]}>
                    {STATUS_LABELS[e.status]}
                    {e.status === 'PAID' && e.method ? ` — ${PAYMENT_METHOD_LABELS[e.method]}` : ''}
                  </StatusBadge>
                </td>
                <td className="text-muted-foreground p-3">{branchName(e.branchId)}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-3">
                    {canEdit && e.status === 'DUE' && payingId !== e.id && (
                      <button type="button" onClick={() => setPayingId(e.id)} className="text-success text-xs hover:underline">
                        تسجيل السداد
                      </button>
                    )}
                    {canEdit && payingId === e.id && (
                      <MarkPaidInline
                        submitting={submittingPayId === e.id}
                        onConfirm={(method) => markPaid(e.id, method)}
                        onCancel={() => setPayingId(null)}
                      />
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => void remove(e)} className="text-destructive text-xs hover:underline">
                        حذف
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={8}>
                  لا توجد مصروفات مسجّلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkPaidInline({
  submitting,
  onConfirm,
  onCancel,
}: {
  submitting: boolean;
  onConfirm: (method: PaymentMethod) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  return (
    <div className="flex items-center gap-1">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        disabled={submitting}
        className="border-input bg-background rounded-md border px-2 py-1 text-xs"
      >
        {PAYMENT_METHOD_OPTIONS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onConfirm(method)} disabled={submitting} className="text-success text-xs hover:underline disabled:opacity-50">
        {submitting ? 'جارٍ الحفظ…' : 'تأكيد'}
      </button>
      <button type="button" onClick={onCancel} disabled={submitting} className="text-muted-foreground text-xs hover:underline disabled:opacity-50">
        إلغاء
      </button>
    </div>
  );
}

function CreateExpenseForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [payee, setPayee] = useState('');
  const [reference, setReference] = useState('');
  const [incurredDate, setIncurredDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateExpenseInput = {
        description,
        amount: Number(amount),
        category: category.trim() || undefined,
        payee: payee.trim() || undefined,
        reference: reference.trim() || undefined,
        incurredDate,
        branchId: branchId || undefined,
      };
      await apiPost('/api/expenses', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة المصروف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="وصف المصروف"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          min={0}
          step="0.01"
          dir="ltr"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          placeholder="الفئة (اختياري)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="الجهة/المستفيد (اختياري)"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="رقم مرجعي/فاتورة (اختياري)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">تاريخ الاستحقاق</span>
          <input
            type="date"
            required
            value={incurredDate}
            onChange={(e) => setIncurredDate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      {branches.length > 1 && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm">
          <option value="">الشركة كلها</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
