import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Order, OrderItem, User, WorkOrder } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';
import { partnerSalutation } from '@/lib/documents/partnerSalutation';
import { ORDER_STATUS_LABELS } from '../quotations/quotationLabels';

/**
 * FEATURE-006 M10 — Work Order document. Owner's explicit clarification
 * (2026-08-12): Offset is the one track with a genuinely different,
 * richer internal production job-card (per-item sheet/run/numbering/
 * color/paper/binding detail — see `OffsetItemsTable` below, matching
 * the legacy system's own work-order print and PRICING_ENGINE_SPEC.md
 * §4); every other track (Digital/Boards & Signage/Other Products, or an
 * order with no `productionTrack` set at all) "مش هيبقى فيه إلا تفاصيل
 * الأوردر اللي من الشاشة الرئيسية" — just the same item list already on
 * the invoice, reusing `DocumentRenderer` exactly like `OrderDocumentPage`
 * does, no separate internal-production table invented for tracks that
 * were never asked for one.
 */
interface OffsetItemBreakdown {
  quantity?: number;
  sheetsNeeded?: number;
  printRuns?: number;
  numberingRuns?: number;
  numberingStartNumber?: number | null;
  numberingEnd?: number | null;
  colorCount?: number;
  sides?: 1 | 2;
  isNewDesign?: boolean;
  paperName?: string | null;
  contentType?: 'ORIGINAL_ONLY' | 'ORIGINAL_PLUS_COPIES';
  copies?: number | null;
  notes?: string | null;
}

function offsetBreakdown(item: OrderItem): OffsetItemBreakdown {
  return (item.breakdown as OffsetItemBreakdown | null) ?? {};
}

