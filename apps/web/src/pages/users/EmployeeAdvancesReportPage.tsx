import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateSalaryPaymentInput, EmployeeAdvanceSummary, PayFrequency, PaymentMethod } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/state/AuthContext';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';

const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** FEATURE-008 (2026-08-13, owner: "هل هيطلعلي تقرير بالسلف بتاعت كل موظف ومتبقيله كام من المرتب") — one row per employee: outstanding advances vs. what's left of their salary. */
export function EmployeeAdvancesReportPage() {
  const { can } = useAuth();
  const [summaries, setSummaries] = useState<EmployeeAdvanceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payingFor, setPayingFor] = useState<EmployeeAdvanceSummary | null>(null);

  const load = () => {
    apiGet<EmployeeAdvanceSummary[]>('/api/employee-advances/summary')
      .then(setSummaries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل التقرير'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!summaries) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">تقرير السلف والمرتبات</h1>
        <Link to="/users" className="text-muted-foreground text-sm hover:underline">
          العودة إلى الموظفين
        </Link>
      </div>

      {summaries.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا يوجد موظفون لهم سلف أو راتب أساسي مسجّل بعد.</p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-3">الموظف</th>
                <th className="p-3">دورة الصرف</th>
                <th className="p-3">الراتب الأساسي</th>
                <th className="p-3">السلف المستحقة</th>
                <th className="p-3">تسوية الحضور</th>
                <th className="p-3">متبقي المرتب</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.staffId} className="border-border border-b last:border-0">
                  <td className="p-3 font-medium">
                    <Link to={`/users/${s.staffId}`} className="hover:underline">
                      {s.staffName}
                    </Link>
                  </td>
                  <td className="p-3">{s.payFrequency ? PAY_FREQUENCY_LABELS[s.payFrequency] : '—'}</td>
                  <td className="p-3">
                    <span dir="ltr">{s.baseSalary != null ? money(s.baseSalary) : '—'}</span>
                  </td>
                  <td className="p-3">
                    <span dir="ltr">{money(s.totalOutstanding)}</span>
                  </td>
                  <td className="p-3">
                    <span dir="ltr" className={s.attendanceAdjustment > 0 ? 'text-success' : s.attendanceAdjustment < 0 ? 'text-destructive' : ''}>
                      {s.attendanceAdjustment !== 0 ? `${s.attendanceAdjustment > 0 ? '+' : ''}${money(s.attendanceAdjustment)}` : '—'}
                    </span>
                  </td>
                  <td className="p-3 font-medium">
                    <div className="flex items-center gap-1">
                      <span dir="ltr">{s.netDue != null ? money(s.netDue) : '—'}</span>
                      {s.paidThisPeriod > 0 && (
                        <span className="text-success text-xs font-normal" dir="ltr">
                          (اتصرف {money(s.paidThisPeriod)})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {can('employees.edit') && s.netDue != null && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => setPayingFor(s)}>
                        صرف مرتب
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payingFor && (
        <PaySalaryDialog
          summary={payingFor}
          onClose={() => setPayingFor(null)}
          onPaid={() => {
            setPayingFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Owner (2026-08-20, "هل بيطلعلي عملية مباشرة آخر الاسبوع بمرتبات الناس
 * جاهزة تتخصم من الخزينة؟... لو لا طب هنعمل ده ازاي") — confirmed a manual
 * "صرف مرتب" button per employee, not an automatic run. Amount defaults to
 * the computed `netDue` but stays editable (a real payment might round up,
 * or be a partial/correction) — the server resolves the real pay period on
 * its own, this dialog never sends period dates.
 */
function PaySalaryDialog({
  summary,
  onClose,
  onPaid,
}: {
  summary: EmployeeAdvanceSummary;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(summary.netDue != null ? String(Math.max(0, summary.netDue)) : '');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError('اكتب مبلغ أكبر من صفر');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateSalaryPaymentInput = {
        staffId: summary.staffId,
        branchId: summary.branchId,
        amount: parsed,
        method,
        note: note.trim() || undefined,
      };
      await apiPost('/api/employee-advances/salary-payments', input);
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر صرف المرتب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صرف مرتب — {summary.staffName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          {summary.periodStart && summary.periodEnd && (
            <p className="text-muted-foreground text-sm">
              الفترة الحالية:{' '}
              <span dir="ltr">
                {new Date(summary.periodStart).toLocaleDateString('en-GB')} – {new Date(summary.periodEnd).toLocaleDateString('en-GB')}
              </span>
            </p>
          )}
          {summary.paidThisPeriod > 0 && (
            <p className="bg-warning/15 text-warning-foreground rounded-md p-2 text-sm">
              ⚠️ اتصرف بالفعل {money(summary.paidThisPeriod)} ج.م في الفترة دي — تأكد إنك مش بتصرف مرتين.
            </p>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة الصرف</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map(([value]) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الصرف…' : 'تأكيد الصرف'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
