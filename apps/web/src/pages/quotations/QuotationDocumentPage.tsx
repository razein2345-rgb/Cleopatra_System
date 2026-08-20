import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Quotation } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { Breadcrumbs, useConfirm } from '@/components/cleopatra';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';
import { partnerSalutation } from '@/lib/documents/partnerSalutation';

/**
 * FEATURE-006 M8 — Quotation document (print). Mirrors `OrderDocumentPage`
 * exactly (same `DocumentRenderer`/`resolveDocumentSnapshot` pattern,
 * same minimal per-page data fetch) — a Quotation has no payments concept,
 * so `paymentSummary` is simply omitted rather than faked.
 */
export function QuotationDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<Quotation>(`/api/quotations/${id}`)
      .then((q) => {
        setQuotation(q);
        return Promise.all([
          // Owner (2026-08-20, "فاتورة بدون إسم العميل") — a walk-in/cash
          // quotation has no BusinessPartner to fetch.
          q.partnerId ? apiGet<BusinessPartner>(`/api/partners/${q.partnerId}`) : Promise.resolve(null),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
        ]);
      })
      .then(([p, b, br]) => {
        setPartner(p);
        setBusiness(b);
        setBranches(br);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل عرض السعر'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!quotation || !business) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  /**
   * Owner (2026-08-17, "تتبع العدد بس، من غير منع") — visibility-only
   * counter, never blocks the print itself. Fired alongside `window.print()`,
   * not awaited before it — a failed count-increment must never stop a
   * real print.
   */
  const printQuotation = () => {
    window.print();
    void apiPost(`/api/quotations/${quotation.id}/record-print`, {})
      .then((updated) => setQuotation(updated as Quotation))
      .catch(() => {});
  };

  // Mirrors WorkOrderDocumentPage.tsx's removeWorkOrder exactly (confirm → delete → leave).
  const removeQuotation = async () => {
    if (
      !(await confirm({
        title: `حذف عرض السعر ${quotation.quotationNumber}؟`,
        description: 'لا يمكن التراجع عن هذا الإجراء.',
        destructive: true,
      }))
    )
      return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/quotations/${quotation.id}`);
      navigate('/quotations');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'تعذر حذف عرض السعر');
      setDeleting(false);
    }
  };

  const exportPdf = async () => {
    setDeleteError(null);
    setExportingPdf(true);
    try {
      await downloadDocumentAsPdf(`عرض سعر ${quotation.quotationNumber}`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'تعذر تصدير عرض السعر كملف PDF');
    } finally {
      setExportingPdf(false);
    }
  };

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
  // owner (2026-08-13): "التوقيع... والسيريل نمبر... حابب كل التفاصيل دي تكون داخليه" — an explicit one-time override on top of the default template config, exactly what this `overrides` param exists for.
  const snapshot = resolveDocumentSnapshot(business, null, { showSignatureArea: business.showQuotationSignatureArea }, branch);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Breadcrumbs
            items={[
              { label: 'المستندات', to: '/quotations' },
              ...(partner ? [{ label: partner.nameAr, to: `/partners/${quotation.partnerId}` }] : []),
              { label: `عرض سعر ${quotation.quotationNumber}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <h1 className="text-xl font-bold">عرض سعر {quotation.quotationNumber}</h1>
            {quotation.convertedOrderId && (
              <Link to={`/orders/${quotation.convertedOrderId}`} className="text-primary hover:underline">
                الفاتورة الناتجة
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('quotations.edit') && (
            <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editQuotation=${quotation.id}`)}>
              تعديل
            </Button>
          )}
          {can('quotations.delete') && (
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void removeQuotation()}>
              {deleting ? 'جارٍ الحذف…' : 'حذف عرض السعر'}
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={exportingPdf} onClick={() => void exportPdf()}>
            {exportingPdf ? 'جارٍ التصدير…' : 'تنزيل PDF'}
          </Button>
          <Button type="button" onClick={printQuotation}>
            طباعة عرض السعر
          </Button>
        </div>
      </div>
      {deleteError && <p className="text-destructive text-sm print:hidden">{deleteError}</p>}
      {quotation.printCount > 0 && (
        <p className="text-muted-foreground text-xs print:hidden">
          {quotation.printCount === 1 ? 'اتطبع مرة واحدة' : `اتطبع ${quotation.printCount} مرات`}
        </p>
      )}

      <DocumentRenderer
        snapshot={snapshot}
        logoSizeCm={3.5}
        contactIconTheme={branch && !branch.isDefault ? 'blue-pink' : 'red'}
        showDate={business.showQuotationDate}
        showDocumentNumber={business.showQuotationDocumentNumber}
        documentTypeLabel="عرض سعر"
        documentNumber={quotation.quotationNumber}
        date={quotation.date}
        partnerName={partner ? partner.nameAr : 'عميل'}
        partnerPhone={partner?.phone}
        partnerSalutation={partner ? partnerSalutation(partner) : ''}
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
