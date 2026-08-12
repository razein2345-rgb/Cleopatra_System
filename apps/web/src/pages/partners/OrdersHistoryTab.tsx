import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { ORDER_STATUS_LABELS } from '../quotations/quotationLabels';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * FEATURE-007 — order history on the customer profile (owner, 2026-08-12:
 * "عايز... يكون ظاهرلي ايه الطلبات اللي العميل طلبها وامتى أخر مره طلبها
 * ومتوقع يطلبها امتى"). Reuses the already-existing `GET /api/orders?
 * partnerId=` filter (built for the "المستندات" unified list) — no new
 * backend endpoint. "متوقع الطلب القادم" is a simple heuristic (last order
 * date + the average gap between this customer's past orders), not a real
 * forecasting model — shown only once there are at least two orders to
 * measure a gap from, and clearly labeled as an estimate.
 */
export function OrdersHistoryTab({ partnerId }: { partnerId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Order[]>(`/api/orders?partnerId=${partnerId}`)
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!orders) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const sorted = [...orders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const lastOrder = sorted[sorted.length - 1] ?? null;

  let predictedNext: Date | null = null;
  if (sorted.length >= 2) {
    const gapsDays: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i]!.date).getTime() - new Date(sorted[i - 1]!.date).getTime()) / 86_400_000;
      gapsDays.push(gap);
    }
    const avgGapDays = gapsDays.reduce((sum, g) => sum + g, 0) / gapsDays.length;
    predictedNext = new Date(new Date(lastOrder!.date).getTime() + avgGapDays * 86_400_000);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">عدد الطلبات</p>
          <p className="text-lg font-bold">{orders.length}</p>
        </div>
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">آخر طلب</p>
          <p className="text-lg font-bold">{lastOrder ? new Date(lastOrder.date).toLocaleDateString('ar-EG') : '—'}</p>
        </div>
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">الطلب القادم المتوقع (تقديري)</p>
          <p className="text-lg font-bold">
            {predictedNext ? predictedNext.toLocaleDateString('ar-EG') : 'لا توجد بيانات كافية للتقدير'}
          </p>
        </div>
      </div>

      <div className="border-border overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-start">رقم الفاتورة</th>
              <th className="p-2 text-start">التاريخ</th>
              <th className="p-2 text-start">الحالة</th>
              <th className="p-2 text-start">الإجمالي</th>
              <th className="p-2 text-start">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {[...orders]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((o) => (
                <tr key={o.id} className="border-border border-t">
                  <td className="p-2">
                    <Link to={`/orders/${o.id}`} className="text-primary hover:underline">
                      {o.invoiceNumber}
                    </Link>
                  </td>
                  <td className="p-2">{new Date(o.date).toLocaleDateString('ar-EG')}</td>
                  <td className="p-2">{ORDER_STATUS_LABELS[o.status]}</td>
                  <td className="p-2">{money(o.finalTotal)} ج.م</td>
                  <td className="p-2">{o.remainingBalance > 0 ? `${money(o.remainingBalance)} ج.م` : '—'}</td>
                </tr>
              ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground p-4 text-center">
                  لا يوجد طلبات لهذا العميل بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
