import { useEffect, useState } from 'react';
import type { BranchSummary, Role, User } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

export function UsersPage() {
  const { can } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRolesFor, setEditingRolesFor] = useState<User | null>(null);

  const load = () => {
    Promise.all([
      apiGet<User[]>('/api/users'),
      apiGet<Role[]>('/api/roles'),
      apiGet<BranchSummary[]>('/api/branches'),
    ])
      .then(([u, r, b]) => {
        setUsers(u);
        setRoles(r);
        setBranches(b);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load users'),
      );
  };

  useEffect(load, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const toggleActive = async (user: User) => {
    await apiPut(`/api/users/${user.id}`, { isActive: !user.isActive });
    load();
  };

  const resetPassword = async (user: User) => {
    await apiPost(`/api/users/${user.id}/reset-password`);
    alert(`Password reset link sent to ${user.email}`);
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Deactivate and remove ${user.name}?`)) return;
    await apiDelete(`/api/users/${user.id}`);
    load();
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!users) return <div className="text-muted-foreground">Loading users…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        {can('employees.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : '+ Add User'}
          </Button>
        )}
      </div>

      {showCreate && (
        <CreateUserForm
          roles={roles}
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left text-xs">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Branch</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last login</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-border border-b last:border-0">
                <td className="p-3 font-medium">{user.name}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">{branchName(user.branchId)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role.id}
                        className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs"
                      >
                        {role.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <span className={user.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="text-muted-foreground p-3">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="p-3">
                  {can('employees.edit') && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingRolesFor(user)}
                      >
                        Roles
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void toggleActive(user)}>
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void resetPassword(user)}
                      >
                        Reset password
                      </Button>
                      {can('employees.delete') && (
                        <Button variant="ghost" size="sm" onClick={() => void deleteUser(user)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRolesFor && (
        <EditUserRolesPanel
          user={editingRolesFor}
          roles={roles}
          onClose={() => setEditingRolesFor(null)}
          onSaved={() => {
            setEditingRolesFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateUserForm({
  roles,
  branches,
  onCreated,
}: {
  roles: Role[];
  branches: BranchSummary[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/users', { name, email, phone: phone || undefined, branchId, roleIds });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Roles</p>
        <div className="flex flex-wrap gap-3">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={roleIds.includes(role.id)}
                onChange={(e) =>
                  setRoleIds((prev) =>
                    e.target.checked ? [...prev, role.id] : prev.filter((id) => id !== role.id),
                  )
                }
              />
              {role.label}
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Sending invite…' : 'Send invite'}
      </Button>
    </form>
  );
}

function EditUserRolesPanel({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roleIds, setRoleIds] = useState<string[]>(user.roles.map((r) => r.id));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await apiPut(`/api/users/${user.id}/roles`, { roleIds });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <h2 className="mb-3 font-semibold">Roles for {user.name}</h2>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      <div className="mb-4 flex flex-wrap gap-3">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={roleIds.includes(role.id)}
              onChange={(e) =>
                setRoleIds((prev) =>
                  e.target.checked ? [...prev, role.id] : prev.filter((id) => id !== role.id),
                )
              }
            />
            {role.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void save()}>Save</Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
