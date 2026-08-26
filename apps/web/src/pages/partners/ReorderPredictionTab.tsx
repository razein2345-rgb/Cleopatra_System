import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { whatsappLink } from '@/lib/whatsapp';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

type OrderItem = Order['items'][number];

/**
 * FEATURE (2026-08-26, owner: "محتاج احط متوسط جمب كل صنف هو هيخلص امتى
 * علشان ابلغ العميل بالصنف الفلاني قرب يخلص") — same "last date + average
 * gap between past occurrences" heuristic `OrdersHistoryTab.tsx` already
 * uses at the whole-order level, applied per distinct item instead.
 *
 * `OrderItem` has no stable catalog FK once frozen — `readyProductId`/
 * `serviceId` only ever exist on the create-order *input*, never persisted
 * as their own column on `OrderItem` (only `modelName`, a frozen name
 * snapshot, survives). So identity here is best-effort: prefer
 * `inventoryItemId` (a real, stable FK — covers paper items and
 * INVENTORY_RETAIL sales), then fall back to the frozen human label
 * (`modelName` for catalog PRODUCT/SERVICE items, or `kind` — the
 * free-text "اسم البند" the composer stamps every other kind with).
 */
function itemIdentity(item: OrderItem): { key: string; label: string } | null {
  const label = item.modelName?.trim() || item.kind?.trim() || null;
  if (item.inventoryItemId) return { key: `inv:${item.inventoryItemId}`, label: label ?? 'صنف من المخزون' };
  if (label) return { key: `name:${label.toLowerCase()}`, label };
  return null;
}

/** `breakdown.quantity` is the one field every pricing kind freezes the customer-facing piece count under (see pricingEngineService.ts) — including NOTEBOOK, whose own `notebookQuantity` input is stored there under the same shared key. */
function itemQuantity(item: OrderItem): number {
  const q = (item.breakdown as Record<string, unknown> | null)?.quantity;
  return typeof q === 'number' ? q : 1;
}

interface ItemGroup {
  key: string;
  label: string;
  orderCount: number;
  totalQuantity: number;
  lastOrderDate: string;
  lastOrderId: string;
  lastInvoiceNumber: string;
  avgGapDays: number | null;
  predictedNext: Date | null;
}

function buildItemGroups(orders: Order[]): ItemGroup[] {
  // A cancelled order was never actually fulfilled — not a real "the
  // customer bought this" signal, so it shouldn't feed the reorder cycle.
  const realOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const sorted = [...realOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const groups = new Map<
    string,
    { label: string; dates: string[]; quantities: number[]; orderRefs: { id: string; invoiceNumber: string }[] }
  >();

  for (const order of sorted) {
    for (const item of order.items) {
      const identity = itemIdentity(item);
      if (!identity) continue;
      const entry = groups.get(identity.key) ?? { label: identity.label, dates: [], quantities: [], orderRefs: [] };
      entry.dates.push(order.date);
      entry.quantities.push(itemQuantity(item));
      entry.orderRefs.push({ id: order.id, invoiceNumber: order.invoiceNumber });
      groups.set(identity.key, entry);
    }
  }

  const result: ItemGroup[] = [];
  for (const [key, g] of groups) {
    const lastIdx = g.dates.length - 1;
    let avgGapDays: number | null = null;
    let predictedNext: Date | null = null;
    if (g.dates.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < g.dates.length; i++) {
        gaps.push((new Date(g.dates[i]!).getTime() - new Date(g.dates[i - 1]!).getTime()) / 86_400_000);
      }
      avgGapDays = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
      predictedNext = new Date(new Date(g.dates[lastIdx]!).getTime() + avgGapDays * 86_400_000);
    }
    result.push({
      key,
      label: g.label,
      orderCount: g.dates.length,
      totalQuantity: g.quantities.reduce((sum, v) => sum + v, 0),
      lastOrderDate: g.dates[lastIdx]!,
      lastOrderId: g.orderRefs[lastIdx]!.id,
      lastInvoiceNumber: g.orderRefs[lastIdx]!.invoiceNumber,
      avgGapDays,
      predictedNext,
    });
  }

  // Soonest predicted need first (a real signal to act on); items with no
  // prediction yet (only bought once) trail behind, most recent first.
  return result.sort((a, b) => {
    if (a.predictedNext && b.predictedNext) return a.predictedNext.getTime() - b.predictedNext.getTime();
    if (a.predictedNext) return -1;
    if (b.predictedNext) return 1;
    return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
  });
}

