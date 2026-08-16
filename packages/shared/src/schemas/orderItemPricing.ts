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

/**
 * Multi-material notebooks (2026-08-17, owner-approved — CLAUDE.md rule 4).
 * `inventoryItemId` (from `sheetJobFields` above) stays required and is
 * always the "original" page's material, exactly as before. `materials` is
 * an optional override supplying a different material for the copy pages —
 * omitted entirely (the common case) means "same paper as the original",
 * byte-identical to today's single-material behavior.
 */
const notebookMaterialOverrideSchema = z.object({
  role: z.enum(['COPY_1', 'COPY_2']),
  inventoryItemId: z.string().uuid(),
});

export const notebookPricingInputSchema = z.object({
  kind: z.literal('NOTEBOOK'),
  ...sheetJobFields,
  notebookQuantity: z.number().int().positive(),
  contentType: z.enum(['ORIGINAL_ONLY', 'ORIGINAL_PLUS_COPIES']),
  copies: z.number().int().nonnegative().optional(),
  bindingPricePerNotebook: z.number().nonnegative(),
  materials: z.array(notebookMaterialOverrideSchema).max(2).optional(),
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

/**
 * Multi-component digital items (2026-08-17, owner-approved — CLAUDE.md
 * rule 3). Every digital item is a list of one or more named components
 * (`label`, e.g. "الغلاف"/"الداخلي" for a magazine, or just one entry for a
 * plain digital item), each priced fully independently (own size/Yield/
 * material). Replacing the old single-material fields outright (not kept
 * alongside them) is safe here specifically because no live Order data
 * exists yet in this shape (verified empty at implementation time) — see
 * NOTEBOOK above for the pattern used where backward compatibility with
 * existing rows actually mattered.
 */
const digitalComponentSchema = z.object({
  label: z.string().trim().min(1).max(100),
  inventoryItemId: z.string().uuid(),
  pieceWidthCm: z.number().positive(),
  pieceHeightCm: z.number().positive(),
  quantity: z.number().int().positive(),
  /** "Yield" — Pre-Press-adjustable, auto-suggested client-side then submitted as a plain number; always required, never recomputed server-side. */
  yieldPerQuarter: z.number().int().positive(),
  sellophaneEnabled: z.boolean().optional(),
  /** "سعر البشر" — optional, always caller-entered per piece. */
  boshrPricePerPiece: z.number().nonnegative().optional(),
});

/** system_specifications_v2.md §13.3 — Digital printing, Yield-based. No zinc/plate cost (no plates in digital printing), so no `zincPrintOverrideFields` here — that's an Offset-only concept. */
export const digitalPricingInputSchema = z.object({
  kind: z.literal('DIGITAL'),
  components: z.array(digitalComponentSchema).min(1).max(6),
  ...marginOverrideFields,
  ...extraServiceFields,
});

/** Product/service: no size/cost inputs at all — `readyProductId`/`serviceId` on the parent item schema say which catalog row supplies the unit price. */
export const productOrServicePricingInputSchema = z.object({
  kind: z.enum(['PRODUCT', 'SERVICE']),
  quantity: z.number().int().positive(),
  ...extraServiceFields,
});

/**
 * system_specifications_v2.md (2026-08-16, owner: "مخزون جاهز عندي") —
 * held-stock ready-made merchandise (stationery, external books, ...) sold
 * directly from `InventoryItem.salePrice`, no pricing formula. Distinct
 * from `PRODUCT` (which prices off the separate, stock-untracked
 * `ReadyProduct` catalog) — this kind always deducts real stock via the
 * same generic `inventoryItemId`/`sheetsNeeded` path LOOSE_PAPER/DIGITAL
 * already use (see pricingEngineService.ts's INVENTORY_RETAIL case).
 */
export const inventoryRetailPricingInputSchema = z.object({
  kind: z.literal('INVENTORY_RETAIL'),
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  ...extraServiceFields,
});

export const orderItemPricingInputSchema = z.discriminatedUnion('kind', [
  loosePaperPricingInputSchema,
  notebookPricingInputSchema,
  envelopePricingInputSchema,
  folderPricingInputSchema,
  boardsPricingInputSchema,
  digitalPricingInputSchema,
  productOrServicePricingInputSchema,
  inventoryRetailPricingInputSchema,
]);

// `BoardMaterial` itself is exported from `pricing/boardsCostCalculation.js`
// (the type this schema validates against) — not re-exported here to avoid
// a duplicate-name collision at the package's `index.ts` barrel.
export type LoosePaperPricingInput = z.infer<typeof loosePaperPricingInputSchema>;
export type NotebookPricingInput = z.infer<typeof notebookPricingInputSchema>;
export type NotebookMaterialOverrideInput = z.infer<typeof notebookMaterialOverrideSchema>;
export type EnvelopePricingInput = z.infer<typeof envelopePricingInputSchema>;
export type FolderPricingInput = z.infer<typeof folderPricingInputSchema>;
export type BoardsPricingInput = z.infer<typeof boardsPricingInputSchema>;
export type DigitalPricingInput = z.infer<typeof digitalPricingInputSchema>;
export type DigitalComponentPricingInput = z.infer<typeof digitalComponentSchema>;
export type ProductOrServicePricingInput = z.infer<typeof productOrServicePricingInputSchema>;
export type InventoryRetailPricingInput = z.infer<typeof inventoryRetailPricingInputSchema>;
export type OrderItemPricingInput = z.infer<typeof orderItemPricingInputSchema>;
