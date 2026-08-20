import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BusinessPartner, Order, Quotation, WorkOrder, WorkflowInstanceStatus } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { paginate, Pagination, StatusBadge, type StatusTone } from '@/components/cleopatra';
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
    </div>
  );
}
