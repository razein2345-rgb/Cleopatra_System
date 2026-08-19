import { useEffect, useState } from 'react';
import type { CreateTreasuryCategoryInput, TreasuryCategory, UpdateTreasuryCategoryInput } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableCheckboxCell, EditableTextCell, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/** UX_PRODUCT_AUDIT.md § مشكلة 7.3 — settings-managed treasury entry categories. */
export function TreasuryCategoriesManagement() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('settings.edit');
  const [categories, setCategories] = useState<TreasuryCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<TreasuryCategory[]>('/api/treasury-categories')
      .then(setCategories)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل تصنيفات الخزينة'));
  };

  useEffect(load, []);

  const remove = async (category: TreasuryCategory) => {
    if (!(await confirm({ title: `حذف تصنيف "${category.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/treasury-categories/${category.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف التصنيف');
    }
  };

  const updateCategoryField = async (category: TreasuryCategory, patch: UpdateTreasuryCategoryInput) => {
    const updated = await apiPut<TreasuryCategory>(`/api/treasury-categories/${category.id}`, patch);
    setCategories((prev) => prev?.map((c) => (c.id === category.id ? updated : c)) ?? prev);
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!categories) return <div className="text-muted-foreground text-sm">جارٍ تحميل التصنيفات…</div>;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ تصنيف جديد'}</Button>
      )}

      {showCreate && (
        <CategoryForm
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-2">الاسم</th>
              <th className="p-2">الحالة</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-border border-b last:border-0">
                <td className="p-2 font-medium">
                  {canManage ? (
                    <EditableTextCell
                      value={category.name}
                      onSave={(next) => updateCategoryField(category, { name: next })}
                    />
                  ) : (
                    category.name
                  )}
                </td>
                <td className="p-2">
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <EditableCheckboxCell
                        value={category.isActive}
                        onSave={(next) => updateCategoryField(category, { isActive: next })}
                      />
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
                    <Button variant="ghost" size="sm" onClick={() => void remove(category)}>
                      حذف
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-2" colSpan={3}>
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateTreasuryCategoryInput = { name };
      await apiPost('/api/treasury-categories', input);
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
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">الاسم</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: إيجار، مرتبات، كهرباء"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm sm:w-64"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
