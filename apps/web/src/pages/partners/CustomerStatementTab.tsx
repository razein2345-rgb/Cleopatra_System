import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ORDER_STATUS_LABELS } from '../quotations/quotationLabels';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('ar-EG');

/**
 * كشف حساب العميل — جزء 5 من مبادرة "فصل الخزينة/الربح بالفرع + الموردين +
 * التقارير" (docs/AI/PROJECT_STATUS.md § 6). owner: "طباعة كشف حساب بحساب
 * العميل اللي دفعه والباقي بالأصناف... وفترة زمنية". نفس بيانات تاب
 * "الطلبات" الموجود بالفعل (`GET /api/orders?partnerId=`, لا Endpoint
 * جديد) — الإضافة الحقيقية هنا فترة زمنية + تفصيل الأصناف + طباعة/PDF،
 * مش مصدر بيانات جديد. "سداد مديونية" بيوصّل لنفس شاشة الفاتورة اللي فيها
 * "+ تسجيل دفعة" أصلاً (`/orders/:id`) — مفيش آلية دفع جديدة.
 */
export function CustomerStatementTab({ partnerId, partnerName }: { partnerId: string; partnerName: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    apiGet<Order[]>(`/api/orders?partnerId=${partnerId}`)
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل كشف الحساب'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!orders) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const filtered = orders
    .filter((o) => o.status !== 'CANCELLED')
    .filter((o) => !from || o.date >= from)
    .filter((o) => !to || o.date <= `${to}T23:59:59.999Z`)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalBilled = filtered.reduce((sum, o) => sum + o.finalTotal, 0);
  const totalPaid = filtered.reduce((sum, o) => sum + o.paidTotal, 0);
  const totalRemaining = filtered.reduce((sum, o) => sum + o.remainingBalance, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">من تاريخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">إلى تاريخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {(from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            مسح الفترة
          </Button>
        )}
        <div className="mr-auto flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            طباعة كشف الحساب
          </Button>
          <Button variant="outline" onClick={() => downloadDocumentAsPdf(`كشف-حساب-${partnerName}`)}>
            تنزيل PDF
          </Button>
        </div>
      </div>

      <div className="document-print-root border-border bg-card space-y-3 rounded-2xl border p-4">
        <div className="hidden print:block">
          <h2 className="text-lg font-bold">كشف حساب — {partnerName}</h2>
          {(from || to) && (
            <p className="text-muted-foreground text-sm">
              الفترة: {from || 'البداية'} — {to || 'اليوم'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">إجمالي الفواتير</p>
            <p className="text-lg font-bold">{money(totalBilled)} ج.م</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي المدفوع</p>
            <p className="text-success text-lg font-bold">{money(totalPaid)} ج.م</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">الرصيد المستحق</p>
            <p className={`text-lg font-bold ${totalRemaining > 0 ? 'text-destructive' : ''}`}>
              {money(totalRemaining)} ج.م
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((order) => (
            <div key={order.id} className="border-border rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link to={`/orders/${order.id}`} className="text-primary font-semibold hover:underline print:no-underline print:text-inherit">
                    {order.invoiceNumber}
                  </Link>
                  <span className="text-muted-foreground ms-2 text-xs">
                    {dateOnly(order.date)} — {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span>الإجمالي: {money(order.finalTotal)}</span>
                  <span className="text-success">المدفوع: {money(order.paidTotal)}</span>
                  <span className={order.remainingBalance > 0 ? 'text-destructive font-semibold' : ''}>
                    المتبقي: {money(order.remainingBalance)}
                  </span>
                  {order.remainingBalance > 0 && (
                    <Link to={`/orders/${order.id}`} className="print:hidden">
                      <Button size="sm" variant="outline">
                        سداد مديونية
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{item.modelName ?? '—'}</span>
                    <span>{item.itemTotal != null ? `${money(item.itemTotal)} ج.م` : '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-muted-foreground p-4 text-center text-sm">لا توجد فواتير في هذه الفترة.</p>
          )}
        </div>
      </div>
    </div>
  );
}
