import { useState } from 'react';
import type { BoardsCatalogItem } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Owner (2026-08-27, "المفروض أقدر أضيف خدمات في صنف اللوحات والإعلانات...
 * زي الروول اب") — an admin-managed catalog of flat-priced BOARDS
 * accessories (e.g. "روول أب") that don't fit the material/width/height
 * geometry formula. Mirrors ReadyProductsEditor.tsx exactly (same
 * grantable `inventory.costPrice` gating on the cost field), just with
 * `supplierCost` in place of `costPrice`.
 */
export function BoardsCatalogItemsEditor({
  items,
  onChanged,
}: {
  items: BoardsCatalogItem[];
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('settings.edit');
  const canSeeCostPrice = can('inventory.costPrice');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BoardsCatalogItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: BoardsCatalogItem) => {
    if (!(await confirm({ title: `حذف "${item.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/boards-catalog-items/${item.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الصنف');
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">كتالوج اللوحات والإعلانات (أصناف بسعر ثابت)</h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة'}
          </Button>
        )}
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <BoardsCatalogItemForm
          canSeeCostPrice={canSeeCostPrice}
          onSubmit={(name, price, supplierCost) => apiPost('/api/boards-catalog-items', { name, price, supplierCost })}
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
              <BoardsCatalogItemForm
                canSeeCostPrice={canSeeCostPrice}
                initialName={item.name}
                initialPrice={item.price}
                initialSupplierCost={item.supplierCost ?? null}
                onSubmit={(name, price, supplierCost) => apiPut(`/api/boards-catalog-items/${item.id}`, { name, price, supplierCost })}
                onSaved={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="border-border flex items-center justify-between border-b py-1.5">
              <span>{item.name}</span>
              <div className="flex items-center gap-3">
                <span>{item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج</span>
                {canSeeCostPrice && (
                  <span className="text-muted-foreground text-xs">
                    (تكلفة من المورد: {item.supplierCost != null ? item.supplierCost.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'})
                  </span>
                )}
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                      تعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(item)}>
                      حذف
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {items.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد أصناف بعد.</p>}
      </ul>
    </div>
  );
}

function BoardsCatalogItemForm({
  initialName = '',
  initialPrice = 0,
  initialSupplierCost = null,
  canSeeCostPrice,
  onSubmit,
  onSaved,
  onCancel,
}: {
  initialName?: string;
  initialPrice?: number;
  initialSupplierCost?: number | null;
  canSeeCostPrice: boolean;
  onSubmit: (name: string, price: number, supplierCost: number | undefined) => Promise<unknown>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPrice);
  const [supplierCost, setSupplierCost] = useState(initialSupplierCost != null ? String(initialSupplierCost) : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(name, price, canSeeCostPrice && supplierCost ? Number(supplierCost) : undefined);
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
          placeholder="مثال: روول أب"
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-28 space-y-1 text-xs">
        <span className="text-muted-foreground">السعر عندنا</span>
        <input
          type="number"
          step="0.01"
          min={0}
          required
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      {canSeeCostPrice && (
        <label className="w-32 space-y-1 text-xs">
          <span className="text-muted-foreground">تكلفة من المورد الحالي (اختياري)</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={supplierCost}
            onChange={(e) => setSupplierCost(e.target.value)}
            placeholder="واقف عليك بكام"
            className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
      )}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? '...' : 'حفظ'}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}
