import { z } from 'zod';
import { sizeFamilySchema } from './sizeFamily.js';

/**
 * FEATURE-007 PE-E — everything the client-side pricing engine
 * (`packages/shared/src/pricing/*`) needs to compute a live preview in
 * `NewOrderPage.tsx` before submitting, matching PRICING_ENGINE_SPEC.md
 * §5's "كل الحسابات المالية تُحسب لحظيًا في الواجهة". Deliberately a
 * narrower shape than the full `Setting` row (no business identity/tax
 * fields) so it can be gated on `orders.create` rather than
 * `settings.view` — reception/sales staff can price an order without
 * needing Settings access.
 */
export const pricingConstantsSchema = z.object({
  notebookThreshold: z.number().int(),
  looseThreshold: z.number().int(),
  wasteSheetsDefault: z.number().int(),
  zincPrice: z.number(),
  printRunPrice: z.number(),
  numberingRunPrice: z.number(),
  designPrice: z.number(),
  profitPercent: z.number(),
  envelopeDesignPrice: z.number(),
  envelopeZincPrice: z.number(),
  envelopePrintRunPrice: z.number(),
  sellophanePricePerSheet: z.number(),
});

export const boardsPricingConstantsSchema = z.object({
  boardsBannerNoDesign: z.number(),
  boardsBannerWithDesign: z.number(),
  boardsVinylNormalNoSello: z.number(),
  boardsVinylNormalWithSello: z.number(),
  boardsVinylPrintCutNoSello: z.number(),
  boardsVinylPrintCutWithSello: z.number(),
  boardsFlex: z.number(),
  boardsSeasro: z.number(),
  boardsGapMM: z.number(),
});

export const digitalPricingConstantsSchema = z.object({
  digitalPrintPricePerQuarter: z.number(),
  digitalSellophanePricePerQuarter: z.number(),
  digitalQuarterWidthCm: z.number(),
  digitalQuarterHeightCm: z.number(),
  profitPercent: z.number(),
  wasteSheetsDefault: z.number().int(),
});

export const pricingReferenceSchema = z.object({
  pricingConstants: pricingConstantsSchema,
  boardsConstants: boardsPricingConstantsSchema,
  digitalConstants: digitalPricingConstantsSchema,
  vatRate: z.number(),
  sizeFamilies: z.array(sizeFamilySchema),
});

export type PricingConstantsDto = z.infer<typeof pricingConstantsSchema>;
export type BoardsPricingConstantsDto = z.infer<typeof boardsPricingConstantsSchema>;
export type DigitalPricingConstantsDto = z.infer<typeof digitalPricingConstantsSchema>;
export type PricingReference = z.infer<typeof pricingReferenceSchema>;
