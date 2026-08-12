import { Mail, MapPin, Phone } from 'lucide-react';
import type { DocumentSnapshot } from '@/lib/documents/documentSnapshot';

export interface DocumentRendererItem {
  itemType: string;
  quantity: number;
  size?: string | null;
  description?: string | null;
  notes?: string | null;
  /** The item's own frozen total (`OrderItem.itemTotal`/`QuotationItem.itemTotal`) — real, never invented. Omitted entirely for Work Orders (an internal production document, not a price quote). */
  lineTotal?: number | null;
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
  /** FEATURE-007 (2026-08-12, owner: "الفاتورة ميكونش فيها الإسم ولا اللوجو فقط فاتورة — اما عرض السعر وأمر الشغل فيهم إسم المكان واللوجو") — Invoice omits the business name/logo/watermark entirely; Quotation and Work Order keep them. Defaults to `true` (Quotation/Work Order's own callers don't need to think about this). */
  showBranding?: boolean;
  /** FEATURE-007 (2026-08-12, owner: "لازم يتسجل مين اللي عمل الفاتورة او عرض السعر") — the staff member's name, resolved by the caller from the document's own `staffId`. */
  createdByName?: string | null;
}

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * FEATURE-006 M7 — the one renderer every document type (Quotation/
 * Invoice/Work Order, M8–M10) mounts, reading an already-resolved
 * `DocumentSnapshot` (frozen or live-preview, the caller's concern, not
 * this component's).
 *
 * Visual design (2026-08-12, owner: "عايز شكل عرض السعر يكون شبة اللي
 * بعتهملك بالظبط") — rebuilt to match the business's real letterhead
 * ("عرض أسعار كليوباترا للدعاية والإعلان.pdf"): logo at the start, business
 * name in bold brand-red at the end, a faded logo watermark behind the
 * content, a red-headed items table, and a footer contact bar — instead
 * of the earlier plain/neutral layout. Every `config.show*`/`headerNote`/
 * `termsText`/`footerText`/`showSignatureArea` toggle from the M6 template
 * editor still applies unchanged; only where those fields render moved
 * (contact details now sit in the footer bar, matching the reference
 * letterhead, instead of stacked under the business name).
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
  showBranding = true,
  createdByName,
}: DocumentRendererProps) {
  const { business, config } = snapshot;
  const showLogo = showBranding && Boolean(config.showLogo) && business.logoUrl;
  const hasPricing = items.some((i) => typeof i.lineTotal === 'number');
  const hasContactFooter =
    (Boolean(config.showBusinessAddress) && business.address) ||
    business.email ||
    business.phone ||
    business.website;

  return (
    <div className="document-print-root bg-background text-foreground relative mx-auto max-w-3xl overflow-hidden p-8 text-sm">
      {showLogo && (
        <img
          src={business.logoUrl ?? undefined}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 max-h-[65%] max-w-[65%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06] print:opacity-[0.08]"
        />
      )}

      <div className="relative">
        {showBranding && (
          <header className="mb-6 flex items-start justify-between">
            {/* عايز اللوجو يظهر شمال والإسم يظهر يمين (owner, 2026-08-12) — الاسم أول عنصر في DOM (يمين في RTL)، اللوجو تاني عنصر (شمال). */}
            <div className="text-end">
              <div className="text-primary text-2xl font-extrabold">{business.nameAr || '—'}</div>
              {business.tagline && <div className="text-foreground/70 text-sm font-normal italic">{business.tagline}</div>}
              {business.nameEn && <div className="text-muted-foreground text-sm">{business.nameEn}</div>}
            </div>
            <div>{showLogo && <img src={business.logoUrl ?? undefined} alt="" className="h-16 object-contain" />}</div>
          </header>
        )}

        {typeof config.headerNote === 'string' && config.headerNote && (
          <div className="text-muted-foreground mb-4 text-xs">{config.headerNote}</div>
        )}

        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-primary text-lg font-bold">السادة / {partnerName}</div>
            {partnerPhone && (
              <div className="text-xs">
                <span dir="ltr">{partnerPhone}</span>
              </div>
            )}
          </div>
          <div className="text-end text-xs">
            <div>
              رقم: <span dir="ltr">{documentNumber}</span>
            </div>
            <div>
              التاريخ: <span dir="ltr">{new Date(date).toLocaleDateString('en-GB')}</span>
            </div>
            {createdByName && <div>بواسطة: {createdByName}</div>}
          </div>
        </div>

        <div className="text-primary mb-3 text-center text-xl font-bold">{documentTypeLabel}</div>
        <p className="mb-3 text-sm">نقدم لسيادتكم التفاصيل الآتي بيانها:</p>

        <table className="border-foreground/70 mb-6 w-full border-collapse border text-xs">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="border-foreground/70 border p-2">م</th>
              <th className="border-foreground/70 border p-2 text-start">البيان</th>
              {items.some((i) => i.size) && <th className="border-foreground/70 border p-2">المقاس</th>}
              <th className="border-foreground/70 border p-2">الكمية</th>
              {hasPricing && <th className="border-foreground/70 border p-2">سعر الوحدة</th>}
              {hasPricing && <th className="border-foreground/70 border p-2">الإجمالي</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const unitPrice =
                typeof item.lineTotal === 'number' && item.quantity > 0 ? item.lineTotal / item.quantity : null;
              return (
                <tr key={idx} className="even:bg-muted/30">
                  <td className="border-foreground/70 border p-2 text-center">{idx + 1}</td>
                  <td className="border-foreground/70 border p-2">
                    {item.itemType}
                    {item.description && item.description !== item.itemType ? ` — ${item.description}` : ''}
                    {item.notes ? ` (${item.notes})` : ''}
                  </td>
                  {items.some((i) => i.size) && <td className="border-foreground/70 border p-2 text-center">{item.size || '—'}</td>}
                  <td className="border-foreground/70 border p-2 text-center">
                    <span dir="ltr">{item.quantity}</span>
                  </td>
                  {hasPricing && (
                    <td className="border-foreground/70 border p-2 text-center">
                      <span dir="ltr">{unitPrice !== null ? money(unitPrice) : '—'}</span>
                    </td>
                  )}
                  {hasPricing && (
                    <td className="border-foreground/70 border p-2 text-center font-medium">
                      <span dir="ltr">{typeof item.lineTotal === 'number' ? money(item.lineTotal) : '—'}</span>
                    </td>
                  )}
                </tr>
              );
            })}
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
              <div className="border-primary/40 text-primary flex justify-between border-t pt-1 text-sm font-bold">
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

        {showBranding && business.stampUrl && <img src={business.stampUrl} alt="" className="mb-3 h-24 object-contain" />}
        <p className="mb-2 text-sm">وتفضلوا بقبول وافر الاحترام...</p>

        {Boolean(config.showSignatureArea) && (
          <section className="mt-10 grid grid-cols-2 gap-8 text-xs">
            <div className="border-border border-t pt-2">توقيع العميل</div>
            <div className="border-border border-t pt-2">توقيع المسؤول</div>
          </section>
        )}

        {typeof config.footerText === 'string' && config.footerText && (
          <p className="text-muted-foreground mt-6 text-center text-xs">{config.footerText}</p>
        )}

        {hasContactFooter && (
          <footer className="border-border mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {Boolean(config.showBusinessAddress) && business.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" /> {business.address}
                </span>
              )}
              {Boolean(config.showBusinessEmail) && business.email && (
                <span className="flex items-center gap-1">
                  <Mail className="size-3.5" /> {business.email}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {Boolean(config.showBusinessPhone) && business.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" />
                  <span dir="ltr">{business.phone}</span>
                </span>
              )}
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
          </footer>
        )}
      </div>
    </div>
  );
}
