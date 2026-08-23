import { useEffect, useState } from 'react';
import type { TreasuryEntry } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { PAYMENT_METHOD_LABELS } from './partnerLabels';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-23, "خلي المورد ثابت ومتسجل إنه مورد علشان لما ابعت شخص
 * يجيب من عنده الشغل اكتب دفعناله كام... لما يتضاف يتضاف في صفحة
 * الموردين علشان اعرف انا بدفعله كام") — every EXPENSE treasury entry
 * linked to this partner (recorded the normal way, from the Treasury
 * screen's own "+ حركة جديدة" form with هذا الشريك picked as the
 * partner), reusing the new `?partnerId=` filter on the existing
 * `GET /api/treasury-entries` endpoint — no new recording mechanism, this
 * is purely a visibility gap closed.
 */
export function PaymentsHistoryTab({ partnerId }: { partnerId: string }) {
  const [entries, setEntries] = useState<TreasuryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<TreasuryEntry[]>(`/api/treasury-entries?partnerId=${partnerId}`)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المدفوعات'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!entries) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const paidToThem = entries.filter((e) => e.type === 'EXPENSE');
  const totalPaid = paidToThem.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="border-border bg-card w-fit rounded-2xl border p-4">
        <p className="text-muted-foreground text-xs">إجمالي المدفوع له</p>
        <p className="text-lg font-bold">{money(totalPaid)} ج.م</p>
      </div>

      <div className="border-border overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-start">التاريخ</th>
              <th className="p-2 text-start">المبلغ</th>
              <th className="p-2 text-start">طريقة الدفع</th>
              <th className="p-2 text-start">التصنيف</th>
              <th className="p-2 text-start">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {[...paidToThem]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((e) => (
                <tr key={e.id} className="border-border border-t">
                  <td className="p-2">{new Date(e.date).toLocaleDateString('ar-EG')}</td>
                  <td className="p-2">{money(e.amount)} ج.م</td>
                  <td className="p-2">{e.method ? PAYMENT_METHOD_LABELS[e.method] : '—'}</td>
                  <td className="p-2">{e.category ?? '—'}</td>
                  <td className="text-muted-foreground p-2">{e.note ?? '—'}</td>
                </tr>
              ))}
            {paidToThem.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground p-4 text-center">
                  لا توجد مدفوعات مسجّلة لهذا الشريك بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
