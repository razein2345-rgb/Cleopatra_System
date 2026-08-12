import { useEffect, useState } from 'react';
import type { BranchSummary } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

/** FEATURE-007 — branch management (owner, 2026-08-12: "عايز مكان في الإعدادات إني اضيف إسم الفروع"; delete added 2026-08-12 after owner feedback). Soft delete, same as every other catalog — the default branch can never be deleted (enforced server-side too). */
export function BranchesEditor() {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BranchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<BranchSummary[]>('/api/branches')
      .then(setBranches)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الفروع'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (branch: BranchSummary) => {
    if (!confirm(`حذف "${branch.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/branches/${branch.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الفرع');
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">الفروع</h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة فرع'}
          </Button>
        )}
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <BranchForm
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {loading ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : (
        <ul className="text-sm">
          {branches.map((b) =>
            editing?.id === b.id ? (
              <li key={b.id} className="border-border border-b py-1.5">
                <BranchForm
                  branch={b}
                  onSaved={() => {
                    setEditing(null);
                    load();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={b.id} className="border-border flex items-center justify-between border-b py-1.5">
                <span>
                  {b.name} <span className="text-muted-foreground">({b.code})</span>
                  {b.isDefault && <span className="text-primary"> — افتراضي</span>}
                  {b.address && <span className="text-muted-foreground"> — {b.address}</span>}
                </span>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                      تعديل
                    </Button>
                    {!b.isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => void remove(b)}>
                        حذف
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
          {branches.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد فروع مضافة بعد.</p>}
        </ul>
      )}
    </div>
  );
}

function BranchForm({
  branch,
  onSaved,
  onCancel,
}: {
  branch?: BranchSummary;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? '');
  const [code, setCode] = useState(branch?.code ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (branch) {
        await apiPut(`/api/branches/${branch.id}`, { name, address: address || null });
      } else {
        await apiPost('/api/branches', { name, code, address: address || undefined });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الفرع');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {error && <div className="text-destructive w-full text-xs">{error}</div>}
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">اسم الفرع</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: فرع كليوباترا"
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      {!branch && (
        <label className="w-28 space-y-1 text-xs">
          <span className="text-muted-foreground">كود الفرع</span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CLE"
            className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
      )}
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">العنوان (اختياري)</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
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
