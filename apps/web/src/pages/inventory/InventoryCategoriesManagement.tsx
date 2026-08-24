import { useEffect, useState } from 'react';
import type { CreateInventoryCategoryInput, InventoryCategory, UpdateInventoryCategoryInput } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableCheckboxCell, EditableTextCell, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Owner (2026-08-25, "عايز البضاعه في المخزون تكون تصنيفات") — same
 * shape/behavior as Settings' `CategoriesManagement.tsx` (business
 * partner categories), just against `/api/inventory-categories`.
 */
export function InventoryCategoriesManagement({ onChanged }: { onChanged: () => void }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('settings.edit');
  const [categories, setCategories] = useState<InventoryCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<InventoryCategory[]>('/api/inventory-categories')
      .then(setCategories)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل التصنيفات'));
  };

  useEffect(load, []);

  const remove = async (category: InventoryCategory) => {
    if (!(await confirm({ title: `حذف التصنيف "${category.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/inventory-categories/${category.id}`);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف التصنيف — لو مستخدم في صنف مش هينحذف');
    }
  };

  const updateCategoryField = async (category: InventoryCategory, patch: UpdateInventoryCategoryInput) => {
    const updated = await apiPut<InventoryCategory>(`/api/inventory-categories/${category.id}`, patch);
    setCategories((prev) => prev?.map((c) => (c.id === category.id ? updated : c)) ?? prev);
    onChanged();
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!categories) return <div className="text-muted-foreground text-sm">جارٍ تحميل التصنيفات…</div>;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button type="button" size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : '+ تصنيف جديد'}
        </Button>
      )}

      {showCreate && (
        <CategoryForm
          onSaved={() => {
            setShowCreate(false);
            load();
            onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-2">الاسم</th>
              <th className="p-2">الوصف</th>
              <th className="p-2">الحالة</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-border border-b last:border-0">
                <td className="p-2 font-medium">
                  {canManage ? (
                    <EditableTextCell value={category.name} onSave={(next) => updateCategoryField(category, { name: next })} />
                  ) : (
                    category.name
                  )}
                </td>
                <td className="text-muted-foreground p-2">
                  {canManage ? (
                    <EditableTextCell
                      value={category.description ?? ''}
                      placeholder="—"
                      onSave={(next) => updateCategoryField(category, { description: next || null })}
                    />
                  ) : (
                    (category.description ?? '—')
                  )}
                </td>
                <td className="p-2">
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <EditableCheckboxCell value={category.isActive} onSave={(next) => updateCategoryField(category, { isActive: next })} />
                      <span className={category.isActive ? 'text-success' : 'text-muted-foreground'}>
                        {category.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </div>
                  ) : (
                    <span className={category.isActive ? 'text-success' : 'text-muted-foreground'}>
                      {category.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {canManage && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void remove(category)}>
                      حذف
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-2" colSpan={4}>
                  لا توجد تصنيفات بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateInventoryCategoryInput = { name, description: description || undefined };
      await apiPost('/api/inventory-categories', input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التصنيف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-xl border p-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاسم</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: كتب"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الوصف (اختياري)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
