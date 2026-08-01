import { useEffect, useState } from 'react';
import type { Permission } from '@cleopatra/shared';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

export function PermissionsPage() {
  const { can } = useAuth();
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<Permission[]>('/api/permissions')
      .then(setPermissions)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load permissions'),
      );
  };

  useEffect(load, []);

  const deletePermission = async (permission: Permission) => {
    if (!confirm(`Delete permission "${permission.key}"?`)) return;
    try {
      await apiDelete(`/api/permissions/${permission.id}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete permission');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!permissions) return <div className="text-muted-foreground">Loading permissions…</div>;

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Permissions</h1>
        {can('permissions.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : '+ New Permission'}
          </Button>
        )}
      </div>

      {showCreate && (
        <CreatePermissionForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([module, perms]) => (
          <div key={module} className="border-border bg-card rounded-2xl border p-4">
            <h2 className="text-muted-foreground mb-2 text-sm font-bold uppercase">{module}</h2>
            <table className="w-full text-sm">
              <tbody>
                {perms.map((p) => (
                  <tr key={p.id} className="border-border border-t">
                    <td className="py-2 font-mono text-xs">{p.key}</td>
                    <td className="py-2">{p.label}</td>
                    <td className="py-2 text-right">
                      {p.isSystem ? (
                        <span className="text-muted-foreground text-xs">System</span>
                      ) : (
                        can('permissions.delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void deletePermission(p)}
                          >
                            Delete
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreatePermissionForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState('');
  const [module, setModule] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/permissions', { key, module, label });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create permission');
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
          placeholder="key (e.g. inventory.view)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="module (e.g. inventory)"
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create permission'}
      </Button>
    </form>
  );
}
