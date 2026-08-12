import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Quotation, User } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';

/**
 * FEATURE-006 M8 — Quotation document (print). Mirrors `OrderDocumentPage`
 * exactly (same `DocumentRenderer`/`resolveDocumentSnapshot` pattern,
 * same minimal per-page data fetch) — a Quotation has no payments concept,
 * so `paymentSummary` is simply omitted rather than faked.
 */
export function QuotationDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<Quotation>(`/api/quotations/${id}`)
      .then((q) => {
        setQuotation(q);
        return Promise.all([
          apiGet<BusinessPartner>(`/api/partners/${q.partnerId}`),
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل عرض السعر'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!quotation || !partner || !business) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const items: DocumentRendererItem[] = quotation.items.map((item) => {
    const breakdown = item.breakdown as { quantity?: number; notes?: string | null } | null;
    return {
      itemType: item.kind ?? item.itemType,
      quantity: breakdown?.quantity ?? 0,
      size: item.realSizeLabel,
      description: item.modelName ?? item.description,
      notes: breakdown?.notes ?? item.notes,
      lineTotal: item.itemTotal,
    };
  });

  const branch = branches.find((b) => b.id === quotation.branchId);
  const snapshot = resolveDocumentSnapshot(business, null, null, branch);
  const createdByName = staff.find((s) => s.id === quotation.staffId)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">عرض سعر {quotation.quotationNumber}</h1>
          <Link to="/quotations" className="text-muted-foreground text-sm hover:underline">
            العودة إلى المستندات
          </Link>
        </div>
        <Button type="button" onClick={() => window.print()}>
          طباعة عرض السعر
        </Button>
      </div>

      <DocumentRenderer
        snapshot={snapshot}
        createdByName={createdByName}
        documentTypeLabel="عرض سعر"
        documentNumber={quotation.quotationNumber}
        date={quotation.date}
        partnerName={partner.nameAr}
        partnerPhone={partner.phone}
        items={items}
        totals={{
          subtotal: quotation.subtotal,
          discountPercent: quotation.discountPercent,
          vatOn: quotation.vatOn,
          vatAmount: quotation.vatAmount,
          finalTotal: quotation.finalTotal,
        }}
        customerNotes={quotation.customerNotes}
      />
    </div>
  );
}
