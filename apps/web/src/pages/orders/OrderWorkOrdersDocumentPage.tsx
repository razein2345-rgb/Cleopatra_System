import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Order, PricingReference, User, WorkOrder } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/cleopatra';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';
import { WorkOrderPrintableBody } from './WorkOrderDocumentPage';

/**
 * Owner (2026-09-08, "عايز زرار واحد يجمع كل أوامر شغل الأوردر في PDF
 * واحد، كل واحد في صفحة كاملة") — every Work Order this Order currently
 * has ("أمر شغل مستقل لكل صنف حسب مساره", 2026-08-16, now one per item —
 * see تكملة 64), combined into a single PDF/print, each one starting a
 * fresh page (`forcePageBreakBefore`, `WorkOrderPrintableBody`'s own doc
 * comment). Reuses the exact per-track rendering `WorkOrderDocumentPage`
 * already has (rule 5 — no Duplicate Logic) — this page only adds the
 * "fetch every Work Order, stack them under one `.document-print-root`"
 * part that a single Work Order's own page never needed.
 */
export function OrderWorkOrdersDocumentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[] | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [pricingReference, setPricingReference] = useState<PricingReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    apiGet<Order>(`/api/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        return Promise.all([
          Promise.all(o.workOrders.map((wo) => apiGet<WorkOrder>(`/api/work-orders/${wo.id}`))),
          o.partnerId ? apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`) : Promise.resolve(null),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<User[]>('/api/users').catch(() => []),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
          apiGet<PricingReference>('/api/pricing-reference').catch(() => null),
          apiGet<BusinessPartner[]>('/api/partners').catch(() => []),
        ]);
      })
      .then(([wos, p, b, s, br, pr, allPartners]) => {
        setWorkOrders(wos);
        setPartner(p);
        setBusiness(b);
        setStaff(s);
        setBranches(br);
        setPricingReference(pr);
        setPartners(allPartners);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل أوامر الشغل'));
  }, [orderId]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!order || !workOrders || !business) {
    return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  }

  const exportPdf = async () => {
    setExportError(null);
    setExportingPdf(true);
    try {
      await downloadDocumentAsPdf(`أوامر شغل ${order.invoiceNumber}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'تعذر تصدير أوامر الشغل كملف PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const branch = branches.find((b) => b.id === order.branchId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Breadcrumbs
            items={[
              { label: 'المستندات', to: '/quotations' },
              ...(partner ? [{ label: partner.nameAr, to: `/partners/${order.partnerId}` }] : []),
              { label: `أوامر شغل الفاتورة ${order.invoiceNumber}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <h1 className="text-xl font-bold">أوامر شغل الفاتورة {order.invoiceNumber}</h1>
            <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
              الفاتورة الأصلية
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={exportingPdf} onClick={() => void exportPdf()}>
            {exportingPdf ? 'جارٍ التصدير…' : 'تنزيل PDF لكل أوامر الشغل'}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            طباعة كل أوامر الشغل
          </Button>
        </div>
      </div>
      {exportError && <p className="text-destructive text-sm print:hidden">{exportError}</p>}

      {workOrders.length === 0 ? (
        <div className="text-muted-foreground print:hidden">لا يوجد أي أمر شغل لهذه الفاتورة بعد.</div>
      ) : (
        <div className="document-print-root">
          {workOrders.map((workOrder, index) => (
            <WorkOrderPrintableBody
              key={workOrder.id}
              workOrder={workOrder}
              order={order}
              partner={partner}
              business={business}
              branch={branch}
              staff={staff}
              partners={partners}
              pricingReference={pricingReference}
              isPrintRoot={false}
              forcePageBreakBefore={index > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
