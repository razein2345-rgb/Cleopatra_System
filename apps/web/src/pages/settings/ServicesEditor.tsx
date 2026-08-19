import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Service, ServiceCategory } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  DESIGN: 'تصميم',
  MONTAGE: 'مونتاج',
  WEBSITES: 'بناء المواقع الإلكترونية',
  PHOTOGRAPHY: 'التصوير',
  MARKETING: 'التسويق',
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as ServiceCategory[];

/**
 * ERP-navigation research (2026-08-16, owner: "أنهي... خدمات الوكالة على
 * أفضل حال") — a flat list mixing all 5 categories doesn't scale once the
 * catalog actually fills up (system_specifications_v2.md §17 lists ~30
 * named sub-services across these categories). Grouped, collapsible
 * sections — same "progressive disclosure" pattern used elsewhere in this
 * pass (Documents grouping, sidebar nav grouping) — keep it scannable.
 */
export function ServicesEditor({ services, onChanged }: { services: Service[]; onChanged: () => void }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('settings.edit');
  const [addingTo, setAddingTo] = useState<ServiceCategory | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ServiceCategory>>(new Set());

  const remove = async (item: Service) => {
    if (!(await confirm({ title: `حذف "${item.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/services/${item.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الخدمة');
    }
  };

  const toggleCollapsed = (category: ServiceCategory) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="space-y-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      {CATEGORY_OPTIONS.map((category) => {
        const items = services.filter((s) => s.category === category);
        const isCollapsed = collapsed.has(category);
        return (
          <div key={category} className="border-border rounded-lg border">
            <div className="bg-muted/30 flex items-center justify-between gap-2 rounded-t-lg px-3 py-2">
              <button
                type="button"
                onClick={() => toggleCollapsed(category)}
                className="flex flex-1 items-center gap-2 text-start text-sm font-bold"
              >
                <ChevronDown className={cn('size-4 shrink-0 transition-transform', isCollapsed && '-rotate-90')} />
                {CATEGORY_LABELS[category]}
                <span className="text-muted-foreground font-normal">({items.length})</span>
              </button>
              {canManage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddingTo((v) => (v === category ? null : category))}
                >
                  {addingTo === category ? 'إلغاء' : '+ إضافة'}
                </Button>
              )}
            </div>
            {!isCollapsed && (
              <div className="p-3 pt-2">
                {addingTo === category && (
                  <div className="mb-2">
                    <ServiceForm
                      defaultCategory={category}
                      onSaved={() => {
                        setAddingTo(null);
                        onChanged();
                      }}
                      onCancel={() => setAddingTo(null)}
                    />
                  </div>
                )}
                <ul className="text-sm">
                  {items.map((s) =>
                    editing?.id === s.id ? (
                      <li key={s.id} className="border-border border-b py-1.5 last:border-0">
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
                      <li key={s.id} className="border-border flex items-center justify-between border-b py-1.5 last:border-0">
                        <span>{s.name}</span>
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
                  {items.length === 0 && addingTo !== category && (
                    <p className="text-muted-foreground py-1 text-sm">لا يوجد خدمات في هذا القسم بعد.</p>
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceForm({
  service,
  defaultCategory,
  onSaved,
  onCancel,
}: {
  service?: Service;
  defaultCategory?: ServiceCategory;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service?.price ?? 0);
  const [category, setCategory] = useState<ServiceCategory>(service?.category ?? defaultCategory ?? 'DESIGN');
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
          placeholder="مثال: هوية بصرية"
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      {/* The category is fixed by which section's "+ إضافة" was clicked when creating; still editable when editing an existing row, in case it was miscategorized. */}
      {service && (
        <label className="w-40 space-y-1 text-xs">
          <span className="text-muted-foreground">القسم</span>
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
      )}
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
