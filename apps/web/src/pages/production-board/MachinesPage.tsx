import { useEffect, useState } from 'react';
import type { BranchSummary, Department, Machine, MachineStatus } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusBadge, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * system_specifications_v2.md §6.5.1/§16.1 (2026-08-16, owner: "ابنيها
 * دلوقتي") — the missing "حالة كل ماكينة" piece of the Unified Production
 * Overview. Its own independent screen (rule: no merged screens) reachable
 * from the sidebar's "الإنتاج" group — status changes (a machine going
 * down for maintenance) happen often enough on the shop floor that they
 * need one-click buttons here, not a buried edit form.
 */
const STATUS_LABELS: Record<MachineStatus, string> = {
  RUNNING: 'شغالة',
  STOPPED: 'متوقفة',
  MAINTENANCE: 'صيانة',
};
const STATUS_TONES: Record<MachineStatus, 'success' | 'danger' | 'warning'> = {
  RUNNING: 'success',
  STOPPED: 'danger',
  MAINTENANCE: 'warning',
};
const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as MachineStatus[];

export function MachinesPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('machines.edit');
  const canDelete = can('machines.delete');

  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<Machine[]>('/api/machines')
      .then(setMachines)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الماكينات'));
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<Department[]>('/api/departments').then(setDepartments).catch(() => undefined);
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
  }, []);

  const departmentName = (id: string | null) => (id ? (departments.find((d) => d.id === id)?.name ?? '—') : '—');
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const setStatus = async (machine: Machine, status: MachineStatus) => {
    setError(null);
    try {
      await apiPut(`/api/machines/${machine.id}`, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث حالة الماكينة');
    }
  };

  const remove = async (machine: Machine) => {
    if (!(await confirm({ title: `حذف "${machine.name}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/machines/${machine.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الماكينة');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الماكينات</h1>
        {canManage && (
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة ماكينة'}
          </Button>
        )}
      </div>

      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <MachineForm
          branches={branches}
          departments={departments}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!machines ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : machines.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-5 text-center text-sm">
          لا توجد ماكينات مضافة بعد.
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-start">
                <th className="p-3 text-start font-medium">الماكينة</th>
                <th className="p-3 text-start font-medium">الفرع</th>
                <th className="p-3 text-start font-medium">القسم</th>
                <th className="p-3 text-start font-medium">الحالة</th>
                {canManage && <th className="p-3 text-start font-medium">تغيير سريع</th>}
                {canDelete && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3 text-muted-foreground">{branchName(m.branchId)}</td>
                  <td className="p-3 text-muted-foreground">{departmentName(m.departmentId)}</td>
                  <td className="p-3">
                    <StatusBadge tone={STATUS_TONES[m.status]}>{STATUS_LABELS[m.status]}</StatusBadge>
                  </td>
                  {canManage && (
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.filter((s) => s !== m.status).map((s) => (
                          <Button key={s} type="button" variant="secondary" size="sm" onClick={() => void setStatus(m, s)}>
                            {STATUS_LABELS[s]}
                          </Button>
                        ))}
                      </div>
                    </td>
                  )}
                  {canDelete && (
                    <td className="p-3 text-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void remove(m)}>
                        حذف
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MachineForm({
  branches,
  departments,
  onSaved,
  onCancel,
}: {
  branches: BranchSummary[];
  departments: Department[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!branchId) {
      setError('اختر الفرع أولًا');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/machines', { name, branchId, departmentId: departmentId || null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الماكينة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card flex flex-wrap items-end gap-2 rounded-2xl border p-4">
      {error && <div className="text-destructive w-full text-sm">{error}</div>}
      <label className="flex-1 space-y-1 text-sm">
        <span className="text-muted-foreground">اسم الماكينة</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: ماكينة أوفست ١"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="w-48 space-y-1 text-sm">
        <span className="text-muted-foreground">الفرع</span>
        <select
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">— اختر —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="w-48 space-y-1 text-sm">
        <span className="text-muted-foreground">القسم (اختياري)</span>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">— بدون —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}
