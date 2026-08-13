import { useState } from 'react';
import type { ProductSourceType, ReadyProduct } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const SOURCE_TYPE_LABELS: Record<ProductSourceType, string> = {
  INTERNAL_PRODUCTION: 'تصنيع داخلي',
  EXTERNAL_SUPPLIER: 'مورّد خارجي',
};

export function ReadyProductsEditor({
  readyProducts,
  onChanged,
}: {
  readyProducts: ReadyProduct[];
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ReadyProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: ReadyProduct) => {
    if (!confirm(`حذف "${item.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/ready-products/${item.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المنتج');
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">منتجات جاهزة</h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة'}
          </Button>
        )}
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <ReadyProductForm
          onSubmit={(name, price, sourceType) => apiPost('/api/ready-products', { name, price, sourceType })}
          onSaved={() => {
            setShowCreate(false);
            onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <ul className="text-sm">
        {readyProducts.map((p) =>
          editing?.id === p.id ? (
            <li key={p.id} className="border-border border-b py-1.5">
              <ReadyProductForm
                initialName={p.name}
                initialPrice={p.price}
                initialSourceType={p.sourceType}
                onSubmit={(name, price, sourceType) => apiPut(`/api/ready-products/${p.id}`, { name, price, sourceType })}
                onSaved={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={p.id} className="border-border flex items-center justify-between border-b py-1.5">
              <span>
                {p.name}
                {p.sourceType && <span className="text-muted-foreground"> ({SOURCE_TYPE_LABELS[p.sourceType]})</span>}
              </span>
              <div className="flex items-center gap-3">
                <span>{p.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج</span>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      تعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(p)}>
                      حذف
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {readyProducts.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد منتجات جاهزة بعد.</p>}
      </ul>
    </div>
  );
}

function ReadyProductForm({
  initialName = '',
  initialPrice = 0,
  initialSourceType = null,
  onSubmit,
  onSaved,
  onCancel,
}: {
  initialName?: string;
  initialPrice?: number;
  initialSourceType?: ProductSourceType | null;
  onSubmit: (name: string, price: number, sourceType: ProductSourceType | null) => Promise<unknown>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPrice);
  const [sourceType, setSourceType] = useState<ProductSourceType | ''>(initialSourceType ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(name, price, sourceType || null);
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
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-40 space-y-1 text-xs">
        <span className="text-muted-foreground">مصدر التنفيذ</span>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as ProductSourceType | '')}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">غير محدد</option>
          <option value="INTERNAL_PRODUCTION">تصنيع داخلي</option>
          <option value="EXTERNAL_SUPPLIER">مورّد خارجي</option>
        </select>
      </label>
      <label className="w-28 space-y-1 text-xs">
        <span className="text-muted-foreground">السعر</span>
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
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? '...' : 'حفظ'}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}
