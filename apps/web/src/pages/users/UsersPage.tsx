import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BranchSummary, Role, User } from '@cleopatra/shared';
import { ADMIN_ROLE_NAMES } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { isLastActiveAdmin } from '@/lib/adminSafety';

const LAST_ADMIN_TITLE =
  'هذا آخر مسؤول نشط — تم تعطيل هذا الإجراء لمنع فقدان الوصول إلى النظام بالكامل.';

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
        setError(err instanceof Error ? err.message : 'تعذر تحميل الموظفين'),
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
    alert(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${user.email}`);
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`تعطيل وحذف ${user.name}؟`)) return;
    await apiDelete(`/api/users/${user.id}`);
    load();
  };

  if (error) return <div className="text-destructive">{error}</div>;
  if (!users) return <div className="text-muted-foreground">جارٍ تحميل الموظفين…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الموظفين</h1>
        <div className="flex gap-2">
          {can('employees.view') && (
            <Link to="/users/advances-report">
              <Button variant="secondary">تقرير السلف والمرتبات</Button>
            </Link>
          )}
          {can('employees.create') && (
            <Button onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'إلغاء' : '+ إضافة مستخدم'}
            </Button>
          )}
        </div>
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
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">الاسم</th>
              <th className="p-3">البريد الإلكتروني</th>
              <th className="p-3">الفرع</th>
              <th className="p-3">الأدوار</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">آخر دخول</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              // ADR 0028 / AdminSafetyService — a UI-only mirror of the
              // backend rule, for disabling impossible actions. The
              // backend re-checks and remains the source of truth
              // regardless of what's disabled here.
              const protectedAdmin = isLastActiveAdmin(user, users);
              return (
                <tr key={user.id} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">
                    <Link to={`/users/${user.id}`} className="hover:underline">
                      {user.name}
                    </Link>
                  </td>
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
                      {user.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="text-muted-foreground p-3">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ar-EG') : 'لم يسجل الدخول بعد'}
                  </td>
                  <td className="p-3">
                    {can('employees.edit') && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingRolesFor(user)}
                        >
                          الأدوار
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={user.isActive && protectedAdmin}
                          title={user.isActive && protectedAdmin ? LAST_ADMIN_TITLE : undefined}
                          onClick={() => void toggleActive(user)}
                        >
                          {user.isActive ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void resetPassword(user)}
                        >
                          إعادة تعيين كلمة المرور
                        </Button>
                        {can('employees.delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={protectedAdmin}
                            title={protectedAdmin ? LAST_ADMIN_TITLE : undefined}
                            onClick={() => void deleteUser(user)}
                          >
                            حذف
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingRolesFor && (
        <EditUserRolesPanel
          user={editingRolesFor}
          allUsers={users}
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
      setError(err instanceof Error ? err.message : 'تعذر إنشاء المستخدم');
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
          placeholder="الاسم الكامل"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="البريد الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <input
          placeholder="الهاتف (اختياري)"
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
        <p className="mb-1.5 text-sm font-medium">الأدوار</p>
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
        {submitting ? 'جارٍ إرسال الدعوة…' : 'إرسال الدعوة'}
      </Button>
    </form>
  );
}

function EditUserRolesPanel({
  user,
  allUsers,
  roles,
  onClose,
  onSaved,
}: {
  user: User;
  allUsers: User[];
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roleIds, setRoleIds] = useState<string[]>(user.roles.map((r) => r.id));
  const [error, setError] = useState<string | null>(null);

  // ADR 0028 / AdminSafetyService — UI-only mirror; the backend re-checks
  // and remains the source of truth regardless of what's disabled here.
  const protectedAdmin = isLastActiveAdmin(user, allUsers);

  const save = async () => {
    setError(null);
    try {
      await apiPut(`/api/users/${user.id}/roles`, { roleIds });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث الأدوار');
    }
  };

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <h2 className="mb-3 font-semibold">أدوار {user.name}</h2>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      <div className="mb-4 flex flex-wrap gap-3">
        {roles.map((role) => {
          const checked = roleIds.includes(role.id);
          const isAdminRole = (ADMIN_ROLE_NAMES as readonly string[]).includes(role.name);
          const locked = protectedAdmin && isAdminRole && checked;
          return (
            <label
              key={role.id}
              className="flex items-center gap-1.5 text-sm"
              title={locked ? LAST_ADMIN_TITLE : undefined}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={(e) =>
                  setRoleIds((prev) =>
                    e.target.checked ? [...prev, role.id] : prev.filter((id) => id !== role.id),
                  )
                }
              />
              {role.label}
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void save()}>حفظ</Button>
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
