import { useState } from 'react';
import type { Service, ServiceCategory } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  DESIGN: 'تصميم',
  MONTAGE: 'مونتاج',
  WEBSITES: 'بناء المواقع الإلكترونية',
  PHOTOGRAPHY: 'التصوير',
  MARKETING: 'التسويق',
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as ServiceCategory[];

export function ServicesEditor({ services, onChanged }: { services: Service[]; onChanged: () => void }) {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: Service) => {
    if (!confirm(`حذف "${item.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/services/${item.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الخدمة');
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">الخدمات</h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة'}
          </Button>
        )}
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <ServiceForm
          onSaved={() => {
            setShowCreate(false);
            onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <ul className="text-sm">
        {services.map((s) =>
          editing?.id === s.id ? (
            <li key={s.id} className="border-border border-b py-1.5">
              <ServiceForm
                service={s}
                onSaved={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={s.id} className="border-border flex items-center justify-between border-b py-1.5">
              <span>
                {s.name} <span className="text-muted-foreground">({CATEGORY_LABELS[s.category]})</span>
              </span>
              <div className="flex items-center gap-3">
                <span>{s.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج</span>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                      تعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(s)}>
                      حذف
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {services.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد خدمات مضافة بعد.</p>}
      </ul>
    </div>
  );
}

function ServiceForm({
  service,
  onSaved,
  onCancel,
}: {
  service?: Service;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service?.price ?? 0);
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? 'DESIGN');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (service) {
        await apiPut(`/api/services/${service.id}`, { name, price, category });
      } else {
        await apiPost('/api/services', { name, price, category });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الخدمة');
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
      <label className="w-32 space-y-1 text-xs">
        <span className="text-muted-foreground">النوع</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ServiceCategory)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
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
