import { z } from 'zod';

/**
 * FEATURE-007 PE-E — one structured input per item kind, matching the six
 * kinds `pricing/costCalculation.ts`, `pricing/boardsCostCalculation.ts`,
 * and `pricing/productCostCalculation.ts` already compute. The service
 * layer is the only place these get dispatched and priced — this schema
 * only validates shape, never computes a total itself (never trust a
 * client-supplied price).
 */

const sheetJobFields = {
  sizeFamilyKey: z.string().trim().min(1),
  realSizeLabel: z.string().trim().min(1),
  inventoryItemId: z.string().uuid(),
  colorCount: z.number().int().positive(),
  isNewDesign: z.boolean(),
  /** Presence enables numbering; the run count/cost/end-number are all computed server-side. */
  numberingStartNumber: z.number().int().positive().optional(),
};

/**
 * FEATURE-007 — owner-approved manual overrides (2026-08-10, see
 * PRICING_ENGINE_SPEC.md §4's amendment for the full rationale — this is a
 * confirmed exception to "server is always the sole source of price",
 * scoped narrowly to these fields only).
 */
const marginOverrideFields = {
  profitPercentOverride: z.number().min(0).max(100).optional(),
};

const zincPrintOverrideFields = {
  zincCostOverride: z.number().nonnegative().optional(),
  printCostOverride: z.number().nonnegative().optional(),
};

/**
 * Manual "خدمات إضافية" amounts — تكيس/لاصق بنطة واحدة/لاصق 2 بنطة/نموذج.
 * No fixed price exists for any of these anywhere in the reference docs,
 * so — same treatment as §3.7's riza/jarab/forma/taksir — they're always
 * caller-entered per item, never a stored constant.
 */
const extraServiceFields = {
  baggingAmount: z.number().nonnegative().optional(),
  singleAdhesiveAmount: z.number().nonnegative().optional(),
  doubleAdhesiveAmount: z.number().nonnegative().optional(),
  sampleAmount: z.number().nonnegative().optional(),
};

export const loosePaperPricingInputSchema = z.object({
  kind: z.literal('LOOSE_PAPER'),
  ...sheetJobFields,
  quantity: z.number().int().positive(),
  sides: z.union([z.literal(1), z.literal(2)]),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...extraServiceFields,
});

export const notebookPricingInputSchema = z.object({
  kind: z.literal('NOTEBOOK'),
  ...sheetJobFields,
  notebookQuantity: z.number().int().positive(),
  contentType: z.enum(['ORIGINAL_ONLY', 'ORIGINAL_PLUS_COPIES']),
  copies: z.number().int().nonnegative().optional(),
  bindingPricePerNotebook: z.number().nonnegative(),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...extraServiceFields,
});

export const envelopePricingInputSchema = z.object({
  kind: z.literal('ENVELOPE'),
  quantity: z.number().int().positive(),
  colorCount: z.number().int().positive(),
  isNewDesign: z.boolean(),
  /** "سعر الظرف الجاهز للقطعة" — supplier price at the time, entered per order, never a stored constant. */
  readyEnvelopePricePerPiece: z.number().nonnegative(),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...extraServiceFields,
});

export const folderPricingInputSchema = z.object({
  kind: z.literal('FOLDER'),
  sizeFamilyKey: z.string().trim().min(1),
  realSizeLabel: z.string().trim().min(1),
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  colorCount: z.number().int().positive(),
  sides: z.union([z.literal(1), z.literal(2)]),
  isNewDesign: z.boolean(),
  sellophaneEnabled: z.boolean(),
  riza: z.number().nonnegative().optional(),
  jarab: z.number().nonnegative().optional(),
  forma: z.number().nonnegative().optional(),
  taksir: z.number().nonnegative().optional(),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...extraServiceFields,
});

export const boardMaterialSchema = z.enum(['BANNER', 'VINYL_NORMAL', 'VINYL_PRINT_CUT', 'FLEX', 'SEASRO']);

export const boardsPricingInputSchema = z.object({
  kind: z.literal('BOARDS'),
  material: boardMaterialSchema,
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  quantity: z.number().int().positive(),
  hasDesign: z.boolean().optional(),
  hasSellophane: z.boolean().optional(),
  ...extraServiceFields,
});

/** Product/service: no size/cost inputs at all — `readyProductId`/`serviceId` on the parent item schema say which catalog row supplies the unit price. */
export const productOrServicePricingInputSchema = z.object({
  kind: z.enum(['PRODUCT', 'SERVICE']),
  quantity: z.number().int().positive(),
  ...extraServiceFields,
});

export const orderItemPricingInputSchema = z.discriminatedUnion('kind', [
  loosePaperPricingInputSchema,
  notebookPricingInputSchema,
  envelopePricingInputSchema,
  folderPricingInputSchema,
  boardsPricingInputSchema,
  productOrServicePricingInputSchema,
]);

// `BoardMaterial` itself is exported from `pricing/boardsCostCalculation.js`
// (the type this schema validates against) — not re-exported here to avoid
// a duplicate-name collision at the package's `index.ts` barrel.
export type LoosePaperPricingInput = z.infer<typeof loosePaperPricingInputSchema>;
export type NotebookPricingInput = z.infer<typeof notebookPricingInputSchema>;
export type EnvelopePricingInput = z.infer<typeof envelopePricingInputSchema>;
export type FolderPricingInput = z.infer<typeof folderPricingInputSchema>;
export type BoardsPricingInput = z.infer<typeof boardsPricingInputSchema>;
export type ProductOrServicePricingInput = z.infer<typeof productOrServicePricingInputSchema>;
export type OrderItemPricingInput = z.infer<typeof orderItemPricingInputSchema>;
