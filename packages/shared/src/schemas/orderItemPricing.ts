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

/**
 * Owner (2026-08-17, "عايز أقدر أعدل سعر الزنك وتراج الطبع وترقيم
 * والتصميم من واجهة الطلبات... ساعات بحتاج أغير لما احب أحسب مناقصة",
 * same-day refinement: "يكون بيحط سعر الزنكاية الواحدة، سعر تراج الطباعة
 * الواحد") — `zincPriceOverride`/`printRunPriceOverride` replace the
 * PER-UNIT price (colorCount/printRuns still multiply it, same as the
 * automatic path), not a pre-multiplied total — less error-prone than
 * requiring the caller to compute a total by hand.
 */
const zincPrintOverrideFields = {
  zincPriceOverride: z.number().nonnegative().optional(),
  printRunPriceOverride: z.number().nonnegative().optional(),
  designCostOverride: z.number().nonnegative().optional(),
};

/**
 * Owner (2026-08-17) — only LOOSE_PAPER/NOTEBOOK have a numbering concept
 * at all. `numberingRunPriceOverride` (renamed 2026-08-25, owner: "عايز
 * لما احب احط سعر الترقيم غير سعر الديفولت يكون سعر الترقيم للتراج
 * الواحد مش سعر الترقيم الكلي") replaces the PER-RUN price, same shape as
 * `zincPriceOverride`/`printRunPriceOverride` above — was a total-
 * replacing `numberingCostOverride` before this.
 */
const numberingOverrideFields = {
  numberingRunPriceOverride: z.number().nonnegative().optional(),
};

/** Owner (2026-08-17, "أقدر أغير الهالك... الديفولت اللي هو فرخين") — replaces `settings.wasteSheetsDefault` for this item only; only the sheet-tiered kinds (LOOSE_PAPER/NOTEBOOK/FOLDER) have a waste-sheets concept. */
const wasteSheetsOverrideFields = {
  wasteSheetsOverride: z.number().int().nonnegative().optional(),
};

/**
 * Owner (2026-08-17, "عايز انا اللي اقولك مقاس الطباعة... وتحسب بناءا
 * عليه عدد الأفرخ وكذلك عدد التراجات") — manual print-size override,
 * replacing the automatic tiering-group threshold selection for this item
 * only; must be one of the same size family's real-size labels. Every
 * sheet-tiered kind (LOOSE_PAPER/NOTEBOOK/FOLDER) has this concept.
 */
const calcSizeOverrideFields = {
  calcSizeOverride: z.string().trim().min(1).optional(),
};

/** Owner (2026-08-17, "بالنسبة للترقيم عايز بردو انا اللي اقولك مقاس الترقيم") — manual numbering-target-size override, same treatment as `calcSizeOverrideFields`; only LOOSE_PAPER/NOTEBOOK have a numbering concept at all. */
const numberingSizeOverrideFields = {
  numberingSizeOverride: z.string().trim().min(1).optional(),
};

/**
 * Manual "خدمات إضافية" amounts (owner-managed catalog — see
 * `ExtraServiceOption` — تغليف/لصق/تكسير/فورمة/whatever the owner adds).
 * Owner (2026-08-17, "عايز في الإعدادات أقدر أضيف على الخدمات الإضافية
 * خدمة") — was 4 hardcoded named fields, now a free-form array so a newly
 * added catalog option needs no schema/code change. No fixed price exists
 * for any of these anywhere in the reference docs — same treatment as
 * §3.7's riza/jarab/forma/taksir, always caller-entered per item, never a
 * stored constant. `label` is a frozen snapshot (same reasoning as
 * `OrderItem.breakdown`'s other frozen display fields) — renaming a
 * catalog option later doesn't retroactively change past orders.
 */
const extraServiceFields = {
  extraServices: z.array(z.object({ label: z.string().min(1), amount: z.number().nonnegative() })).optional(),
};

export const loosePaperPricingInputSchema = z.object({
  kind: z.literal('LOOSE_PAPER'),
  ...sheetJobFields,
  quantity: z.number().int().positive(),
  sides: z.union([z.literal(1), z.literal(2)]),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...numberingOverrideFields,
  ...wasteSheetsOverrideFields,
  ...calcSizeOverrideFields,
  ...numberingSizeOverrideFields,
  ...extraServiceFields,
});

/**
 * Multi-material notebooks (2026-08-17, owner-approved — CLAUDE.md rule 4).
 * `inventoryItemId` (from `sheetJobFields` above) stays required and is
 * always the "original" page's material, exactly as before. `materials` is
 * an optional override supplying a different, independently-chosen material
 * per copy (owner: "هختار نوع الورق لكل نسخة في الدفتر" — no fixed "first/
 * middle/last" naming) — `role` is `COPY_1`..`COPY_${copies}`, 1-indexed. A
 * copy with no matching override entry just uses the original's paper.
 * Omitted entirely (the common case) means "same paper as the original for
 * every copy", byte-identical to today's single-material behavior.
 */
