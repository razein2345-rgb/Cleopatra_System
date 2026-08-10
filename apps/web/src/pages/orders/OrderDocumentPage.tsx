import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BusinessIdentity, BusinessPartner, Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';

/**
 * FEATURE-006 M9 / FEATURE-007 — the first page that actually mounts
 * `DocumentRenderer` and calls `window.print()` (M7 built the renderer +
 * print CSS but never wired either into a real page). No template
 * picker/override editor yet (M9's fuller scope) — this is the minimum
 * for "اطبع الفاتورة" to actually work: real order data, real business
 * identity, the default template config.
 */
export function OrderDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<Order>(`/api/orders/${id}`)
      .then((o) => {
        setOrder(o);
        return Promise.all([
          apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
        ]);
      })
      .then(([p, b]) => {
        setPartner(p);
        setBusiness(b);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الفاتورة'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!order || !partner || !business) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const items: DocumentRendererItem[] = order.items.map((item) => {
    const breakdown = item.breakdown as { quantity?: number } | null;
    return {
      itemType: item.kind ?? '—',
      quantity: breakdown?.quantity ?? 0,
      size: item.realSizeLabel,
      description: item.modelName,
      notes: null,
    };
  });

  const snapshot = resolveDocumentSnapshot(business, null, null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">فاتورة {order.invoiceNumber}</h1>
          <Link to="/quotations" className="text-muted-foreground text-sm hover:underline">
            العودة إلى المستندات
          </Link>
        </div>
        <Button type="button" onClick={() => window.print()}>
          طباعة الفاتورة
        </Button>
      </div>

      <DocumentRenderer
        snapshot={snapshot}
        documentTypeLabel="فاتورة"
        documentNumber={order.invoiceNumber}
        date={order.date}
        partnerName={partner.nameAr}
        partnerPhone={partner.phone}
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
      />
    </div>
  );
}
