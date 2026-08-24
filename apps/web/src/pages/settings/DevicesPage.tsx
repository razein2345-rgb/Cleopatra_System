import { useEffect, useMemo, useState } from 'react';
import type { DeviceAccessMode, DeviceStatus, Setting, TrustedDevice, User } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Combobox, EditableTextCell, StatusBadge, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const STATUS_LABELS: Record<DeviceStatus, string> = {
  ACTIVE: 'مسموح',
  PENDING: 'في انتظار الاعتماد',
  BLOCKED: 'محظور',
};

const STATUS_TONE: Record<DeviceStatus, 'success' | 'danger' | 'warning'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  BLOCKED: 'danger',
};

const ACCESS_MODE_LABELS: Record<DeviceAccessMode, string> = {
  ALLOW_ALL_REGISTERED: 'السماح لكل جهاز مسجّل تلقائيًا',
  ONLY_APPROVED: 'يحتاج اعتماد قبل الدخول',
};

const GENERAL_DEVICE_OPTION = { id: '', nameAr: '— جهاز عام (أي موظف) —' };

/**
 * Owner (2026-08-24, "أيوة ضيفهم") — the `Setting.deviceAccessMode`
 * toggle, surfaced here rather than a new Settings category (this page
 * is already the one place devices are managed, same reasoning as
 * `AutoCloseTimeForm.tsx` living next to the treasury screen it controls).
 */
function AccessModeControl() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then(setSetting)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل إعداد سياسة الأجهزة'));
  };

  useEffect(load, []);

  const change = async (next: DeviceAccessMode) => {
    setError(null);
    setSaving(true);
    try {
      const updated = await apiPut<Setting>('/api/settings', { deviceAccessMode: next });
      setSetting(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ سياسة الأجهزة');
    } finally {
      setSaving(false);
    }
  };

  if (!setting) return null;

  return (
    <div className="border-border bg-card space-y-2 rounded-2xl border p-4">
      <p className="text-sm font-bold">سياسة الأجهزة الجديدة</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <select
        value={setting.deviceAccessMode}
        disabled={saving}
        onChange={(e) => void change(e.target.value as DeviceAccessMode)}
        className="border-input bg-background w-full max-w-sm rounded-md border px-3 py-2 text-sm disabled:opacity-60"
      >
        {(Object.keys(ACCESS_MODE_LABELS) as DeviceAccessMode[]).map((m) => (
          <option key={m} value={m}>
            {ACCESS_MODE_LABELS[m]}
          </option>
        ))}
      </select>
      <p className="text-muted-foreground text-xs">
        بتحدد إيه اللي بيحصل لجهاز بيدخل النظام لأول مرة — "السماح لكل جهاز مسجّل" بيفعّله فورًا، "يحتاج اعتماد" بيحطه "في انتظار الاعتماد" لحد ما توافق عليه من الجدول تحت.
      </p>
    </div>
  );
}

/**
 * Owner (2026-08-24, "عايز اقدر احدد الأجهزة المسموح لها بفتح النظام") —
 * Settings → Security → Devices. SUPER_ADMIN-only, same class/pattern as
 * `AuditLogPage.tsx` (reveals/controls something outside the regular
 * permission catalog, not gated by `settings.view`).
 */
