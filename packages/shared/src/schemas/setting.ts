import { z } from 'zod';

// Field list mirrors legacy DEFAULT_SETTINGS exactly (LEGACY_ANALYSIS §4).
// Do not add/remove/rename fields without cross-checking the legacy file.
export const settingSchema = z.object({
  id: z.string().uuid(),
  zincPrice: z.number(),
  printRunPrice: z.number(),
  numberingRunPrice: z.number(),
  envelopeDesignPrice: z.number(),
  envelopePrintRunPrice: z.number(),
  envelopeZincPrice: z.number(),
  designPrice: z.number(),
  wasteSheetsDefault: z.number().int(),
  profitPercent: z.number(),
  // FEATURE-007 PE-E — VAT percentage applied when the vatOn toggle is on.
  vatRate: z.number(),
  notebookThreshold: z.number().int(),
  looseThreshold: z.number().int(),
  sellophanePricePerSheet: z.number(),
  logoUrl: z.string().nullable(),
  boardsBannerNoDesign: z.number(),
  boardsBannerWithDesign: z.number(),
  boardsVinylPrintCutNoSello: z.number(),
  boardsVinylPrintCutWithSello: z.number(),
  boardsVinylNormalNoSello: z.number(),
  boardsVinylNormalWithSello: z.number(),
  boardsFlex: z.number(),
  boardsSeasro: z.number(),
  boardsGapMM: z.number(),

  // system_specifications_v2.md §13.3 — Digital printing Yield-based costing.
  digitalPrintPricePerQuarter: z.number(),
  digitalSellophanePricePerQuarter: z.number(),
  digitalQuarterWidthCm: z.number(),
  digitalQuarterHeightCm: z.number(),

  // FEATURE-006 — business identity for document headers. Nullable/
  // additive; logoUrl above is reused as-is (no upload endpoint exists in
  // this codebase — confirmed by inspection — so this stays a plain URL
  // field, not a file upload).
  businessNameAr: z.string().nullable(),
  businessNameEn: z.string().nullable(),
  // FEATURE-007 (2026-08-12) — short tagline under the business name on
  // documents (e.g. "للدعاية والإعلان"), and the company stamp/seal image
  // printed above the closing line.
  businessTagline: z.string().nullable(),
  stampUrl: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  taxNumber: z.string().nullable(),
  commercialRegisterNumber: z.string().nullable(),
  // FEATURE-007 (2026-08-12) — landline (separate from `phone`, the
  // mobile/WhatsApp-style number) and Facebook page link, shown in the
  // document footer.
  landlinePhone: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  // FEATURE-007 (2026-08-12, owner: "الختم المفروض اكون مخير إنه يظهر في
  // الفاتورة ولا لا") — whether the stamp prints on the Invoice
  // specifically (Quotation/Work Order always show it when uploaded).
  showStampOnInvoice: z.boolean(),
  // FEATURE-007 (2026-08-12, owner: "عايز اوبشن في عرض السعر إني اشيل
  // التاريخ خالص او يكون موجود") — whether the quotation's own issue
  // date prints at all.
  showQuotationDate: z.boolean(),
  // FEATURE-007 (2026-08-13, owner: "التوقيع... والسيريل نمبر بتاع العرض
  // حابب كل التفاصيل دي تكون داخليه متظهرش على العرض اللي هيتطبع
  // للعميل") — off by default: internal-only details, not printed.
  showQuotationSignatureArea: z.boolean(),
  showQuotationDocumentNumber: z.boolean(),
  // FEATURE-008 (2026-08-13, owner: "في الفاتورة مش عايز يظهر فيها العنوان
  // والرقم الأرضي والإيميل ورقم التليفون وصفحة الفيس إلا بإختياري") — off
  // by default, each independently toggleable, Invoice-specific (Quotation/
  // Work Order keep showing these per their own template config, unaffected).
  showInvoiceAddress: z.boolean(),
  showInvoicePhone: z.boolean(),
  showInvoiceEmail: z.boolean(),
  showInvoiceLandline: z.boolean(),
  showInvoiceFacebook: z.boolean(),
  // Owner (2026-08-23, "ان احدد وقت لما يجي الحساب بيتقفل دايركت") — a
  // single global "HH:MM" (24h) time; null = the auto-close feature is
  // off (the default). See autoCloseDayJob.ts.
  autoCloseDayTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت لازم يكون بصيغة HH:MM')
    .nullable(),
  // Device Access Control (2026-08-24) — "ALLOW_ALL_REGISTERED" (a new
  // device auto-activates on first sight) or "ONLY_APPROVED" (a new
  // device starts PENDING until SUPER_ADMIN approves it). See
  // `requireAuth.ts`/`deviceService.ts` and the Devices settings screen.
  deviceAccessMode: z.enum(['ALLOW_ALL_REGISTERED', 'ONLY_APPROVED']),
});

export const updateSettingSchema = settingSchema.omit({ id: true }).partial();

/**
 * FEATURE-007 — the narrow slice of `Setting` a printed document's letterhead
 * needs (`resolveDocumentSnapshot`'s `business` object). Exposed via its own
 * `orders.view`-gated endpoint rather than the full `settings.view`-gated
 * `/api/settings` — reception/sales staff who print invoices don't hold
 * `settings.view` (see seed.ts's SALES role), same reasoning as
 * `pricingReference.ts`.
 */
export const businessIdentitySchema = settingSchema.pick({
  businessNameAr: true,
  businessNameEn: true,
  businessTagline: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  taxNumber: true,
  commercialRegisterNumber: true,
  logoUrl: true,
  stampUrl: true,
  landlinePhone: true,
  facebookUrl: true,
  showStampOnInvoice: true,
  showQuotationDate: true,
  showQuotationSignatureArea: true,
  showQuotationDocumentNumber: true,
  showInvoiceAddress: true,
  showInvoicePhone: true,
  showInvoiceEmail: true,
  showInvoiceLandline: true,
  showInvoiceFacebook: true,
});

export type Setting = z.infer<typeof settingSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type BusinessIdentity = z.infer<typeof businessIdentitySchema>;
