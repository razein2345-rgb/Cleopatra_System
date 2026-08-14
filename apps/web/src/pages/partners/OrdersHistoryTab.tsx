import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order, Quotation, WorkOrder, WorkflowInstanceStatus } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { ORDER_STATUS_LABELS, QUOTATION_STATUS_LABELS } from '../quotations/quotationLabels';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

// FEATURE-011 (2026-08-14) — same 3-entry map DocumentsPage.tsx uses for
// the same status enum; not worth extracting for 3 labels used in 2 places.
const WORK_ORDER_STATUS_LABELS: Record<WorkflowInstanceStatus, string> = {
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

/**
 * FEATURE-011 (2026-08-14, owner: "محتاج اشوف عند العملاء كل عروض الأسعار
 * اللي طلعتلهم والفواتير واوامر الشغل") — quotations + work orders for
 * this partner, reusing the already-existing `?partnerId=` filters
 * (`GET /api/quotations`, and the new filter added to `GET /api/work-orders`
 * alongside this feature). Kept as their own small tables below the
 * existing invoice table/stats rather than merged into one list — the
 * stats above stay purely financial (invoices only), unaffected.
 */
function QuotationsHistoryTable({ partnerId }: { partnerId: string }) {
  const [quotations, setQuotations] = useState<Quotation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Quotation[]>(`/api/quotations?partnerId=${partnerId}`)
      .then(setQuotations)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل عروض الأسعار'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!quotations) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="border-border overflow-hidden rounded-2xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-start">رقم العرض</th>
            <th className="p-2 text-start">التاريخ</th>
            <th className="p-2 text-start">الحالة</th>
            <th className="p-2 text-start">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {[...quotations]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((q) => (
              <tr key={q.id} className="border-border border-t">
                <td className="p-2">
                  <Link to={`/quotations/${q.id}`} className="text-primary hover:underline">
                    {q.quotationNumber}
                  </Link>
                </td>
                <td className="p-2">{new Date(q.date).toLocaleDateString('ar-EG')}</td>
                <td className="p-2">{QUOTATION_STATUS_LABELS[q.status]}</td>
                <td className="p-2">{money(q.finalTotal)} ج.م</td>
              </tr>
            ))}
          {quotations.length === 0 && (
            <tr>
              <td colSpan={4} className="text-muted-foreground p-4 text-center">
                لا توجد عروض أسعار لهذا العميل بعد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WorkOrdersHistoryTable({ partnerId }: { partnerId: string }) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<WorkOrder[]>(`/api/work-orders?partnerId=${partnerId}`)
      .then(setWorkOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل أوامر الشغل'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!workOrders) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="border-border overflow-hidden rounded-2xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-start">رقم أمر الشغل</th>
            <th className="p-2 text-start">التاريخ</th>
            <th className="p-2 text-start">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {[...workOrders]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((w) => (
              <tr key={w.id} className="border-border border-t">
                <td className="p-2">
                  <Link to={`/work-orders/${w.id}`} className="text-primary hover:underline">
                    {w.workOrderNumber}
                  </Link>
                </td>
                <td className="p-2">{new Date(w.createdAt).toLocaleDateString('ar-EG')}</td>
                <td className="p-2">{w.workflowInstance ? WORK_ORDER_STATUS_LABELS[w.workflowInstance.status] : '—'}</td>
              </tr>
            ))}
          {workOrders.length === 0 && (
            <tr>
              <td colSpan={3} className="text-muted-foreground p-4 text-center">
                لا توجد أوامر شغل لهذا العميل بعد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

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

  // FEATURE-007 (2026-08-12, owner: "محتاج يكون في مكان عند العملاء واضح فيه حسابهم... دفعو كام وعليهم كام") — a running account total across every order, not just each order's own remainingBalance. Purely a client-side sum over the same `orders` this tab already fetches — no new endpoint.
  const totalBilled = orders.reduce((sum, o) => sum + o.finalTotal, 0);
  const totalPaid = orders.reduce((sum, o) => sum + o.paidTotal, 0);
  const totalOutstanding = orders.reduce((sum, o) => sum + o.remainingBalance, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">إجمالي المبيعات</p>
          <p className="text-lg font-bold">{money(totalBilled)} ج.م</p>
        </div>
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">إجمالي المدفوع</p>
          <p className="text-success text-lg font-bold">{money(totalPaid)} ج.م</p>
        </div>
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">الرصيد المستحق</p>
          <p className={`text-lg font-bold ${totalOutstanding > 0 ? 'text-destructive' : ''}`}>{money(totalOutstanding)} ج.م</p>
        </div>
      </div>

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

      <div className="space-y-2">
        <h3 className="text-sm font-bold">عروض الأسعار</h3>
        <QuotationsHistoryTable partnerId={partnerId} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">أوامر الشغل</h3>
        <WorkOrdersHistoryTable partnerId={partnerId} />
      </div>
    </div>
  );
}