export function DevicesPage() {
  const { authContext } = useAuth();
  const confirm = useConfirm();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;

  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'ALL'>('ALL');
  const [staffFilter, setStaffFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const load = () => {
    apiGet<TrustedDevice[]>('/api/devices')
      .then(setDevices)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الأجهزة'));
  };

  useEffect(load, []);
  useEffect(() => {
    apiGet<User[]>('/api/users').then(setStaff).catch(() => undefined);
  }, []);

  const staffName = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? '—') : 'عام (أي موظف)');

  const deviceTypes = useMemo(
    () => [...new Set((devices ?? []).map((d) => d.deviceType).filter((t): t is string => Boolean(t)))],
    [devices],
  );

  const filtered = useMemo(() => {
    if (!devices) return [];
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (staffFilter && d.staffId !== staffFilter) return false;
      if (typeFilter !== 'ALL' && d.deviceType !== typeFilter) return false;
      if (q) {
        const haystack = [d.label, d.staffName, d.deviceType, d.os, d.browser].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [devices, search, statusFilter, staffFilter, typeFilter]);

  const patchDevice = (id: string, patch: TrustedDevice) => {
    setDevices((prev) => (prev ? prev.map((d) => (d.id === id ? patch : d)) : prev));
  };

  const approve = async (d: TrustedDevice) => {
    setError(null);
    try {
      patchDevice(d.id, await apiPut<TrustedDevice>(`/api/devices/${d.id}/approve`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد الجهاز');
    }
  };

  const block = async (d: TrustedDevice) => {
    if (!(await confirm({ title: `حظر "${d.label ?? 'هذا الجهاز'}"؟`, description: 'أي طلب جاي من الجهاز ده هيترفض فورًا.', destructive: true }))) return;
    setError(null);
    try {
      patchDevice(d.id, await apiPut<TrustedDevice>(`/api/devices/${d.id}/block`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حظر الجهاز');
    }
  };

  const unblock = async (d: TrustedDevice) => {
    setError(null);
    try {
      patchDevice(d.id, await apiPut<TrustedDevice>(`/api/devices/${d.id}/unblock`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إلغاء حظر الجهاز');
    }
  };

  const rename = async (d: TrustedDevice, label: string) => {
    setError(null);
    try {
      patchDevice(d.id, await apiPut<TrustedDevice>(`/api/devices/${d.id}`, { label }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعديل اسم الجهاز');
    }
  };

  const reassign = async (d: TrustedDevice, staffId: string) => {
    setError(null);
    try {
      patchDevice(d.id, await apiPut<TrustedDevice>(`/api/devices/${d.id}`, { staffId: staffId || null }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير المستخدم المرتبط بالجهاز');
    }
  };

  const remove = async (d: TrustedDevice) => {
    if (!(await confirm({ title: `حذف "${d.label ?? 'هذا الجهاز'}" نهائيًا من القائمة؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/devices/${d.id}`);
      setDevices((prev) => (prev ? prev.filter((x) => x.id !== d.id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الجهاز');
    }
  };

  const logoutAllForStaff = async (targetStaffId: string, targetName: string) => {
    if (!(await confirm({ title: `تسجيل خروج "${targetName}" من كل أجهزته؟`, description: 'كل الأجهزة المرتبطة بيه (Policy B) هتتحظر فورًا.', destructive: true }))) return;
    setError(null);
    try {
      await apiPost(`/api/devices/logout-all/${targetStaffId}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الخروج من كل الأجهزة');
    }
  };

  if (!authContext) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (!isSuperAdmin) {
    return <div className="text-destructive">إدارة الأجهزة مقصورة على حساب المسؤول العام فقط.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الأجهزة</h1>
      </div>

      <AccessModeControl />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم/النوع/المتصفح…"
          className="border-input bg-background min-w-[220px] rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | 'ALL')}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">كل الحالات</option>
          {(Object.keys(STATUS_LABELS) as DeviceStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">كل الأنواع</option>
          {deviceTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Combobox
          items={[{ id: '', name: 'كل المستخدمين' }, ...staff]}
          value={staffFilter}
          getKey={(s) => s.id}
          getLabel={(s) => s.name}
          onChange={(s) => setStaffFilter(s.id)}
          placeholder="كل المستخدمين"
          className="min-w-[160px]"
        />
      </div>

      {!devices ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد أجهزة مطابقة.</p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">الجهاز</th>
                <th className="p-3">المستخدم</th>
                <th className="p-3">النظام</th>
                <th className="p-3">المتصفح</th>
                <th className="p-3">آخر دخول</th>
                <th className="p-3">آخر نشاط</th>
                <th className="p-3">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-border border-b last:border-0">
                  <td className="p-3">
                    <EditableTextCell value={d.label ?? ''} placeholder={d.deviceType ?? 'جهاز'} onSave={(next) => rename(d, next)} />
                  </td>
                  <td className="p-3">
                    <Combobox
                      items={[GENERAL_DEVICE_OPTION, ...staff.map((s) => ({ id: s.id, nameAr: s.name }))]}
                      value={d.staffId ?? ''}
                      getKey={(s) => s.id}
                      getLabel={(s) => s.nameAr}
                      onChange={(s) => reassign(d, s.id)}
                      placeholder="عام (أي موظف)"
                      className="min-w-[140px]"
                    />
                  </td>
                  <td className="text-muted-foreground p-3">{d.os ?? '—'}</td>
                  <td className="text-muted-foreground p-3">{d.browser ?? '—'}</td>
                  <td className="text-muted-foreground p-3">{d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleString('ar-EG') : '—'}</td>
                  <td className="text-muted-foreground p-3">{d.lastActiveAt ? new Date(d.lastActiveAt).toLocaleString('ar-EG') : '—'}</td>
                  <td className="p-3">
                    <StatusBadge tone={STATUS_TONE[d.status]}>{STATUS_LABELS[d.status]}</StatusBadge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      {d.status === 'PENDING' && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => void approve(d)}>
                          اعتماد
                        </Button>
                      )}
                      {d.status !== 'BLOCKED' ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => void block(d)}>
                          حظر
                        </Button>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" onClick={() => void unblock(d)}>
                          إلغاء الحظر
                        </Button>
                      )}
                      {d.staffId && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => void logoutAllForStaff(d.staffId!, staffName(d.staffId))} title="تسجيل خروج من كل أجهزة هذا المستخدم">
                          خروج من الكل
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => void remove(d)}>
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
