import type { DocumentSnapshot } from '@/lib/documents/documentSnapshot';

export interface DocumentRendererItem {
  itemType: string;
  quantity: number;
  size?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface DocumentRendererTotals {
  subtotal: number;
  discountPercent: number;
  vatOn: boolean;
  vatAmount: number;
  finalTotal: number;
}

export interface DocumentRendererPaymentSummary {
  paidTotal: number;
  remainingBalance: number;
}

export interface DocumentRendererProps {
  snapshot: DocumentSnapshot;
  documentTypeLabel: string;
  documentNumber: string;
  date: string;
  partnerName: string;
  partnerPhone?: string | null;
  items: DocumentRendererItem[];
  totals?: DocumentRendererTotals | null;
  paymentSummary?: DocumentRendererPaymentSummary | null;
  customerNotes?: string | null;
}

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * FEATURE-006 M7 — the one renderer every document type (Quotation/
 * Invoice/Work Order, M8–M10) mounts, reading an already-resolved
 * `DocumentSnapshot` (frozen or live-preview, the caller's concern, not
 * this component's). No price breakdown is invented here: `items` only
 * carries fields `01_ANALYSIS.md` confirmed exist on `QuotationItem`/
 * `OrderItem` (`itemType`/`quantity`/`size`/`description`/`notes` — no
 * `unitPrice`/`unit`), and `totals`/`paymentSummary` are optional so a
 * Work Order (which has neither) can render without fabricating them.
 * RTL is inherited from the app's global `dir="rtl"`; document numbers,
 * dates, and phone numbers use the same `dir="ltr"` span exception
 * FEATURE-005 already established for LTR-shaped data inside RTL text.
 */
export function DocumentRenderer({
  snapshot,
  documentTypeLabel,
  documentNumber,
  date,
  partnerName,
  partnerPhone,
  items,
  totals,
  paymentSummary,
  customerNotes,
}: DocumentRendererProps) {
  const { business, config } = snapshot;

  return (
    <div className="document-print-root bg-background text-foreground mx-auto max-w-3xl p-8 text-sm">
      <header className="border-border mb-6 flex items-start justify-between border-b pb-4">
        <div>
          {Boolean(config.showLogo) && business.logoUrl && (
            <img src={business.logoUrl} alt="" className="mb-2 h-14 object-contain" />
          )}
          <div className="text-lg font-bold">{business.nameAr || '—'}</div>
          {business.nameEn && <div className="text-muted-foreground text-xs">{business.nameEn}</div>}
          {Boolean(config.showBusinessAddress) && business.address && <div className="mt-1 text-xs">{business.address}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {Boolean(config.showBusinessPhone) && business.phone && (
              <span>
                هاتف: <span dir="ltr">{business.phone}</span>
              </span>
            )}
            {Boolean(config.showBusinessEmail) && business.email && <span>{business.email}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {Boolean(config.showTaxNumber) && business.taxNumber && (
              <span>
                الرقم الضريبي: <span dir="ltr">{business.taxNumber}</span>
              </span>
            )}
            {Boolean(config.showCommercialRegisterNumber) && business.commercialRegisterNumber && (
              <span>
                السجل التجاري: <span dir="ltr">{business.commercialRegisterNumber}</span>
              </span>
            )}
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-bold">{documentTypeLabel}</div>
          <div className="text-xs">
            رقم: <span dir="ltr">{documentNumber}</span>
          </div>
          <div className="text-xs">
            التاريخ: <span dir="ltr">{new Date(date).toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </header>

      {typeof config.headerNote === 'string' && config.headerNote && (
        <div className="text-muted-foreground mb-4 text-xs">{config.headerNote}</div>
      )}

      <section className="mb-6">
        <div className="text-muted-foreground text-xs">العميل</div>
        <div className="font-medium">{partnerName}</div>
        {partnerPhone && (
          <div className="text-xs">
            <span dir="ltr">{partnerPhone}</span>
          </div>
        )}
      </section>

      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-border border-b text-start">
            <th className="py-1.5 text-start">الصنف</th>
            <th className="py-1.5 text-start">المقاس</th>
            <th className="py-1.5 text-start">الوصف</th>
            <th className="py-1.5 text-end">الكمية</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-border border-b">
              <td className="py-1.5">{item.itemType}</td>
              <td className="py-1.5">{item.size || '—'}</td>
              <td className="py-1.5">{item.description || item.notes || '—'}</td>
              <td className="py-1.5 text-end">
                <span dir="ltr">{item.quantity}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totals && (
        <section className="mb-6 flex justify-end">
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الإجمالي قبل الخصم</span>
              <span dir="ltr">{money(totals.subtotal)}</span>
            </div>
            {totals.discountPercent > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">نسبة الخصم</span>
                <span dir="ltr">{totals.discountPercent}%</span>
              </div>
            )}
            {totals.vatOn && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ضريبة القيمة المضافة</span>
                <span dir="ltr">{money(totals.vatAmount)}</span>
              </div>
            )}
            <div className="border-border flex justify-between border-t pt-1 font-bold">
              <span>الإجمالي النهائي</span>
              <span dir="ltr">{money(totals.finalTotal)}</span>
            </div>
            {paymentSummary && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المدفوع</span>
                  <span dir="ltr">{money(paymentSummary.paidTotal)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>المتبقي</span>
                  <span dir="ltr">{money(paymentSummary.remainingBalance)}</span>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {customerNotes && (
        <section className="mb-4">
          <div className="text-muted-foreground text-xs">ملاحظات</div>
          <div className="text-xs">{customerNotes}</div>
        </section>
      )}

      {typeof config.termsText === 'string' && config.termsText && (
        <section className="mb-4">
          <div className="text-muted-foreground text-xs">الشروط والأحكام</div>
          <div className="whitespace-pre-line text-xs">{config.termsText}</div>
        </section>
      )}

      {Boolean(config.showSignatureArea) && (
        <section className="mt-10 grid grid-cols-2 gap-8 text-xs">
          <div className="border-border border-t pt-2">توقيع العميل</div>
          <div className="border-border border-t pt-2">توقيع المسؤول</div>
        </section>
      )}

      {typeof config.footerText === 'string' && config.footerText && (
        <footer className="border-border text-muted-foreground mt-8 border-t pt-2 text-center text-xs">
          {config.footerText}
        </footer>
      )}
    </div>
  );
}
