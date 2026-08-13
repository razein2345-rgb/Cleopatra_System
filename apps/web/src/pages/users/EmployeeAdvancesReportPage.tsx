import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EmployeeAdvanceSummary, PayFrequency } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';

const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** FEATURE-008 (2026-08-13, owner: "هل هيطلعلي تقرير بالسلف بتاعت كل موظف ومتبقيله كام من المرتب") — one row per employee: outstanding advances vs. what's left of their salary. */
export function EmployeeAdvancesReportPage() {
  const [summaries, setSummaries] = useState<EmployeeAdvanceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<EmployeeAdvanceSummary[]>('/api/employee-advances/summary')
      .then(setSummaries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل التقرير'));
  }, []);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!summaries) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">تقرير السلف والمرتبات</h1>
        <Link to="/users" className="text-muted-foreground text-sm hover:underline">
          العودة إلى المستخدمين
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
                <th className="p-3">متبقي المرتب</th>
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
                  <td className="p-3 font-medium">
                    <span dir="ltr">{s.netDue != null ? money(s.netDue) : '—'}</span>
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
