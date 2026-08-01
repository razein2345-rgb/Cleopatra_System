import { useEffect, useState } from 'react';
import type { Permission, RoleWithPermissions } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

export function RolesPage() {
  const { can } = useAuth();
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
        setError(err instanceof Error ? err.message : 'Failed to load roles'),
      );
  };

  useEffect(load, []);

  const deleteRole = async (role: RoleWithPermissions) => {
    if (!confirm(`Delete role "${role.label}"?`)) return;
    try {
      await apiDelete(`/api/roles/${role.id}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!roles) return <div className="text-muted-foreground">Loading roles…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Roles</h1>
        {can('roles.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : '+ Add Role'}
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
                      System
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{role.description}</p>
              </div>
              {can('roles.delete') && !role.isSystem && (
                <Button variant="ghost" size="sm" onClick={() => void deleteRole(role)}>
                  Delete
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {role.permissions.length} permissions granted
            </p>
            {can('roles.edit') && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setEditing(role)}
              >
                Edit permissions
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
      setError(err instanceof Error ? err.message : 'Failed to create role');
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
          placeholder="Internal name (e.g. REGIONAL_MANAGER)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Display label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create role'}
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
      setError(err instanceof Error ? err.message : 'Failed to update permissions');
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <h2 className="mb-3 font-semibold">Permissions for {role.label}</h2>
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
        <Button onClick={() => void save()}>Save</Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