function OffsetItemsTable({ items }: { items: OrderItem[] }) {
  return (
    <table className="mb-6 w-full border-collapse text-xs">
      <thead>
        <tr className="border-border border-b text-start">
          <th className="p-1.5 text-start">الصنف</th>
          <th className="p-1.5 text-start">المقاس</th>
          <th className="p-1.5 text-end">الكمية</th>
          <th className="p-1.5 text-end">عدد الألوان</th>
          <th className="p-1.5 text-start">الأوجه</th>
          <th className="p-1.5 text-start">نوع الورق</th>
          <th className="p-1.5 text-end">أفرخ الورق</th>
          <th className="p-1.5 text-end">التراجات</th>
          <th className="p-1.5 text-start">الترقيم</th>
          <th className="p-1.5 text-start">التصميم</th>
          <th className="p-1.5 text-start">ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const b = offsetBreakdown(item);
          const numbering =
            b.numberingStartNumber != null
              ? `من ${b.numberingStartNumber} إلى ${b.numberingEnd ?? '—'}${b.numberingRuns ? ` (${b.numberingRuns} تراج)` : ''}`
              : 'بدون';
          return (
            <tr key={item.id} className="border-border border-b align-top">
              <td className="p-1.5">{item.modelName ?? item.kind ?? '—'}</td>
              <td className="p-1.5">{item.realSizeLabel ?? '—'}</td>
              <td className="p-1.5 text-end">
                <span dir="ltr">{b.quantity ?? '—'}</span>
              </td>
              <td className="p-1.5 text-end">
                <span dir="ltr">{b.colorCount ?? '—'}</span>
              </td>
              <td className="p-1.5">{b.sides === 2 ? 'وجهين' : b.sides === 1 ? 'وجه واحد' : '—'}</td>
              <td className="p-1.5">{b.paperName ?? '—'}</td>
              <td className="p-1.5 text-end">
                <span dir="ltr">{b.sheetsNeeded ?? '—'}</span>
              </td>
              <td className="p-1.5 text-end">
                <span dir="ltr">{b.printRuns ?? '—'}</span>
              </td>
              <td className="p-1.5">{numbering}</td>
              <td className="p-1.5">{b.isNewDesign ? 'جديد' : 'جاهز'}</td>
              <td className="p-1.5">{b.notes ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function WorkOrderDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<WorkOrder>(`/api/work-orders/${id}`)
      .then((wo) => {
        setWorkOrder(wo);
        return apiGet<Order>(`/api/orders/${wo.orderId}`);
      })
      .then((o) => {
        setOrder(o);
        return Promise.all([
          apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<User[]>('/api/users').catch(() => []),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
        ]);
      })
      .then(([p, b, s, br]) => {
        setPartner(p);
        setBusiness(b);
        setStaff(s);
        setBranches(br);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل أمر الشغل'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!workOrder || !order || !partner || !business) {
    return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  }

  const responsibleStaff = staff.find((s) => s.id === order.staffId)?.name ?? '—';
  const qrData = encodeURIComponent(`WorkOrder:${workOrder.workOrderNumber}|Client:${partner.nameAr}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;
  // FEATURE-007 (2026-08-12) — the issuing branch's own identity wins over the global one.
  const branch = branches.find((b) => b.id === order.branchId);
  const effectiveLogoUrl = branch?.logoUrl || business.logoUrl;
  const effectiveName = branch?.name || business.businessNameAr;

  if (order.productionTrack !== 'OFFSET') {
    const items: DocumentRendererItem[] = order.items.map((item) => {
      const breakdown = item.breakdown as { quantity?: number; notes?: string | null } | null;
      return {
        itemType: item.kind ?? '—',
        quantity: breakdown?.quantity ?? 0,
        size: item.realSizeLabel,
        description: item.modelName,
        notes: breakdown?.notes ?? null,
      };
    });
    const snapshot = resolveDocumentSnapshot(business, null, null, branch);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl font-bold">أمر شغل {workOrder.workOrderNumber}</h1>
            <Link to="/quotations" className="text-muted-foreground text-sm hover:underline">
              العودة إلى المستندات
            </Link>
          </div>
          <Button type="button" onClick={() => window.print()}>
            طباعة أمر الشغل
          </Button>
        </div>
        <DocumentRenderer
          snapshot={snapshot}
          contactIconTheme={branch && !branch.isDefault ? 'blue-pink' : 'red'}
          documentTypeLabel="أمر شغل"
          documentNumber={workOrder.workOrderNumber}
          date={workOrder.createdAt}
          partnerName={partner.nameAr}
          partnerPhone={partner.phone}
          partnerSalutation={partnerSalutation(partner)}
          items={items}
          customerNotes={order.customerNotes}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">أمر شغل {workOrder.workOrderNumber}</h1>
          <Link to="/quotations" className="text-muted-foreground text-sm hover:underline">
            العودة إلى المستندات
          </Link>
        </div>
        <Button type="button" onClick={() => window.print()}>
          طباعة أمر الشغل
        </Button>
      </div>

      <div className="document-print-root bg-background text-foreground relative mx-auto max-w-4xl overflow-hidden p-8 text-sm">
        {effectiveLogoUrl && (
          <img
            src={effectiveLogoUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-[65%] max-w-[65%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06] print:opacity-[0.08]"
          />
        )}
        <header className="border-border relative mb-6 flex items-start justify-between border-b pb-4">
          <div className="text-end">
            <div className="text-lg font-bold">{effectiveName || '—'}</div>
            <div className="text-lg font-bold">أمر شغل — أوفست</div>
            <div className="text-xs">
              رقم: <span dir="ltr">{workOrder.workOrderNumber}</span>
            </div>
            <div className="text-xs">
              تاريخ الإنشاء: <span dir="ltr">{new Date(workOrder.createdAt).toLocaleDateString('ar-EG')}</span>
            </div>
            {order.deliveryDate && (
              <div className="text-xs">
                موعد التسليم: <span dir="ltr">{new Date(order.deliveryDate).toLocaleDateString('ar-EG')}</span>
              </div>
            )}
          </div>
          <div>{effectiveLogoUrl && <img src={effectiveLogoUrl} alt="" className="h-14 object-contain" />}</div>
        </header>

        <section className="relative mb-6 flex items-start justify-between">
          <div className="space-y-1">
            <div>
              <span className="text-muted-foreground text-xs">العميل: </span>
              <span className="font-medium">{partner.nameAr}</span>
            </div>
            {partner.phone && (
              <div>
                <span className="text-muted-foreground text-xs">الهاتف: </span>
                <span dir="ltr">{partner.phone}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-xs">الموظف المسؤول: </span>
              <span>{responsibleStaff}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">الحالة الحالية: </span>
              <span>{ORDER_STATUS_LABELS[order.status]}</span>
            </div>
          </div>
          <img src={qrUrl} alt="QR" width={90} height={90} />
        </section>

        <OffsetItemsTable items={order.items} />

        {order.customerNotes && (
          <section className="mb-3">
            <div className="text-muted-foreground text-xs">ملاحظات العميل</div>
            <div className="text-xs">{order.customerNotes}</div>
          </section>
        )}
        {order.internalNotes && (
          <section className="mb-3">
            <div className="text-muted-foreground text-xs">ملاحظات داخلية</div>
            <div className="text-xs">{order.internalNotes}</div>
          </section>
        )}
      </div>
    </div>
  );
}
