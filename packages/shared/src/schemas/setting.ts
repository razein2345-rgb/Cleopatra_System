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
});

export type Setting = z.infer<typeof settingSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type BusinessIdentity = z.infer<typeof businessIdentitySchema>;
