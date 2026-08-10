import { useEffect, useState } from 'react';
import type { CreateInventoryItemInput, InventoryItem, MaterialCategory } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  PAPER: 'ورق',
  INK: 'حبر',
  PLATE: 'زنكات',
  FINISHING: 'تشطيب',
  CONSUMABLE: 'مستهلكات',
};

/**
 * FEATURE-007 M2 — "المخزن," a real, first-class module. Registering stock
 * happens here; auto-deduction on Order creation (M1's sheet calculation)
 * happens server-side and simply shows up as lower `quantityOnHand` the
 * next time this page loads — no separate "consumption" UI in this
 * milestone, per the plan's scope (M4 wires the order-creation form).
 */
export function InventoryPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [needsSupplier, setNeedsSupplier] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    apiGet<InventoryItem[]>('/api/inventory-items')
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المخزون'));
    apiGet<InventoryItem[]>('/api/inventory-items/needs-supplier')
      .then(setNeedsSupplier)
      .catch(() => undefined);
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المخزن</h1>
        {can('inventory.create') && (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'إلغاء' : '+ تسجيل بضاعة'}
          </Button>
        )}
      </div>

      {needsSupplier.length > 0 && (
        <Card className="border-danger/40 bg-danger/5 p-4">
          <p className="text-danger mb-2 font-semibold">بضاعة ناقصة — محتاجين نجيبها من المورد</p>
          <ul className="space-y-1 text-sm">
            {needsSupplier.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>{item.name}</span>
                <span className="text-muted-foreground">
                  الرصيد الحالي: <span className="font-medium">{item.quantityOnHand.toLocaleString('en-US')}</span>
                  {item.reorderLevel !== null && ` (حد التنبيه: ${item.reorderLevel.toLocaleString('en-US')})`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && (
        <NewInventoryItemForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {!items ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">الصنف</th>
                <th className="p-3">الفئة</th>
                <th className="p-3">الرصيد الحالي</th>
                <th className="p-3">حد التنبيه</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3">{CATEGORY_LABELS[item.category]}</td>
                  <td className="p-3">
                    {item.quantityOnHand.toLocaleString('en-US')} {item.unit === 'SHEET' ? 'فرخ' : ''}
                  </td>
                  <td className="text-muted-foreground p-3">{item.reorderLevel?.toLocaleString('en-US') ?? '—'}</td>
                  <td className="p-3">
                    {item.isLowStock ? (
                      <StatusBadge tone="danger">ناقصة</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">متوفرة</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="text-muted-foreground p-3 text-center" colSpan={5}>
                    لا توجد بضاعة مسجلة بعد.
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

function NewInventoryItemForm({ onCreated }: { onCreated: () => void }) {
  const [category, setCategory] = useState<MaterialCategory>('PAPER');
  const [name, setName] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateInventoryItemInput = {
        category,
        name,
        unit: 'SHEET',
        reorderLevel: reorderLevel ? Number(reorderLevel) : undefined,
        initialQuantity: initialQuantity ? Number(initialQuantity) : undefined,
      };
      await apiPost('/api/inventory-items', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الصنف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">اسم الصنف</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: دوبلكس 200 جرام"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الفئة</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الرصيد الحالي (فرخ)</span>
          <input
            type="number"
            min={0}
            value={initialQuantity}
            onChange={(e) => setInitialQuantity(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">حد التنبيه (اختياري)</span>
          <input
            type="number"
            min={0}
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
