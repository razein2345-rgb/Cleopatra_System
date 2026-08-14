import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Order, User } from '@cleopatra/shared';
import { apiDelete, apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';
import { partnerSalutation } from '@/lib/documents/partnerSalutation';
import { useAuth } from '@/state/AuthContext';

/**
 * FEATURE-006 M9 / FEATURE-007 — the first page that actually mounts
 * `DocumentRenderer` and calls `window.print()` (M7 built the renderer +
 * print CSS but never wired either into a real page). No template
 * picker/override editor yet (M9's fuller scope) — this is the minimum
 * for "اطبع الفاتورة" to actually work: real order data, real business
 * identity, the default template config.
 *
 * FEATURE-007 (2026-08-12) — "تعديل"/"حذف" (owner: "أقدر افتح... واعدل
 * فيها او احذفهم"). Edit routes to the unified creation screen in edit
 * mode (`/orders/new?editOrder=:id`, full item replacement); delete calls
 * the guarded `deleteOrder` service (blocked server-side if the invoice
 * has payments or a Work Order — see its own doc comment).
 */
export function OrderDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<Order>(`/api/orders/${id}`)
      .then((o) => {
        setOrder(o);
        return Promise.all([
          apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
          apiGet<User[]>('/api/users').catch(() => []),
        ]);
      })
      .then(([p, b, br, s]) => {
        setPartner(p);
        setBusiness(b);
        setBranches(br);
        setStaff(s);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الفاتورة'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!order || !partner || !business) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const removeOrder = async () => {
    if (!confirm(`حذف الفاتورة ${order.invoiceNumber}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/orders/${order.id}`);
      navigate('/quotations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الفاتورة');
      setDeleting(false);
    }
  };

  const items: DocumentRendererItem[] = order.items.map((item) => {
    const breakdown = item.breakdown as { quantity?: number; notes?: string | null } | null;
    return {
      itemType: item.kind ?? '—',
      quantity: breakdown?.quantity ?? 0,
      size: item.realSizeLabel,
      description: item.modelName,
      notes: breakdown?.notes ?? null,
      lineTotal: item.itemTotal,
    };
  });

  const branch = branches.find((b) => b.id === order.branchId);
  // Owner (2026-08-13): "في الفاتورة مش عايز يظهر فيها العنوان والرقم
  // الأرضي والإيميل ورقم التليفون وصفحة الفيس إلا بإختياري" — Invoice has
  // no template, so these owner-configured toggles apply as a one-time
  // override on top of the (address/phone/email true, landline/facebook
  // true) template defaults, exactly like Quotation's showSignatureArea
  // override above.
  const snapshot = resolveDocumentSnapshot(
    business,
    null,
    {
      showBusinessAddress: business.showInvoiceAddress,
      showBusinessPhone: business.showInvoicePhone,
      showBusinessEmail: business.showInvoiceEmail,
      showBusinessLandline: business.showInvoiceLandline,
      showBusinessFacebook: business.showInvoiceFacebook,
    },
    branch,
  );
  const createdByName = staff.find((s) => s.id === order.staffId)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-xl font-bold">فاتورة {order.invoiceNumber}</h1>
          <Link to="/quotations" className="text-muted-foreground text-sm hover:underline">
            العودة إلى المستندات
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('orders.edit') && (
            <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editOrder=${order.id}`)}>
              تعديل الفاتورة
            </Button>
          )}
          {can('orders.delete') && (
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void removeOrder()}>
              {deleting ? 'جارٍ الحذف…' : 'حذف الفاتورة'}
            </Button>
          )}
          {order.workOrderId && (
            <Button type="button" variant="secondary" onClick={() => navigate(`/work-orders/${order.workOrderId}`)}>
              طباعة أمر الشغل
            </Button>
          )}
          <Button type="button" onClick={() => window.print()}>
            طباعة الفاتورة
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm print:hidden">{error}</p>}

      <DocumentRenderer
        snapshot={snapshot}
        showBranding={false}
        contactIconTheme={branch && !branch.isDefault ? 'blue-pink' : 'red'}
        hideCustomerSignature
        showStamp={business.showStampOnInvoice}
        createdByName={createdByName}
        documentTypeLabel="فاتورة"
        documentNumber={order.invoiceNumber}
        date={order.date}
        partnerName={partner.nameAr}
        partnerPhone={partner.phone}
        partnerSalutation={partnerSalutation(partner)}
        items={items}
        totals={{
          subtotal: order.subtotal,
          discountPercent: order.discountPercent,
          vatOn: order.vatOn,
          vatAmount: order.vatAmount,
          finalTotal: order.finalTotal,
        }}
        paymentSummary={{ paidTotal: order.paidTotal, remainingBalance: order.remainingBalance }}
        customerNotes={order.customerNotes}
        deliveryDate={order.deliveryDate}
      />
    </div>
  );
}
