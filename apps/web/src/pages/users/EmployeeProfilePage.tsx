import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AdvanceRepaymentMethod,
  AttendanceEntry,
  EmployeeAdvance,
  EmployeePayroll,
  FieldAssignment,
  PayFrequency,
  User,
} from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/state/AuthContext';
import { PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';
import { LocationPickerMap } from '@/components/LocationPickerMap';

const FIELD_ASSIGNMENT_STATUS_LABELS = { PENDING: 'في الانتظار', CONFIRMED: 'تم التأكيد', CANCELLED: 'ملغي' } as const;

const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

const WEEKDAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * FEATURE-008 (2026-08-13, owner: "بالنسبة للموظفين فا عندي الموظفين منهم
 * من يقبض بالأسبوع ومنهم من يقبض بالشهر"). HR fields (position/hireDate/
 * payFrequency/baseSalary) + advances live on the existing `StaffProfile`
 * ("المستخدمون")  — reached from a click on a row there, mirroring
 * PartnerProfilePage's list-then-detail pattern.
 */
export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can, authContext } = useAuth();
  const canEdit = can('employees.edit');
  // system_specifications_v2.md §3.1.1 (2026-08-16) — this page bundles
  // attendance records with payroll/salary/advances, which the spec calls
  // out by name as sensitive enough to restrict to the Super Admin account
  // only, even for other admins/managers who otherwise hold
  // `employees.edit`. The plain employees LIST (`/users`) is unaffected —
  // only this profile drill-down (and its "الملف الكامل" link, hidden in
  // UsersPage.tsx for non-Super-Admins) is gated here.
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const [user, setUser] = useState<User | null>(null);
  const [advances, setAdvances] = useState<EmployeeAdvance[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEntry[] | null>(null);
  const [payroll, setPayroll] = useState<EmployeePayroll | null | undefined>(undefined);
  const [fieldAssignments, setFieldAssignments] = useState<FieldAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showAssignLocation, setShowAssignLocation] = useState(false);

  const load = () => {
    if (!id) return;
    Promise.all([
      apiGet<User>(`/api/users/${id}`),
      apiGet<EmployeeAdvance[]>(`/api/employee-advances/staff/${id}`),
      apiGet<AttendanceEntry[]>(`/api/attendance/staff/${id}`),
      apiGet<EmployeePayroll | null>(`/api/employee-advances/staff/${id}/payroll`),
      apiGet<FieldAssignment[]>(`/api/attendance/field-assignments?staffId=${id}`),
    ])
      .then(([u, a, att, p, fa]) => {
        setUser(u);
        setAdvances(a);
        setAttendance(att);
        setPayroll(p);
        setFieldAssignments(fa);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الموظف'));
  };

  useEffect(load, [id]);

  if (!authContext) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (!isSuperAdmin) {
    return (
      <div className="text-destructive">
        الملف الكامل للموظف (يشمل الحضور والرواتب) مقصور على حساب المسؤول العام فقط.
      </div>
    );
  }

  if (error) return <div className="text-destructive">{error}</div>;
  if (!user || !advances || !attendance || payroll === undefined) {
    return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  }

  const totalOutstanding = advances.reduce((sum, a) => sum + a.remainingBalance, 0);
  const attendanceAdjustment = payroll?.totalAdjustment ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <Link to="/users" className="text-muted-foreground text-sm hover:underline">
            العودة إلى الموظفين
          </Link>
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setShowSetPin(true)}>
            تعيين/تغيير الرقم السري لجهاز الحضور
          </Button>
        )}
      </div>

      <EmployeeHrForm user={user} canEdit={canEdit} onSaved={load} />

      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">السلف</h2>
            <p className="text-muted-foreground text-sm">
              إجمالي المتبقي: <span className="font-medium">{money(totalOutstanding)}</span>
              {user.baseSalary != null && (
                <>
                  {' '}
                  — متبقي من المرتب:{' '}
                  <span className="font-medium">{money(user.baseSalary - totalOutstanding + attendanceAdjustment)}</span>
                  {attendanceAdjustment !== 0 && (
                    <span className={attendanceAdjustment > 0 ? 'text-green-600' : 'text-destructive'}>
                      {' '}
                      ({attendanceAdjustment > 0 ? '+' : ''}
                      {money(attendanceAdjustment)} حضور)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          {canEdit && <Button onClick={() => setShowAddAdvance(true)}>+ سلفة جديدة</Button>}
        </div>

        {advances.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد سلف مسجّلة لهذا الموظف.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">المبلغ</th>
                  <th className="p-2">السبب</th>
                  <th className="p-2">المسدد</th>
                  <th className="p-2">المتبقي</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {advances.map((advance) => (
                  <AdvanceRow key={advance.id} advance={advance} canEdit={canEdit} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="font-semibold">الحضور والانصراف — آخر الأيام</h2>
        {attendance.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد سجلات حضور بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">الحضور</th>
                  <th className="p-2">الانصراف</th>
                  <th className="p-2">ملاحظة</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((entry) => (
                  <AttendanceRow key={entry.id} entry={entry} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">تكليفات بأماكن خارجية</h2>
          {canEdit && <Button onClick={() => setShowAssignLocation(true)}>+ تكليف بمكان</Button>}
        </div>
        {!fieldAssignments || fieldAssignments.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد تكليفات لهذا الموظف بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">المكان</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {fieldAssignments.map((a) => (
                  <tr key={a.id} className="border-border border-b last:border-0">
                    <td className="p-2">{new Date(a.date).toLocaleDateString('ar-EG')}</td>
                    <td className="p-2">{a.locationLabel}</td>
                    <td className="p-2">{FIELD_ASSIGNMENT_STATUS_LABELS[a.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
        <h2 className="font-semibold">حساب المرتب بالساعات — الفترة الحالية</h2>
        {!payroll ? (
          <p className="text-muted-foreground text-sm">
            لازم تحدد دورة الصرف والراتب الأساسي ومواعيد الوردية وأيام العمل في "بيانات الوظيفة" فوق عشان يتحسب.
          </p>
        ) : payroll.scheduledDaysInPeriod === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد أيام عمل مجدولة في الفترة الحالية.</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              الفترة: {new Date(payroll.periodStart).toLocaleDateString('ar-EG')} — {new Date(payroll.periodEnd).toLocaleDateString('ar-EG')}
              {' — '}
              معدل اليوم: <span className="font-medium">{payroll.dailyRate != null ? money(payroll.dailyRate) : '—'}</span>
              {' — '}
              معدل الساعة: <span className="font-medium">{payroll.hourlyRate != null ? money(payroll.hourlyRate) : '—'}</span>
            </p>
            {payroll.days.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا توجد أيام عمل انقضت بعد في هذه الفترة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                      <th className="p-2">التاريخ</th>
                      <th className="p-2">الحالة</th>
                      <th className="p-2">دقائق التأخير</th>
                      <th className="p-2">دقائق الانصراف المبكر</th>
                      <th className="p-2">دقائق إضافية</th>
                      <th className="p-2">التسوية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.days.map((d) => (
                      <tr key={d.date} className="border-border border-b last:border-0">
                        <td className="p-2">{new Date(d.date).toLocaleDateString('ar-EG')}</td>
                        <td className="p-2">{d.isAbsent ? <span className="text-destructive">غياب</span> : 'حاضر'}</td>
                        <td className="p-2">{d.lateMinutes > 0 ? Math.round(d.lateMinutes) : '—'}</td>
                        <td className="p-2">{d.earlyLeaveMinutes > 0 ? Math.round(d.earlyLeaveMinutes) : '—'}</td>
                        <td className="p-2">{d.overtimeMinutes > 0 ? Math.round(d.overtimeMinutes) : '—'}</td>
                        <td className={`p-2 ${d.adjustment > 0 ? 'text-green-600' : d.adjustment < 0 ? 'text-destructive' : ''}`}>
                          {d.adjustment !== 0 ? `${d.adjustment > 0 ? '+' : ''}${money(d.adjustment)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm font-medium">
              إجمالي التسوية:{' '}
              <span className={attendanceAdjustment > 0 ? 'text-green-600' : attendanceAdjustment < 0 ? 'text-destructive' : ''}>
                {attendanceAdjustment > 0 ? '+' : ''}
                {money(attendanceAdjustment)}
              </span>
            </p>
          </>
        )}
      </div>

      {showAddAdvance && (
        <AddAdvanceDialog
          staffId={user.id}
          branchId={user.branchId}
          onClose={() => setShowAddAdvance(false)}
          onCreated={() => {
            setShowAddAdvance(false);
            load();
          }}
        />
      )}

      {showSetPin && (
        <SetPinDialog staffId={user.id} onClose={() => setShowSetPin(false)} onSaved={() => setShowSetPin(false)} />
      )}

      {showAssignLocation && (
        <AssignLocationDialog
          staffId={user.id}
          branchId={user.branchId}
          onClose={() => setShowAssignLocation(false)}
          onCreated={() => {
            setShowAssignLocation(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SetPinDialog({ staffId, onClose, onSaved }: { staffId: string; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPut(`/api/users/${staffId}/attendance-pin`, { pin });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الرقم السري');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعيين/تغيير الرقم السري لجهاز الحضور</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الرقم السري (4 أرقام)</span>
            <input
              required
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-center text-lg tracking-[0.5em]"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || pin.length !== 4}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignLocationDialog({
  staffId,
  branchId,
  onClose,
  onCreated,
}: {
  staffId: string;
  branchId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [locationLabel, setLocationLabel] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || latitude === null || longitude === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/attendance/field-assignments', {
        staffId,
        branchId,
        date,
        locationLabel,
        targetLatitude: latitude,
        targetLongitude: longitude,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التكليف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تكليف بمكان</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">وصف المكان</span>
            <input
              required
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="مثال: مكتب شركة كذا - وسط البلد"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">حدد المكان على الخريطة</span>
            <LocationPickerMap latitude={latitude} longitude={longitude} onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting || latitude === null || longitude === null}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeHrForm({ user, canEdit, onSaved }: { user: User; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState(user.position ?? '');
  const [hireDate, setHireDate] = useState(user.hireDate?.slice(0, 10) ?? '');
  const [payFrequency, setPayFrequency] = useState<PayFrequency | ''>(user.payFrequency ?? '');
  const [baseSalary, setBaseSalary] = useState(user.baseSalary != null ? String(user.baseSalary) : '');
  const [shiftStartTime, setShiftStartTime] = useState(user.shiftStartTime ?? '');
  const [shiftEndTime, setShiftEndTime] = useState(user.shiftEndTime ?? '');
  const [workingDays, setWorkingDays] = useState<number[]>(user.workingDays);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!editing) {
    return (
      <div className="border-border bg-card space-y-2 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">بيانات الوظيفة</h2>
          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPosition(user.position ?? '');
                setHireDate(user.hireDate?.slice(0, 10) ?? '');
                setPayFrequency(user.payFrequency ?? '');
                setBaseSalary(user.baseSalary != null ? String(user.baseSalary) : '');
                setShiftStartTime(user.shiftStartTime ?? '');
                setShiftEndTime(user.shiftEndTime ?? '');
                setWorkingDays(user.workingDays);
                setEditing(true);
              }}
            >
              تعديل
            </Button>
          )}
        </div>
        <p className="text-sm">
          الوظيفة: <span className="font-medium">{user.position || '—'}</span>
        </p>
        <p className="text-sm">
          تاريخ التعيين:{' '}
          <span className="font-medium">{user.hireDate ? new Date(user.hireDate).toLocaleDateString('ar-EG') : '—'}</span>
        </p>
        <p className="text-sm">
          دورة الصرف: <span className="font-medium">{user.payFrequency ? PAY_FREQUENCY_LABELS[user.payFrequency] : '—'}</span>
        </p>
        <p className="text-sm">
          الراتب الأساسي:{' '}
          <span className="font-medium">
            {user.baseSalary != null ? `${money(user.baseSalary)} ${user.payFrequency ? `/ ${PAY_FREQUENCY_LABELS[user.payFrequency]}` : ''}` : '—'}
          </span>
        </p>
        <p className="text-sm">
          مواعيد الوردية:{' '}
          <span className="font-medium">
            {user.shiftStartTime && user.shiftEndTime ? `${user.shiftStartTime} — ${user.shiftEndTime}` : '—'}
          </span>
        </p>
        <p className="text-sm">
          أيام العمل:{' '}
          <span className="font-medium">
            {user.workingDays.length > 0
              ? user.workingDays
                  .slice()
                  .sort((a, b) => a - b)
                  .map((d) => WEEKDAY_LABELS[d])
                  .join('، ')
              : '—'}
          </span>
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPut(`/api/users/${user.id}`, {
        position: position.trim() === '' ? null : position.trim(),
        hireDate: hireDate === '' ? null : hireDate,
        payFrequency: payFrequency === '' ? null : payFrequency,
        baseSalary: baseSalary.trim() === '' ? null : Number(baseSalary),
        shiftStartTime: shiftStartTime === '' ? null : shiftStartTime,
        shiftEndTime: shiftEndTime === '' ? null : shiftEndTime,
        workingDays,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ بيانات الوظيفة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <h2 className="font-semibold">بيانات الوظيفة</h2>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الوظيفة</span>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">تاريخ التعيين</span>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">دورة الصرف</span>
          <select
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value as PayFrequency | '')}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">غير محدد</option>
            <option value="WEEKLY">أسبوعي</option>
            <option value="MONTHLY">شهري</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الراتب الأساسي (لكل دورة صرف)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">بداية الوردية</span>
          <input
            type="time"
            value={shiftStartTime}
            onChange={(e) => setShiftStartTime(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">نهاية الوردية</span>
          <input
            type="time"
            value={shiftEndTime}
            onChange={(e) => setShiftEndTime(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground text-sm">أيام العمل</span>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, dayIndex) => (
            <label key={dayIndex} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={workingDays.includes(dayIndex)}
                onChange={(e) =>
                  setWorkingDays((prev) =>
                    e.target.checked ? [...prev, dayIndex] : prev.filter((d) => d !== dayIndex),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/**
 * Owner (2026-08-17, "اقدر اعدل مواعيد دخول وخروج العمال من عندي فقط") —
 * correcting a worker's recorded check-in/check-out time. No `canEdit`
 * check here: this whole page is already gated to `isSuperAdmin` above, and
 * the backend enforces the identical restriction independently
 * (`upsertAttendanceEntryHandler`) — never relying on this UI gate alone.
 */
function AttendanceRow({ entry, onChanged }: { entry: AttendanceEntry; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <tr className="border-border border-b last:border-0">
      <td className="p-2">{new Date(entry.date).toLocaleDateString('ar-EG')}</td>
      <td className="p-2">
        {entry.checkInAt ? new Date(entry.checkInAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}
      </td>
      <td className="p-2">
        {entry.checkOutAt ? new Date(entry.checkOutAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}
      </td>
      <td className="p-2">{entry.note || '—'}</td>
      <td className="p-2">
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          تعديل
        </Button>
      </td>
      {editing && (
        <EditAttendanceDialog
          entry={entry}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </tr>
  );
}

/** `datetime-local` reads/writes in the browser's own local time — matches how an admin actually thinks about "الساعة كام" when correcting a record, no separate timezone math needed. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditAttendanceDialog({ entry, onClose, onSaved }: { entry: AttendanceEntry; onClose: () => void; onSaved: () => void }) {
  const [checkIn, setCheckIn] = useState(toLocalInputValue(entry.checkInAt));
  const [checkOut, setCheckOut] = useState(toLocalInputValue(entry.checkOutAt));
  const [note, setNote] = useState(entry.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/attendance', {
        staffId: entry.staffId,
        branchId: entry.branchId,
        date: entry.date,
        checkInAt: checkIn === '' ? null : new Date(checkIn).toISOString(),
        checkOutAt: checkOut === '' ? null : new Date(checkOut).toISOString(),
        note: note.trim() === '' ? null : note.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعديل سجل الحضور');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل حضور يوم {new Date(entry.date).toLocaleDateString('ar-EG')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">موعد الحضور</span>
            <input
              type="datetime-local"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">موعد الانصراف</span>
            <input
              type="datetime-local"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceRow({ advance, canEdit, onChanged }: { advance: EmployeeAdvance; canEdit: boolean; onChanged: () => void }) {
  const [showRepay, setShowRepay] = useState(false);
  return (
    <tr className="border-border border-b last:border-0">
      <td className="p-2">{new Date(advance.date).toLocaleDateString('ar-EG')}</td>
      <td className="p-2">
        <span dir="ltr">{money(advance.amount)}</span>
      </td>
      <td className="p-2">{advance.reason || '—'}</td>
      <td className="p-2">
        <span dir="ltr">{money(advance.repaidAmount)}</span>
      </td>
      <td className="p-2 font-medium">
        <span dir="ltr">{money(advance.remainingBalance)}</span>
      </td>
      <td className="p-2">
        {canEdit && advance.remainingBalance > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setShowRepay(true)}>
            تسجيل سداد
          </Button>
        )}
      </td>
      {showRepay && (
        <RepayAdvanceDialog
          advance={advance}
          onClose={() => setShowRepay(false)}
          onCreated={() => {
            setShowRepay(false);
            onChanged();
          }}
        />
      )}
    </tr>
  );
}

function AddAdvanceDialog({
  staffId,
  branchId,
  onClose,
  onCreated,
}: {
  staffId: string;
  branchId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [walletMethod, setWalletMethod] = useState(PAYMENT_METHOD_OPTIONS[0][0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/employee-advances', {
        staffId,
        branchId,
        amount: Number(amount),
        date,
        reason: reason.trim() || undefined,
        walletMethod,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل السلفة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سلفة جديدة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              required
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المحفظة التي صُرف منها</span>
            <select
              value={walletMethod}
              onChange={(e) => setWalletMethod(e.target.value as (typeof PAYMENT_METHOD_OPTIONS)[number][0])}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">السبب (اختياري)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ السلفة'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RepayAdvanceDialog({
  advance,
  onClose,
  onCreated,
}: {
  advance: EmployeeAdvance;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState(String(advance.remainingBalance));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<AdvanceRepaymentMethod>('CASH');
  const [walletMethod, setWalletMethod] = useState(PAYMENT_METHOD_OPTIONS[0][0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(`/api/employee-advances/${advance.id}/repayments`, {
        amount: Number(amount),
        date,
        method,
        note: note.trim() || undefined,
        walletMethod: method === 'CASH' ? walletMethod : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل السداد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل سداد — المتبقي {money(advance.remainingBalance)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              required
              autoFocus
              type="number"
              min="0.01"
              max={advance.remainingBalance}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة السداد</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as AdvanceRepaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="CASH">استرداد نقدي</option>
              <option value="SALARY_DEDUCTION">خصم من المرتب</option>
            </select>
          </label>
          {method === 'CASH' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">المحفظة التي استُلم فيها المبلغ</span>
              <select
                value={walletMethod}
                onChange={(e) => setWalletMethod(e.target.value as (typeof PAYMENT_METHOD_OPTIONS)[number][0])}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
