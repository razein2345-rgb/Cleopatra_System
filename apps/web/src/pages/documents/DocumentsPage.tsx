import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  BusinessPartner,
  InventoryItem,
  Order,
  QuickInventorySaleInput,
  Quotation,
  TreasuryCategory,
  WorkOrder,
  WorkflowInstanceStatus,
} from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InventoryItemCombobox, paginate, Pagination, StatusBadge, type StatusTone } from '@/components/cleopatra';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONES,
} from '../quotations/quotationLabels';

type DocumentType = 'QUOTATION' | 'INVOICE' | 'WORK_ORDER';

const TYPE_LABELS: Record<DocumentType, string> = {
  QUOTATION: 'عرض سعر',
  INVOICE: 'فاتورة',
  WORK_ORDER: 'أمر شغل',
};

const TYPE_CLASSES: Record<DocumentType, string> = {
  QUOTATION: 'bg-secondary/25 text-secondary-foreground',
  INVOICE: 'bg-primary/10 text-primary',
  WORK_ORDER: 'bg-info/15 text-info',
};

const WORKFLOW_STATUS_LABELS: Record<WorkflowInstanceStatus, string> = {
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

const WORKFLOW_STATUS_TONES: Record<WorkflowInstanceStatus, StatusTone> = {
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

interface DocumentRow {
  key: string;
  type: DocumentType;
  number: string;
  partnerId: string | null;
  partnerName: string;
  date: string;
  statusLabel: string;
  statusTone: StatusTone;
  total: number | null;
  link: string | null;
}

/**
 * Owner (2026-08-20, "فاتورة بدون إسم العميل") — walk-in/cash orders
 * (INVENTORY_RETAIL/MANUAL items, no BusinessPartner) all fall into this one
 * shared bucket ("عميل نقدي"), since there's no real customer identity to
 * group them by.
 */
const NO_PARTNER_KEY = '__none__';

/** UX_PRODUCT_AUDIT.md § مشكلة 12.2 — pages by customer GROUP, not flat row, so every one customer's documents stay together instead of splitting across a page boundary. */
const GROUPS_PAGE_SIZE = 20;

/**
 * FEATURE-007 — "المستندات" (Documents), the owner's rename of what used
 * to be a Quotations-only list. Quotations/Orders(invoices)/WorkOrders
 * stay three separate models (see 02_PLAN.md's VD section — merging them
 * would touch nearly everything already built, for no real benefit); this
 * page is purely a unified *view* over `GET /api/quotations` + the two
 * list endpoints added alongside it (`GET /api/orders`, `GET
 * /api/work-orders`), each row tagged with its own type.
 */
export function DocumentsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showQuickSale, setShowQuickSale] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet<Quotation[]>('/api/quotations').catch(() => []),
      apiGet<Order[]>('/api/orders').catch(() => []),
      apiGet<WorkOrder[]>('/api/work-orders').catch(() => []),
      apiGet<BusinessPartner[]>('/api/partners'),
    ])
      .then(([quotations, orders, workOrders, partners]) => {
        const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? id) : 'عميل نقدي');
        const orderById = new Map(orders.map((o) => [o.id, o]));

        const quotationRows: DocumentRow[] = quotations.map((q) => ({
          key: `q-${q.id}`,
          type: 'QUOTATION',
          number: q.quotationNumber,
          partnerId: q.partnerId,
          partnerName: partnerName(q.partnerId),
          date: q.date,
          statusLabel: QUOTATION_STATUS_LABELS[q.status],
          statusTone: QUOTATION_STATUS_TONES[q.status],
          total: q.finalTotal,
          link: `/quotations/${q.id}`,
        }));

        const orderRows: DocumentRow[] = orders.map((o) => ({
          key: `o-${o.id}`,
          type: 'INVOICE',
          number: o.invoiceNumber,
          partnerId: o.partnerId,
          partnerName: partnerName(o.partnerId),
          date: o.date,
          statusLabel: ORDER_STATUS_LABELS[o.status],
          statusTone: ORDER_STATUS_TONES[o.status],
          total: o.finalTotal,
          link: `/orders/${o.id}`,
        }));

        const workOrderRows: DocumentRow[] = workOrders.map((w) => {
          const order = orderById.get(w.orderId);
          const status = w.workflowInstance?.status ?? null;
          return {
            key: `w-${w.id}`,
            type: 'WORK_ORDER',
            number: w.workOrderNumber,
            partnerId: order?.partnerId ?? null,
            partnerName: order ? partnerName(order.partnerId) : '—',
            date: w.createdAt,
            statusLabel: status ? WORKFLOW_STATUS_LABELS[status] : '—',
            statusTone: status ? WORKFLOW_STATUS_TONES[status] : 'neutral',
            total: null,
            // FEATURE-011 (2026-08-14, owner: "اقدر اشوف أمر الشغل من قسم
            // المستندات وأقدر اعدل عليه") — opens the actual work order
            // document (view/print/edit), not the production-tracking
            // timeline; always available since `WorkOrder.id` always
            // exists, unlike `workflowInstance` which may not.
            link: `/work-orders/${w.id}`,
          };
        });

        setRows(
          [...quotationRows, ...orderRows, ...workOrderRows].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ),
        );
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل المستندات'));
  }, []);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!rows) return <div className="text-muted-foreground">جارٍ تحميل المستندات…</div>;

  // FEATURE-016 (2026-08-16, owner: "عايز عرض السعر والفاتورة وأمر الشغل
  // اللي لنفس العميل يكونوا في جروب مع بعض") — group by partnerId
  // (already on every row's source data, no backend change needed) instead
  // of one flat list. Each row still links to its own existing detail page
  // (print/edit/delete all already work there); groups are sorted by their
  // most recent document, most-active customer first.
  const groups = new Map<string, DocumentRow[]>();
  for (const row of rows) {
    const key = row.partnerId ?? NO_PARTNER_KEY;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const sortedGroups = Array.from(groups.entries())
    .map(([partnerId, groupRows]) => ({
      partnerId,
      partnerName: groupRows[0]!.partnerName,
      rows: groupRows,
      latestDate: Math.max(...groupRows.map((r) => new Date(r.date).getTime())),
    }))
    .sort((a, b) => b.latestDate - a.latestDate);
  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / GROUPS_PAGE_SIZE));
  const pageGroups = paginate(sortedGroups, page, GROUPS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المستندات</h1>
        <div className="flex gap-2">
          {/* FEATURE-007 — Quotation/Order/WorkOrder creation all happen from
              one unified الطلبات والمستندات screen (owner's explicit
              clarification, 2026-08-10), not from separate per-type forms
              launched off this list. Until that unified screen ships
              (task #211), the only creation entry point is direct
              Order/Invoice creation; this page stays pure browse/status. */}
          {/* Owner (2026-08-20, "حابب الزرار ده يكون في قسم الطلبات
              والمستندات") — the quick cash sale (no Order/invoice at all,
              see QuickSaleDialog below) moved here from the Inventory page
              per the owner's explicit preference, not duplicated in both
              places. */}
          {can('inventory.create') && can('treasury.create') && (
            <Button type="button" variant="secondary" onClick={() => setShowQuickSale(true)}>
              + بيع سريع
            </Button>
          )}
          {can('orders.create') && (
            <Link
              to="/orders/new"
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
            >
              + مستند جديد
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 && <div className="text-muted-foreground">لا توجد مستندات بعد.</div>}

      {pageGroups.map((group) => (
        <div key={group.partnerId} className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border bg-muted/30 flex items-center justify-between border-b p-3">
            <h2 className="font-semibold">{group.partnerName}</h2>
            {can('orders.create') && group.partnerId !== NO_PARTNER_KEY && (
              <Link
                to={`/orders/new?partnerId=${group.partnerId}`}
                className="text-primary text-sm hover:underline"
              >
                + إضافة
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                  <th className="p-3">النوع</th>
                  <th className="p-3">الرقم</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={row.link ? () => navigate(row.link!) : undefined}
                    className={`border-border border-b last:border-0 ${row.link ? 'hover:bg-accent/40 cursor-pointer' : ''}`}
                  >
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_CLASSES[row.type]}`}>
                        {TYPE_LABELS[row.type]}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{row.number}</td>
                    <td className="p-3">
                      <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
                    </td>
                    <td className="text-muted-foreground p-3">{new Date(row.date).toLocaleDateString('en-GB')}</td>
                    <td className="p-3">
                      {row.total !== null ? row.total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      {showQuickSale && <QuickSaleDialog onClose={() => setShowQuickSale(false)} />}
    </div>
  );
}

/**
 * Owner (2026-08-20, "لو حد خد صنف بسيط من قسم بضاعة من المخزون مش مضطر
 * اطلع عليه فاتورة وعايزة يتسجل في حركة الخزينة ويخصمه من المخزن", then
 * "حابب الزرار ده يكون في قسم الطلبات والمستندات") — a one-step cash sale
 * with no Order/invoice at all: `POST /api/inventory-items/:id/quick-sale`
 * pairs an OUT StockMovement with an INCOME TreasuryEntry atomically. Lives
 * here (not the Inventory page — the owner's explicit second preference)
 * since it starts with picking *which* item to sell, same as any other
 * document-creation entry point on this screen. Edit/delete afterward only
 * ever happens through the stock movement itself (المخزن → سجل الحركة) —
 * the paired treasury entry follows automatically, never edited directly.
 */
function QuickSaleDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<TreasuryCategory[]>([]);
  const [itemId, setItemId] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [method, setMethod] = useState<QuickInventorySaleInput['method']>('CASH');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<InventoryItem[]>('/api/inventory-items').then(setItems).catch(() => undefined);
    apiGet<TreasuryCategory[]>('/api/treasury-categories')
      .then((all) => setCategories(all.filter((c) => c.isActive)))
      .catch(() => undefined);
  }, []);

  const selectItem = (item: InventoryItem) => {
    setItemId(item.id);
    setSelectedItem(item);
    setUnitPrice(item.salePrice !== null ? String(item.salePrice) : '');
  };

  const parsedQuantity = Number(quantity);
  const parsedUnitPrice = Number(unitPrice);
  const total = parsedQuantity > 0 && parsedUnitPrice >= 0 ? parsedQuantity * parsedUnitPrice : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedItem) {
      setError('اختر الصنف أولًا');
      return;
    }
    if (!quantity || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError('اكتب كمية أكبر من صفر');
      return;
    }
    if (!unitPrice || Number.isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
      setError('اكتب سعر بيع صحيح');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input: QuickInventorySaleInput = {
        quantity: parsedQuantity,
        unitPrice: parsedUnitPrice,
        method,
        category: category || undefined,
        note: note.trim() || undefined,
      };
      await apiPost(`/api/inventory-items/${selectedItem.id}/quick-sale`, input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل البيع السريع');
    } finally {
      setSubmitting(false);
    }
  };

  if (saved) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تم البيع بنجاح</DialogTitle>
          </DialogHeader>
          <p className="text-success text-sm">
            اتسجل بيع {parsedQuantity.toLocaleString('en-US')} من "{selectedItem?.name}" — خُصمت من المخزون واتسجلت
            في الخزينة.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                setSaved(false);
                setItemId('');
                setSelectedItem(null);
                setQuantity('1');
                setUnitPrice('');
                setNote('');
              }}
            >
              بيع تاني
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              تم
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بيع سريع — بدون فاتورة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-sm">
            بيع نقدي مباشر لبضاعة من المخزون — بيخصم من المخزون ويتسجل في الخزينة على طول، من غير أي فاتورة أو
            مستند.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الصنف</span>
            <InventoryItemCombobox items={items} value={itemId} onChange={selectItem} placeholder="اختر الصنف…" />
          </label>
          {selectedItem && (
            <p className="text-muted-foreground text-sm">
              الرصيد الحالي: {selectedItem.quantityOnHand.toLocaleString('en-US')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">الكمية</span>
              <input
                type="number"
                min={0.001}
                step="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">سعر القطعة</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-sm">
            الإجمالي:{' '}
            <span className="font-bold" dir="ltr">
              {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>{' '}
            ج.م
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة التحصيل</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as QuickInventorySaleInput['method'])}
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
            <span className="text-muted-foreground">تصنيف الخزينة (اختياري — الافتراضي "مبيعات نقدية")</span>
            {customCategory ? (
              <div className="flex gap-1.5">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="اكتب تصنيف جديد"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCustomCategory(false);
                    setCategory('');
                  }}
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomCategory(true);
                    setCategory('');
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">مبيعات نقدية (افتراضي)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">تصنيف آخر (كتابة يدوية)…</option>
              </select>
            )}
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
              {submitting ? 'جارٍ الحفظ…' : 'تأكيد البيع'}
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
