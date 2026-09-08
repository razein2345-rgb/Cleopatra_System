import { useState } from 'react';
import type { BranchSummary, FixedMonthlyExpense } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/cleopatra';

/**
 * Owner (2026-09-08, "محتاج قسم خاص بالخزينة يكون فيه المصروفات الشهرية
 * الدائمة علشان يخصمها من الربح يومياً... وأقدر أضيف انا بقى مصاريف
 * شهرية ثابته براحتي") — CRUD for `FixedMonthlyExpense` (rent,
 * subscriptions, ...), each ÷ 30 into the daily deduction shown against
 * net profit in `BranchFinancialSummaryTable`. Mirrors
 * `BoardsCatalogItemsEditor.tsx` exactly (same inline-form-row pattern) —
 * the caller (`TreasuryPage`) already gates rendering this to Super Admin
 * only, so there's no `can(...)` check here (unlike that editor's
 * `settings.edit`/`inventory.costPrice` — this data has no grantable
 * permission at all, deliberately, per the owner's "أنا بس اللي اقدر
 * اشوف").
 */
export function FixedMonthlyExpensesEditor({
  items,
  branches,
  onChanged,
}: {
  items: FixedMonthlyExpense[];
  branches: BranchSummary[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<FixedMonthlyExpense | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: FixedMonthlyExpense) => {
    if (!(await confirm({ title: `حذف "${item.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/fixed-monthly-expenses/${item.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المصروف');
    }
  };

  const dailyOf = (amount: number) => (amount / 30).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">المصاريف الشهرية الثابتة</h3>
        <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : '+ إضافة'}
        </Button>
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <FixedMonthlyExpenseForm
          branches={branches}
          onSubmit={(input) => apiPost('/api/fixed-monthly-expenses', input)}
          onSaved={() => {
            setShowCreate(false);
            onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <ul className="text-sm">
        {items.map((item) =>
          editing?.id === item.id ? (
            <li key={item.id} className="border-border border-b py-1.5">
              <FixedMonthlyExpenseForm
                branches={branches}
                initialName={item.name}
                initialAmount={item.amount}
                initialBranchId={item.branchId}
                onSubmit={(input) => apiPut(`/api/fixed-monthly-expenses/${item.id}`, input)}
                onSaved={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="border-border flex flex-wrap items-center justify-between gap-2 border-b py-1.5">
              <span>{item.name}</span>
              <div className="flex flex-wrap items-center gap-3">
                <span>{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج / شهريًا</span>
                <span className="text-muted-foreground text-xs">({dailyOf(item.amount)} ج / يوميًا)</span>
                <span className="text-muted-foreground text-xs">{item.branchName ?? 'عام على الشركة'}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                    تعديل
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(item)}>
                    حذف
                  </Button>
                </div>
              </div>
            </li>
          ),
        )}
        {items.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد مصاريف شهرية ثابتة بعد.</p>}
      </ul>
    </div>
  );
}

interface FixedMonthlyExpenseFormInput {
  name: string;
  amount: number;
  branchId: string | null;
}

function FixedMonthlyExpenseForm({
  initialName = '',
  initialAmount = 0,
  initialBranchId = null,
  branches,
  onSubmit,
  onSaved,
  onCancel,
}: {
  initialName?: string;
  initialAmount?: number;
  initialBranchId?: string | null;
  branches: BranchSummary[];
  onSubmit: (input: FixedMonthlyExpenseFormInput) => Promise<unknown>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [amount, setAmount] = useState(initialAmount);
  const [branchId, setBranchId] = useState(initialBranchId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name, amount, branchId: branchId || null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {error && <div className="text-destructive w-full text-xs">{error}</div>}
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">الاسم</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: إيجار مكان برينتنج"
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-32 space-y-1 text-xs">
        <span className="text-muted-foreground">المبلغ الشهري</span>
        <input
          type="number"
          step="0.01"
          min={0}
          required
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-44 space-y-1 text-xs">
        <span className="text-muted-foreground">الفرع (اختياري)</span>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">عام على الشركة</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
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
