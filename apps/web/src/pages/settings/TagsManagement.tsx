import { useEffect, useState } from 'react';
import type { CreatePartnerTagInput, PartnerTag } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

/** Settings → Tags Management — FEATURE-002 Milestone 4. */
export function TagsManagement() {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [tags, setTags] = useState<PartnerTag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PartnerTag | null>(null);

  const load = () => {
    apiGet<PartnerTag[]>('/api/partner-tags')
      .then(setTags)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الوسوم'));
  };

  useEffect(load, []);

  const remove = async (tag: PartnerTag) => {
    if (!confirm(`حذف الوسم "${tag.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/partner-tags/${tag.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الوسم');
    }
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!tags) return <div className="text-muted-foreground text-sm">جارٍ تحميل الوسوم…</div>;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ وسم جديد'}</Button>
      )}

      {showCreate && (
        <TagForm
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
            {tags.map((tag) => (
              <tr key={tag.id} className="border-border border-b last:border-0">
                <td className="p-2 font-medium">{tag.name}</td>
                <td className="p-2">
                  <span className={tag.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                    {tag.isActive ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="p-2">
                  {canManage && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(tag)}>
                        تعديل
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(tag)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-2" colSpan={3}>
                  لا توجد وسوم بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <TagForm
          tag={editing}
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

function TagForm({
  tag,
  onSaved,
  onCancel,
}: {
  tag?: PartnerTag;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? '');
  const [isActive, setIsActive] = useState(tag?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (tag) {
        await apiPut(`/api/partner-tags/${tag.id}`, { name, isActive });
      } else {
        const input: CreatePartnerTagInput = { name };
        await apiPost('/api/partner-tags', input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الوسم');
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
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm sm:w-64"
        />
      </label>
      {tag && (
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
