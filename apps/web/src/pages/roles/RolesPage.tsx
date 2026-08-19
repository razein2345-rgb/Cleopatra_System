import { useEffect, useState } from 'react';
import type { Permission, RoleWithPermissions } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

export function RolesPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<RoleWithPermissions | null>(null);

  const load = () => {
    Promise.all([
      apiGet<RoleWithPermissions[]>('/api/roles'),
      apiGet<Permission[]>('/api/permissions'),
    ])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذر تحميل الأدوار'),
      );
  };

  useEffect(load, []);

  const deleteRole = async (role: RoleWithPermissions) => {
    if (!(await confirm({ title: `حذف الدور "${role.label}"؟`, destructive: true }))) return;
    try {
      await apiDelete(`/api/roles/${role.id}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر حذف الدور');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!roles) return <div className="text-muted-foreground">جارٍ تحميل الأدوار…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الأدوار</h1>
        {can('roles.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة دور'}
          </Button>
        )}
      </div>

      {showCreate && (
        <CreateRoleForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="border-border bg-card rounded-2xl border p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <b>{role.label}</b>
                  {role.isSystem && (
                    <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
                      نظامي
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{role.description}</p>
              </div>
              {can('roles.delete') && !role.isSystem && (
                <Button variant="ghost" size="sm" onClick={() => void deleteRole(role)}>
                  حذف
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {role.permissions.length} صلاحية ممنوحة
            </p>
            {can('roles.edit') && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setEditing(role)}
              >
                تعديل الصلاحيات
              </Button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <EditRolePermissionsPanel
          role={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateRoleForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/roles', {
        name: name.toUpperCase().replace(/\s+/g, '_'),
        label,
        description: description || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الدور');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          placeholder="الاسم الداخلي (مثال: REGIONAL_MANAGER)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="الاسم المعروض"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="الوصف (اختياري)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الإنشاء…' : 'إنشاء الدور'}
      </Button>
    </form>
  );
}

function EditRolePermissionsPanel({
  role,
  permissions,
  onClose,
  onSaved,
}: {
  role: RoleWithPermissions;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(role.permissions.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const save = async () => {
    setError(null);
    try {
      await apiPut(`/api/roles/${role.id}/permissions`, { permissionIds: selected });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث الصلاحيات');
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <h2 className="mb-3 font-semibold">صلاحيات {role.label}</h2>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {Object.entries(grouped).map(([module, perms]) => (
          <div key={module}>
            <p className="text-muted-foreground mb-1 text-xs font-bold uppercase">{module}</p>
            <div className="flex flex-wrap gap-3">
              {perms.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.key}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()}>حفظ</Button>
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