const notebookMaterialOverrideSchema = z.object({
  role: z.string().regex(/^COPY_[1-9]\d*$/),
  inventoryItemId: z.string().uuid(),
});

/**
 * Owner (2026-08-17, "عايز اقدر أعدل على عدد الورق الداخلي للدفتر...
 * ممكن يكون 100 للأصل و100 للصورة... ممكن يكون 50 أصل فقط") — manual
 * override of the per-notebook page counts, replacing the fixed
 * 100/50-page defaults `calculateNotebookCost` otherwise assumes.
 */
const notebookPageCountOverrideFields = {
  originalPagesOverride: z.number().int().positive().optional(),
  copyPagesOverride: z.number().int().positive().optional(),
};

export const notebookPricingInputSchema = z.object({
  kind: z.literal('NOTEBOOK'),
  ...sheetJobFields,
  notebookQuantity: z.number().int().positive(),
  contentType: z.enum(['ORIGINAL_ONLY', 'ORIGINAL_PLUS_COPIES']),
  copies: z.number().int().nonnegative().optional(),
  bindingPricePerNotebook: z.number().nonnegative(),
  materials: z.array(notebookMaterialOverrideSchema).max(20).optional(),
  ...marginOverrideFields,
  ...zincPrintOverrideFields,
  ...numberingOverrideFields,
  ...wasteSheetsOverrideFields,
  ...calcSizeOverrideFields,
  ...numberingSizeOverrideFields,
  ...notebookPageCountOverrideFields,
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
  ...wasteSheetsOverrideFields,
  ...calcSizeOverrideFields,
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

/** Owner (2026-08-20) — which digital machine/print-basis a component uses. `QUARTER` is the pre-existing Yield-packed quarter-sheet machine; `A4_DIRECT`/`A3_DIRECT` are a separate machine that prints plain A4/A3 sheets directly, no packing (typically a book's "الداخلي"/interior pages). */
export const digitalPrintBasisSchema = z.enum(['QUARTER', 'A4_DIRECT', 'A3_DIRECT']);
/** Owner (2026-08-20, "الألوان مقابل الأبيض والأسود — سعرين منفصلين") — picks which of the two fully independent price tables applies. */
export const digitalColorModeSchema = z.enum(['COLOR', 'BW']);
/** Owner (2026-08-20, "سعر للطباعة وجه، وسعر للطباعة وجه وظهر") — same treatment as color, a fully independent price table per side-count. */
export const digitalSidesSchema = z.enum(['SINGLE', 'DOUBLE']);

/**
 * Multi-component digital items (2026-08-17, owner-approved — CLAUDE.md
 * rule 3; extended 2026-08-20 with `printBasis`/`colorMode`/`sides` and
 * quantity-tiered pricing, also owner-approved — see
 * `digitalCostCalculation.ts`'s own doc comment for the full formula).
 * Every digital item is a list of one or more named components (`label`,
 * e.g. "الغلاف"/"الداخلي" for a magazine, or just one entry for a plain
 * digital item), each priced fully independently (own size/machine/
 * material). Replacing the component fields outright on both the 2026-08-17
 * and 2026-08-20 changes is safe here specifically because no live Order/
 * Quotation data exists in this shape (re-verified empty right before this
 * change) — see NOTEBOOK above for the pattern used where backward
 * compatibility with existing rows actually mattered.
 */
const digitalComponentSchema = z.object({
  label: z.string().trim().min(1).max(100),
  inventoryItemId: z.string().uuid(),
  printBasis: digitalPrintBasisSchema,
  colorMode: digitalColorModeSchema,
  sides: digitalSidesSchema,
  pieceWidthCm: z.number().positive(),
  pieceHeightCm: z.number().positive(),
  quantity: z.number().int().positive(),
  /** "Yield" — only meaningful for `printBasis: 'QUARTER'` (Pre-Press-adjustable, auto-suggested client-side then submitted as a plain number, never recomputed server-side); ignored for A4_DIRECT/A3_DIRECT, where one copy is always exactly one whole sheet. */
  yieldPerQuarter: z.number().int().positive().optional(),
  /** Only meaningful for `printBasis: 'QUARTER'` — not offered for the direct-sheet machine. */
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

/**
 * Owner (2026-08-20, "اقدر ازود على الفاتورة حركة اكتبها يدوي زي حركات
 * الخزينة") — a free-text line with a manually-typed price, no pricing
 * formula behind it at all (the manual amount *is* the total, same "no
 * calculation, just what the caller typed" discipline `extraServiceFields`
 * already uses elsewhere — this is that same idea promoted to a full line
 * item instead of an add-on to one). `itemType` (the parent `OrderItem`
 * field every kind already has) is the line's own label — no separate
 * description field needed here.
 */
export const manualPricingInputSchema = z.object({
  kind: z.literal('MANUAL'),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
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
  manualPricingInputSchema,
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
export type ManualPricingInput = z.infer<typeof manualPricingInputSchema>;
export type OrderItemPricingInput = z.infer<typeof orderItemPricingInputSchema>;
