import { useEffect, useState } from 'react';
import type { CreatePartnerCategoryInput, PartnerCategory } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

/** Settings → Categories Management — FEATURE-002 Milestone 4. */
export function CategoriesManagement() {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [categories, setCategories] = useState<PartnerCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PartnerCategory | null>(null);

  const load = () => {
    apiGet<PartnerCategory[]>('/api/partner-categories')
      .then(setCategories)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذر تحميل التصنيفات'),
      );
  };

  useEffect(load, []);

  const remove = async (category: PartnerCategory) => {
    if (!confirm(`حذف التصنيف "${category.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partner-categories/${category.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف التصنيف');
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!categories) return <div className="text-muted-foreground text-sm">جارٍ تحميل التصنيفات…</div>;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'إلغاء' : '+ تصنيف جديد'}
        </Button>
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
              <th className="p-2">الوصف</th>
              <th className="p-2">الحالة</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-border border-b last:border-0">
                <td className="p-2 font-medium">{category.name}</td>
                <td className="text-muted-foreground p-2">{category.description ?? '—'}</td>
                <td className="p-2">
                  <span className={category.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                    {category.isActive ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="p-2">
                  {canManage && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(category)}>
                        تعديل
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(category)}>
                        حذف
                      </Button>
                    </div>
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

      {editing && (
        <CategoryForm
          category={editing}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  onSaved,
  onCancel,
}: {
  category?: PartnerCategory;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (category) {
        await apiPut(`/api/partner-categories/${category.id}`, {
          name,
          description: description || null,
          isActive,
        });
      } else {
        const input: CreatePartnerCategoryInput = { name, description: description || undefined };
        await apiPost('/api/partner-categories', input);
      }
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
      {category && (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          نشط
        </label>
      )}
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
