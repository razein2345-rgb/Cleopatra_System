import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BranchSummary, Role, User } from '@cleopatra/shared';
import { ADMIN_ROLE_NAMES, INTERNAL_LOGIN_DOMAIN } from '@cleopatra/shared';
import { Eye, EyeOff } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableSelectCell, EditableTextCell, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { isLastActiveAdmin } from '@/lib/adminSafety';

const LAST_ADMIN_TITLE =
  'هذا آخر مسؤول نشط — تم تعطيل هذا الإجراء لمنع فقدان الوصول إلى النظام بالكامل.';

export function UsersPage() {
  const { can, authContext } = useAuth();
  const confirm = useConfirm();
  // system_specifications_v2.md §3.1.1 (2026-08-16) — the full profile
  // (`/users/:id`) bundles attendance + payroll, restricted to Super Admin
  // there and enforced server-side; hidden here too so the link isn't a
  // dead end for anyone else.
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRolesFor, setEditingRolesFor] = useState<User | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<User | null>(null);

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

  // Accounts created via FEATURE-015 store a synthetic `<id>@cleopatra.local`
  // email — showing the bare ID here matches what the owner actually hands
  // the employee, instead of a domain suffix nobody was told about. Legacy
  // accounts with a real email are shown as-is.
  const displayLoginId = (email: string) =>
    email.endsWith(`@${INTERNAL_LOGIN_DOMAIN}`) ? email.slice(0, -(INTERNAL_LOGIN_DOMAIN.length + 1)) : email;

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const branchOptions = branches.map((b) => [b.id, b.name] as const);
  const canEdit = can('employees.edit');

  // FEATURE-014 — same "زي جدول نوشن" inline-edit pattern as PartnersPage's
  // `updatePartnerField`: click a cell, edit in place, no separate form.
  const updateUserField = async (id: string, patch: { name?: string; branchId?: string }) => {
    const updated = await apiPut<User>(`/api/users/${id}`, patch);
    setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev);
  };

  const toggleActive = async (user: User) => {
    await apiPut(`/api/users/${user.id}`, { isActive: !user.isActive });
    load();
  };

  const deleteUser = async (user: User) => {
    if (!(await confirm({ title: `تعطيل وحذف ${user.name}؟`, destructive: true }))) return;
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
              <th className="p-3">معرّف الدخول</th>
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
                    <div className="flex items-center gap-1">
                      {canEdit ? (
                        <EditableTextCell
                          value={user.name}
                          onSave={(next) => updateUserField(user.id, { name: next })}
                        />
                      ) : (
                        user.name
                      )}
                      {isSuperAdmin && (
                        <Link to={`/users/${user.id}`} className="text-muted-foreground shrink-0 hover:underline" title="الملف الكامل">
                          ↗
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="p-3" dir="ltr">
                    {displayLoginId(user.email)}
                  </td>
                  <td className="p-3">
                    {canEdit ? (
                      <EditableSelectCell
                        value={user.branchId}
                        options={branchOptions}
                        onSave={(next) => updateUserField(user.id, { branchId: next })}
                        renderValue={branchName}
                      />
                    ) : (
                      branchName(user.branchId)
                    )}
                  </td>
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
                    <span className={user.isActive ? 'text-success' : 'text-muted-foreground'}>
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
                          onClick={() => setSettingPasswordFor(user)}
                        >
                          تعيين كلمة مرور جديدة
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

      {settingPasswordFor && (
        <SetPasswordPanel user={settingPasswordFor} onClose={() => setSettingPasswordFor(null)} />
      )}
    </div>
  );
}

/** Random alphanumeric password — legible enough to read/copy off-screen to hand to an employee, well past Supabase's 6-char minimum. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * FEATURE-015 (2026-08-16, owner: "عايز انا اللي ادخل الموظفين بنفسي واعملهم
 * باسوورد وID بدل موضوع الإيميل ده") — the owner sets a login ID + password
 * himself and hands them to the employee directly; no invite email involved.
 * After a successful create, the credentials are shown once (Supabase never
 * lets us retrieve the password again) so the owner can copy/read them off
 * before dismissing.
 */
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
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);

  if (created) {
    return (
      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <p className="font-medium">تم إنشاء الحساب — سجّل بيانات الدخول دي وسلّمها للموظف:</p>
        <div className="border-border bg-muted/30 space-y-1 rounded-lg border p-3 text-sm" dir="ltr">
          <p>
            <span className="text-muted-foreground">ID: </span>
            <span className="font-mono font-bold">{created.loginId}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Password: </span>
            <span className="font-mono font-bold">{created.password}</span>
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          مش هتقدر تشوف كلمة المرور دي تاني بعد ما تقفل الرسالة دي — لو نسيتها استخدم "تعيين كلمة مرور جديدة" من جدول الموظفين.
        </p>
        <Button onClick={onCreated}>تمام، إغلاق</Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/users', { name, loginId, password, phone: phone || undefined, branchId, roleIds });
      setCreated({ loginId, password });
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
          placeholder="معرّف الدخول (مثال: khaled1)"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          dir="ltr"
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <div className="relative">
          <input
            required
            type={showPassword ? 'text' : 'password'}
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            minLength={6}
            className="border-input bg-background w-full rounded-md border px-3 py-2 pl-16 text-sm"
          />
          <div className="absolute inset-y-0 left-0 flex items-center gap-1 px-1.5">
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              tabIndex={-1}
              title="توليد كلمة مرور"
              className="text-muted-foreground hover:text-foreground p-1 text-xs underline"
            >
              توليد
            </button>
          </div>
        </div>
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
        {submitting ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
      </Button>
    </form>
  );
}

/** The direct-set counterpart to invite-based creation — same reasoning as `CreateUserForm`. */
function SetPasswordPanel({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiPut(`/api/users/${user.id}/password`, { password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعيين كلمة المرور');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <p className="font-medium">تم تغيير كلمة مرور {user.name} — سلّمها له:</p>
        <div className="border-border bg-muted/30 rounded-lg border p-3 text-sm" dir="ltr">
          <span className="text-muted-foreground">Password: </span>
          <span className="font-mono font-bold">{password}</span>
        </div>
        <Button onClick={onClose}>تمام، إغلاق</Button>
      </div>
    );
  }

  return (
    <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <h2 className="font-semibold">تعيين كلمة مرور جديدة لـ {user.name}</h2>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="relative w-full max-w-xs">
        <input
          required
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          minLength={6}
          className="border-input bg-background w-full rounded-md border px-3 py-2 pl-16 text-sm"
        />
        <div className="absolute inset-y-0 left-0 flex items-center gap-1 px-1.5">
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => setPassword(generatePassword())}
            tabIndex={-1}
            title="توليد كلمة مرور"
            className="text-muted-foreground hover:text-foreground p-1 text-xs underline"
          >
            توليد
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
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