/**
 * Owner (2026-08-26, "رسالة جاهزة بالأصناف اللي قربت تخلص اول ما ادوس على
 * اللينك تتكتب للعميل وانا ابعتها") — a draft message pre-filled into the
 * wa.me compose box, listing only the items due-or-overdue (not every
 * item ever bought). The staff member still reviews and presses send
 * themselves; nothing here sends automatically.
 */
function buildReminderMessage(partnerName: string | undefined, items: ItemGroup[]): string {
  const lines = items.map((g) => `- ${g.label}`);
  const greeting = partnerName ? `مرحبًا ${partnerName} 👋` : 'مرحبًا 👋';
  return [
    greeting,
    'حبينا نفكرك إن الأصناف دي قربت تخلص عندك وممكن تحتاج تطلب تاني قريب:',
    ...lines,
    '',
    'لو حابب تطلب، إحنا في الخدمة.',
  ].join('\n');
}

export function ReorderPredictionTab({
  partnerId,
  partnerName,
  partnerPhone,
}: {
  partnerId: string;
  partnerName?: string;
  partnerPhone?: string | null;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Order[]>(`/api/orders?partnerId=${partnerId}`)
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الطلبات'));
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!orders) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const groups = buildItemGroups(orders);
  const now = Date.now();
  const isSoon = (d: Date) => (d.getTime() - now) / 86_400_000 <= 7;
  const isOverdue = (d: Date) => d.getTime() < now;

  const dueItems = groups.filter((g) => g.predictedNext && (isOverdue(g.predictedNext) || isSoon(g.predictedNext)));
  const reminderLink =
    dueItems.length > 0 ? whatsappLink(partnerPhone, buildReminderMessage(partnerName, dueItems)) : null;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        تقدير تقريبي بناءً على متوسط الفترة بين طلبات العميل السابقة لكل صنف — مش تنبؤ ذكاء اصطناعي، ولسه عرض بس (مفيش
        إرسال تلقائي للعميل حاليًا).
      </p>
      {reminderLink && (
        <a
          href={reminderLink}
          target="_blank"
          rel="noreferrer"
          className="bg-success/10 text-success inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:underline"
        >
          📩 ابعت تذكير واتساب للعميل بالأصناف اللي قربت تخلص ({dueItems.length})
        </a>
      )}
      <div className="border-border overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-start">الصنف</th>
              <th className="p-2 text-start">عدد مرّات الشراء</th>
              <th className="p-2 text-start">آخر مرة اتشرى</th>
              <th className="p-2 text-start">متوسط الفترة بين الطلبات</th>
              <th className="p-2 text-start">متوقّع يحتاج تاني</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-border border-t">
                <td className="p-2 font-medium">{g.label}</td>
                <td className="p-2">
                  {g.orderCount} ({money(g.totalQuantity)} قطعة إجمالاً)
                </td>
                <td className="p-2">
                  <Link to={`/orders/${g.lastOrderId}`} className="text-primary hover:underline">
                    {new Date(g.lastOrderDate).toLocaleDateString('ar-EG')}
                  </Link>
                  <span className="text-muted-foreground"> ({g.lastInvoiceNumber})</span>
                </td>
                <td className="p-2">{g.avgGapDays !== null ? `كل ${Math.round(g.avgGapDays)} يوم تقريبًا` : '—'}</td>
                <td
                  className={`p-2 font-medium ${
                    g.predictedNext && isOverdue(g.predictedNext)
                      ? 'text-destructive'
                      : g.predictedNext && isSoon(g.predictedNext)
                        ? 'text-warning'
                        : ''
                  }`}
                >
                  {g.predictedNext ? g.predictedNext.toLocaleDateString('ar-EG') : 'محتاج طلبين على الأقل للتقدير'}
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground p-4 text-center">
                  لا توجد بيانات كافية بعد لتوقّع أي صنف.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
