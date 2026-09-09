import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { BusinessIdentity, EmployeePayroll, EmployeePayrollDay, PayrollPeriod, User } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/cleopatra';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';

const WEEKDAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Same hours:minutes formatting as EmployeeProfilePage.tsx's `totalLateHoursLabel`, generalized to any minute total (shortage or overtime) — رول 5, no second copy of the formatting rule. */
function hoursLabel(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} د`;
  return minutes === 0 ? `${hours} س` : `${hours} س ${minutes} د`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

interface ReportSource {
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  totalAdjustment: number;
  grossDue: number;
  days: EmployeePayrollDay[];
}

/**
 * Owner (2026-09-09, "عايز اقدر اطبع للموظف الواحد تقرير بإيام حضورة عدد
 * الساعات الزائدة والناقصة لكل يوم... المرتب قبل التسوية... المرتب بعد
 * التسوية... علشان اصرفه للموظف مظبوط") — a printable attendance/salary
 * settlement slip for one employee, one pay period. Zero new backend or
 * calculation logic (رول 5) — every number here already exists, either
 * live (`computeEmployeePayroll`, "الفترة الحالية") or frozen
 * (`PayrollPeriod.days`/`grossDue`, a closed month) — this page is purely
 * a print-friendly rendering of data `EmployeeProfilePage.tsx` already
 * fetches and shows on-screen. `?periodId=` picks a closed period; absent
 * = the live current period (the one about to actually be paid).
 */
export function EmployeePayrollReportPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const periodId = searchParams.get('periodId');
  const { authContext } = useAuth();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;

  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [source, setSource] = useState<ReportSource | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiGet<User>(`/api/users/${id}`),
      apiGet<BusinessIdentity>('/api/settings/business-identity'),
      periodId
        ? apiGet<PayrollPeriod[]>(`/api/employee-advances/staff/${id}/payroll-periods`)
        : apiGet<EmployeePayroll | null>(`/api/employee-advances/staff/${id}/payroll`),
    ])
      .then(([u, b, payrollData]) => {
        setUser(u);
        setBusiness(b);
        if (periodId) {
          const period = (payrollData as PayrollPeriod[]).find((p) => p.id === periodId);
          setSource(
            period
              ? {
                  periodStart: period.periodStart,
                  periodEnd: period.periodEnd,
                  baseSalary: period.baseSalary,
                  totalAdjustment: period.totalAdjustment,
                  grossDue: period.grossDue,
                  days: period.days,
                }
              : null,
          );
        } else {
          const payroll = payrollData as EmployeePayroll | null;
          setSource(
            payroll && u.baseSalary != null
              ? {
                  periodStart: payroll.periodStart,
                  periodEnd: payroll.periodEnd,
                  baseSalary: u.baseSalary,
                  totalAdjustment: payroll.totalAdjustment,
                  grossDue: u.baseSalary + payroll.totalAdjustment,
                  days: payroll.days,
                }
              : null,
          );
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات التقرير'));
  }, [id, periodId]);

  if (!authContext) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (!isSuperAdmin) {
    return <div className="text-destructive">تقرير الحضور والمرتب مقصور على حساب المسؤول العام فقط.</div>;
  }
  if (error) return <div className="text-destructive">{error}</div>;
  if (!user || !business || source === undefined) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (!source) {
    return (
      <div className="text-muted-foreground">
        {periodId
          ? 'الفترة المقفولة دي مش موجودة.'
          : 'محتاج تحدد دورة الصرف والراتب الأساسي ومواعيد الوردية وأيام العمل في بيانات الموظف الأول.'}
      </div>
    );
  }

  const totalOvertimeMinutes = source.days.reduce((sum, d) => sum + d.overtimeMinutes, 0);
  const totalShortageMinutes = source.days.reduce((sum, d) => sum + d.lateMinutes + d.earlyLeaveMinutes, 0);
  const netMinutes = totalOvertimeMinutes - totalShortageMinutes;

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadDocumentAsPdf(`تقرير حضور ومرتب - ${user.name}`);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Breadcrumbs
          items={[
            { label: 'الموظفين', to: '/users' },
            { label: user.name, to: `/users/${id}` },
            { label: 'تقرير حضور ومرتب' },
          ]}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={exportingPdf} onClick={() => void exportPdf()}>
            {exportingPdf ? 'جارٍ التصدير…' : 'تنزيل PDF'}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            طباعة التقرير
          </Button>
        </div>
      </div>

      <div className="document-print-root bg-background text-foreground mx-auto max-w-4xl space-y-4 p-8 text-sm">
        <header className="border-border flex items-start justify-between border-b pb-3">
          <div>
            <div className="text-lg font-bold">{business.businessNameAr}</div>
            <div className="text-lg font-bold">تقرير حضور ومرتب</div>
          </div>
          {business.logoUrl && <img src={business.logoUrl} alt="" className="h-14 object-contain" />}
        </header>

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <Field label="الموظف" value={user.name} />
          <Field label="الوظيفة" value={user.position ?? '—'} />
          <Field
            label="الفترة"
            value={
              <span dir="ltr">
                {new Date(source.periodStart).toLocaleDateString('ar-EG')} — {new Date(source.periodEnd).toLocaleDateString('ar-EG')}
              </span>
            }
          />
          <Field label="تاريخ الطباعة" value={new Date().toLocaleDateString('ar-EG')} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-border text-muted-foreground border-b *:p-1.5 *:text-start">
                <th>التاريخ</th>
                <th>اليوم</th>
                <th>الحالة</th>
                <th>الحضور</th>
                <th>الانصراف</th>
                <th>ساعات ناقصة</th>
                <th>ساعات زائدة</th>
                <th>التسوية</th>
              </tr>
            </thead>
            <tbody>
              {source.days.map((d) => {
                const dayDate = new Date(d.date);
                const shortageMinutes = d.lateMinutes + d.earlyLeaveMinutes;
                return (
                  <tr key={d.date} className="border-border border-b *:p-1.5 last:border-0">
                    <td>{dayDate.toLocaleDateString('ar-EG')}</td>
                    <td>{WEEKDAY_LABELS[dayDate.getUTCDay()]}</td>
                    <td>{d.isAbsent ? <span className="text-destructive">غياب</span> : 'حاضر'}</td>
                    <td dir="ltr">{d.checkInAt ? new Date(d.checkInAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td dir="ltr">{d.checkOutAt ? new Date(d.checkOutAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className={shortageMinutes > 0 ? 'text-destructive' : ''}>{shortageMinutes > 0 ? hoursLabel(shortageMinutes) : '—'}</td>
                    <td className={d.overtimeMinutes > 0 ? 'text-success' : ''}>{d.overtimeMinutes > 0 ? hoursLabel(d.overtimeMinutes) : '—'}</td>
                    <td dir="ltr" className={d.adjustment > 0 ? 'text-success' : d.adjustment < 0 ? 'text-destructive' : ''}>
                      {d.adjustment !== 0 ? `${d.adjustment > 0 ? '+' : ''}${money(d.adjustment)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-border grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
          <Field label="إجمالي الساعات الزائدة" value={<span className="text-success" dir="ltr">{hoursLabel(totalOvertimeMinutes)}</span>} />
          <Field label="إجمالي الساعات الناقصة" value={<span className="text-destructive" dir="ltr">{hoursLabel(totalShortageMinutes)}</span>} />
          <Field
            label="صافي الساعات"
            value={
              <span dir="ltr" className={netMinutes > 0 ? 'text-success' : netMinutes < 0 ? 'text-destructive' : ''}>
                {netMinutes === 0 ? '—' : `${netMinutes > 0 ? '+' : '-'}${hoursLabel(Math.abs(netMinutes))}`}
              </span>
            }
          />
          <Field
            label="صافي التسوية"
            value={
              <span dir="ltr" className={source.totalAdjustment > 0 ? 'text-success' : source.totalAdjustment < 0 ? 'text-destructive' : ''}>
                {source.totalAdjustment !== 0 ? `${source.totalAdjustment > 0 ? '+' : ''}${money(source.totalAdjustment)}` : '—'}
              </span>
            }
          />
        </div>

        <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <Field label="المرتب قبل التسوية" value={<span dir="ltr">{money(source.baseSalary)} ج.م</span>} />
          <Field
            label="المرتب بعد التسوية — الصافي المستحق للصرف"
            value={
              <span dir="ltr" className="text-lg font-bold">
                {money(source.grossDue)} ج.م
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8 text-xs">
          <div>
            <div className="border-border border-t pt-1">توقيع الموظف</div>
          </div>
          <div>
            <div className="border-border border-t pt-1">توقيع المسؤول</div>
          </div>
        </div>
      </div>
    </div>
  );
}
