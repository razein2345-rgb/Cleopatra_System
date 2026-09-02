import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ORDER_STATUS_LABELS } from '../quotations/quotationLabels';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';

const UNNAMED_ITEM = '—';

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
  // Owner (2026-09-02, "عايز يكون عند العميل كشف حساب اقدر اطبعه لأصناف
  // بعينها من كل الأصناف اللي العميل طلبها") — an optional item filter on
  // top of the existing date-range filter. Empty set = show everything
  // (unchanged behavior); a non-empty set narrows every order's item list
  // down to just the selected item names and hides any order left with
  // none of them, same "name-based, best-effort" matching already used by
  // the reorder-prediction tab (no OrderItem→catalog FK exists to match on).
  const [selectedItemNames, setSelectedItemNames] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    apiGet<Order[]>(`/api/orders?partnerId=${partnerId}`)
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل كشف الحساب'));
  }, [partnerId]);

  // Every distinct item name the customer has ever ordered — independent of
  // the date range, so the picker always offers the full product history.
  const allItemNames = useMemo(() => {
    if (!orders) return [];
    const names = new Set<string>();
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      for (const item of order.items) names.add(item.modelName ?? UNNAMED_ITEM);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [orders]);

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

  const itemFilterActive = selectedItemNames.size > 0;
  const visibleItemsOf = (order: Order) =>
    itemFilterActive ? order.items.filter((item) => selectedItemNames.has(item.modelName ?? UNNAMED_ITEM)) : order.items;
  const ordersToRender = itemFilterActive ? filtered.filter((o) => visibleItemsOf(o).length > 0) : filtered;
  const selectedItemsTotal = itemFilterActive
    ? ordersToRender.reduce((sum, o) => sum + visibleItemsOf(o).reduce((s, item) => s + (item.itemTotal ?? 0), 0), 0)
    : 0;
  const visibleItemNames = itemSearch.trim()
    ? allItemNames.filter((n) => n.toLowerCase().includes(itemSearch.trim().toLowerCase()))
    : allItemNames;

  const toggleItemName = (name: string) => {
    setSelectedItemNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

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

      <div className="border-border bg-card space-y-2 rounded-2xl border p-3 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            تصفية بأصناف معينة {itemFilterActive && <span className="text-muted-foreground">({selectedItemNames.size} مختار)</span>}
          </p>
          {itemFilterActive && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedItemNames(new Set())}>
              مسح تصفية الأصناف
            </Button>
          )}
        </div>
        <input
          type="text"
          placeholder="ابحث باسم الصنف…"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {visibleItemNames.map((name) => (
            <label key={name} className="hover:bg-muted/30 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm">
              <Checkbox checked={selectedItemNames.has(name)} onCheckedChange={() => toggleItemName(name)} />
              <span>{name}</span>
            </label>
          ))}
          {visibleItemNames.length === 0 && <p className="text-muted-foreground px-2 py-1 text-sm">لا توجد أصناف مطابقة.</p>}
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
          {itemFilterActive && (
            <p className="text-muted-foreground text-sm">أصناف مختارة فقط: {Array.from(selectedItemNames).join('، ')}</p>
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
          {itemFilterActive && (
            <div>
              <p className="text-muted-foreground text-xs">إجمالي الأصناف المختارة فقط</p>
              <p className="text-lg font-bold">{money(selectedItemsTotal)} ج.م</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {ordersToRender.map((order) => (
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
                {visibleItemsOf(order).map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{item.modelName ?? UNNAMED_ITEM}</span>
                    <span>{item.itemTotal != null ? `${money(item.itemTotal)} ج.م` : '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {ordersToRender.length === 0 && (
            <p className="text-muted-foreground p-4 text-center text-sm">
              {itemFilterActive ? 'لا توجد فواتير تحتوي على الأصناف المختارة في هذه الفترة.' : 'لا توجد فواتير في هذه الفترة.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
