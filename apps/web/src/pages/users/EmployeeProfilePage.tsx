import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdvanceRepaymentMethod, AttendanceEntry, EmployeeAdvance, PayFrequency, User } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/state/AuthContext';
import { PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';

const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

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
  const { can } = useAuth();
  const canEdit = can('employees.edit');
  const [user, setUser] = useState<User | null>(null);
  const [advances, setAdvances] = useState<EmployeeAdvance[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddAdvance, setShowAddAdvance] = useState(false);

  const load = () => {
    if (!id) return;
    Promise.all([
      apiGet<User>(`/api/users/${id}`),
      apiGet<EmployeeAdvance[]>(`/api/employee-advances/staff/${id}`),
      apiGet<AttendanceEntry[]>(`/api/attendance/staff/${id}`),
    ])
      .then(([u, a, att]) => {
        setUser(u);
        setAdvances(a);
        setAttendance(att);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الموظف'));
  };

  useEffect(load, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!user || !advances || !attendance) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const totalOutstanding = advances.reduce((sum, a) => sum + a.remainingBalance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <Link to="/users" className="text-muted-foreground text-sm hover:underline">
          العودة إلى الموظفين
        </Link>
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
                  — متبقي من المرتب: <span className="font-medium">{money(user.baseSalary - totalOutstanding)}</span>
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
                </tr>
              </thead>
              <tbody>
                {attendance.map((entry) => (
                  <tr key={entry.id} className="border-border border-b last:border-0">
                    <td className="p-2">{new Date(entry.date).toLocaleDateString('ar-EG')}</td>
                    <td className="p-2">
                      {entry.checkInAt ? new Date(entry.checkInAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="p-2">
                      {entry.checkOutAt
                        ? new Date(entry.checkOutAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="p-2">{entry.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}

function EmployeeHrForm({ user, canEdit, onSaved }: { user: User; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState(user.position ?? '');
  const [hireDate, setHireDate] = useState(user.hireDate?.slice(0, 10) ?? '');
  const [payFrequency, setPayFrequency] = useState<PayFrequency | ''>(user.payFrequency ?? '');
  const [baseSalary, setBaseSalary] = useState(user.baseSalary != null ? String(user.baseSalary) : '');
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
