/**
 * FEATURE-007 PE-A/PE-B — full costing for loose paper, notebooks (§3.5),
 * envelopes (§3.6), and folders (§3.7).
 *
 * Ports PRICING_ENGINE_SPEC.md §3.3-3.7 literally, building on the
 * sheet-count core (`sizeCalculation.ts`, FEATURE-007 M1) rather than
 * duplicating its tiering logic. Pure functions only — no DB/HTTP access.
 */

import {
  findEntry,
  findFamily,
  getTieringGroupKey,
  parseAreaLabel,
  resolveCalcSize,
  SizeCalculationError,
  type NotebookContentType,
  type SizeFamilyInput,
  type TieringSettings,
} from './sizeCalculation.js';

export interface PricingConstants extends TieringSettings {
  zincPrice: number;
  printRunPrice: number;
  numberingRunPrice: number;
  designPrice: number;
  profitPercent: number;
  // §3.6 — envelopes have their own independent price constants, distinct
  // from the loose-paper/notebook ones above (confirmed rule: never share
  // a price between sections just because the concept sounds similar).
  envelopeDesignPrice: number;
  envelopeZincPrice: number;
  envelopePrintRunPrice: number;
  // §3.7 — folders.
  sellophanePricePerSheet: number;
}

export interface NumberingInput {
  startNumber: number;
}

/**
 * §3.3 — the independent numbering target per tiering group, keyed by the
 * same g1/g3/g4/g5/gA groups `sizeCalculation.ts` already resolves.
 * g2 (standard family) has no group-wide target — it maps each real size
 * directly via `NUMBERING_GROUP2_MAP` instead (§3.3's own stated exception).
 */
const NUMBERING_TARGETS: Record<string, { targetLabel: string; aSeries?: boolean }> = {
  g1: { targetLabel: '20×30' },
  g3: { targetLabel: '20×28' },
  g4: { targetLabel: '22×28' },
  g5: { targetLabel: '23×33' },
  gA: { targetLabel: 'A4', aSeries: true },
  // Owner-confirmed (2026-08-17) — same target as sizeCalculation.ts's new g6 tiering group.
  g6: { targetLabel: '20×25' },
};

const NUMBERING_GROUP2_MAP: Record<string, string> = {
  '12.5×17.5': '17.5×25',
  '17.5×25': '17.5×25',
  '25×35': '25×35',
};

/**
 * §3.3 — resolves the numbering repeat factor. Never doubled for a large
 * print sheet — confirmed rule, not an oversight.
 *
 * Owner (2026-08-17, "المفروض إن كل المقاسات تكون قابله للترقيم عندك
 * بناءاً على المنطق التسعيري") — every size family must support numbering,
 * with no exceptions. A family with no defined tiering group (present or
 * future) falls back to numbering at its own real size (repeat 1, no
 * batching benefit) instead of hard-failing — the exact same graceful
 * degradation `resolveCalcSize` already applies for printing when a family
 * has no group.
 */
export function resolveNumbering(params: {
  familyKey: string;
  realLabel: string;
  families: SizeFamilyInput[];
}): { repeat: number; targetLabel: string } {
  const family = findFamily(params.families, params.familyKey);
  const realEntry = findEntry(family, params.realLabel);
  if (!realEntry) {
    throw new SizeCalculationError(`Unknown size "${params.realLabel}" in family "${params.familyKey}"`);
  }

  const groupKey = getTieringGroupKey(params.familyKey);
  if (!groupKey) {
    return { repeat: 1, targetLabel: params.realLabel };
  }

  // Same "never fail, worst case number at the real size" fallback as the
  // no-group case above — covers g2's map not listing every standard size
  // (e.g. 35×50, 50×70), which used to throw here.
  const targetLabel =
    (groupKey === 'g2' ? NUMBERING_GROUP2_MAP[params.realLabel] : NUMBERING_TARGETS[groupKey]?.targetLabel) ??
    params.realLabel;

  if (NUMBERING_TARGETS[groupKey]?.aSeries) {
    const targetEntry = findEntry(family, targetLabel);
    if (!targetEntry) throw new SizeCalculationError(`Numbering target "${targetLabel}" not found`);
    return { repeat: Math.round(realEntry.piecesPerSheet / targetEntry.piecesPerSheet), targetLabel };
  }

  const realArea = parseAreaLabel(params.realLabel);
  const targetArea = parseAreaLabel(targetLabel);
  if (realArea === null || targetArea === null) {
    throw new SizeCalculationError(`Cannot parse area for numbering: "${targetLabel}" / "${params.realLabel}"`);
  }
  return { repeat: Math.round(targetArea / realArea), targetLabel };
}

export interface LoosePaperCostInput {
  familyKey: string;
  realLabel: string;
  quantity: number;
  colorCount: number;
  sides: 1 | 2;
  isNewDesign: boolean;
  numbering?: NumberingInput;
  sheetPrice: number;
  families: SizeFamilyInput[];
  settings: PricingConstants;
  /**
   * FEATURE-007 — owner-approved manual overrides (2026-08-10, see
   * PRICING_ENGINE_SPEC.md §4's amendment; extended 2026-08-17 to
   * design/numbering — owner: "عايز أقدر أعدل سعر الزنك وتراج الطبع
   * وترقيم والتصميم من واجهة الطلبات... ساعات بحتاج أغير لما احب أحسب
   * مناقصة" — same narrow "replace this one computed cost only" rule as
   * zinc/print, not a formula change). Each `*CostOverride` replaces that
   * one computed cost only — everything else (paper/margin) stays
   * server-computed always. `profitPercentOverride` replaces
   * `settings.profitPercent` for this item only. `extraCosts` is the
   * pre-summed manual "خدمات إضافية" amount (bagging/adhesive/sample — see
   * orderItemPricing.ts), added to subtotal before margin, same treatment
   * as §3.7's riza/jarab/forma/taksir.
   */
  zincCostOverride?: number;
  printCostOverride?: number;
  numberingCostOverride?: number;
  designCostOverride?: number;
  /** Owner (2026-08-17) — same override treatment for "الهالك" (waste sheets), replacing `settings.wasteSheetsDefault` for this item only. */
  wasteSheetsOverride?: number;
  profitPercentOverride?: number;
  extraCosts?: number;
}

export interface LoosePaperCostResult {
  sheetsNeeded: number;
  paperCost: number;
  zincCost: number;
  printRuns: number;
  printCost: number;
  numberingRuns: number;
  numberingCost: number;
  numberingEnd: number | null;
  designCost: number;
  extraCosts: number;
  profitPercentUsed: number;
  subtotal: number;
  total: number;
}

/** §3.4 — loose paper. */
export function calculateLoosePaperCost(input: LoosePaperCostInput): LoosePaperCostResult {
  const family = findFamily(input.families, input.familyKey);

  let sheetsNeeded: number;
  let printUnits: number;

  if (family.base === 'GAYER') {
    const { repeat } = resolveCalcSize({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      quantity: input.quantity,
      jobKind: 'LOOSE_PAPER',
      families: input.families,
      settings: input.settings,
    });
    sheetsNeeded = Math.ceil(input.quantity / repeat) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
    printUnits = input.quantity;
  } else {
    const calc = resolveCalcSize({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      quantity: input.quantity,
      jobKind: 'LOOSE_PAPER',
      families: input.families,
      settings: input.settings,
    });
    printUnits = input.quantity / calc.repeat;
    sheetsNeeded = Math.ceil(printUnits / calc.calcPiecesPerSheet) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
  }

  const paperCost = sheetsNeeded * input.sheetPrice;
  const zincCost = input.zincCostOverride ?? input.settings.zincPrice * input.colorCount;
  // §3.4 — "وجهين" doubles the run count only, not the sheet count.
  const printRuns = Math.ceil(printUnits / 1000) * input.colorCount * input.sides;
  const printCost = input.printCostOverride ?? printRuns * input.settings.printRunPrice;

  let numberingRuns = 0;
  let numberingCost = 0;
  let numberingEnd: number | null = null;
  if (input.numbering) {
    const { repeat: numRepeat } = resolveNumbering({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      families: input.families,
    });
    const numberingUnits = input.quantity / numRepeat;
    numberingRuns = Math.ceil(numberingUnits / 1000);
    numberingCost = input.numberingCostOverride ?? numberingRuns * input.settings.numberingRunPrice;
    // §3.3 — loose paper: each sheet is its own number.
    numberingEnd = input.numbering.startNumber + input.quantity - 1;
  }

  const designCost = input.designCostOverride ?? (input.isNewDesign ? input.settings.designPrice : 0);
  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;

  const subtotal = paperCost + zincCost + printCost + numberingCost + designCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return {
    sheetsNeeded,
    paperCost,
    zincCost,
    printRuns,
    printCost,
    numberingRuns,
    numberingCost,
    numberingEnd,
    designCost,
    extraCosts,
    profitPercentUsed,
    subtotal,
    total,
  };
}

export interface NotebookCostInput {
  familyKey: string;
  realLabel: string;
  notebookQuantity: number;
  contentType: NotebookContentType;
  copies?: number;
  colorCount: number;
  isNewDesign: boolean;
  numbering?: NumberingInput;
  bindingPricePerNotebook: number;
  sheetPrice: number;
  families: SizeFamilyInput[];
  settings: PricingConstants;
  /** See `LoosePaperCostInput`'s doc comment — same owner-approved override rules. */
  zincCostOverride?: number;
  printCostOverride?: number;
  numberingCostOverride?: number;
  designCostOverride?: number;
  wasteSheetsOverride?: number;
  profitPercentOverride?: number;
  extraCosts?: number;
}

export interface NotebookCostResult {
  totalSheetsFlat: number;
  sheetsNeeded: number;
  paperCost: number;
  zincCost: number;
  printRuns: number;
  printCost: number;
  numberingRuns: number;
  numberingCost: number;
  numberingEnd: number | null;
  designCost: number;
  bindingCost: number;
  extraCosts: number;
  profitPercentUsed: number;
  subtotal: number;
  total: number;
}

/** §3.5 — notebooks, the most-confirmed formula (one fully worked example). */
export function calculateNotebookCost(input: NotebookCostInput): NotebookCostResult {
  const sheetsPerNotebook = input.contentType === 'ORIGINAL_ONLY' ? 100 : 50 + 50 * (input.copies ?? 0);
  const totalSheetsFlat = input.notebookQuantity * sheetsPerNotebook;

  // Threshold compares against the notebook count itself, not the expanded
  // flat-sheet total — confirmed by the worked example (M1's own tests).
  const calc = resolveCalcSize({
    familyKey: input.familyKey,
    realLabel: input.realLabel,
    quantity: input.notebookQuantity,
    jobKind: 'NOTEBOOK',
    families: input.families,
    settings: input.settings,
  });

  const units = totalSheetsFlat / calc.repeat;
  const printRuns = Math.ceil(units / 1000) * input.colorCount;
  const printCost = input.printCostOverride ?? printRuns * input.settings.printRunPrice;

  const sheetsNeeded = Math.ceil(units / calc.calcPiecesPerSheet) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
  const paperCost = sheetsNeeded * input.sheetPrice;
  const zincCost = input.zincCostOverride ?? input.settings.zincPrice * input.colorCount;
  const designCost = input.designCostOverride ?? (input.isNewDesign ? input.settings.designPrice : 0);
  const bindingCost = input.bindingPricePerNotebook * input.notebookQuantity;

  let numberingRuns = 0;
  let numberingCost = 0;
  let numberingEnd: number | null = null;
  if (input.numbering) {
    const { repeat: numRepeat } = resolveNumbering({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      families: input.families,
    });
    const numberingUnits = totalSheetsFlat / numRepeat;
    numberingRuns = Math.ceil(numberingUnits / 1000);
    numberingCost = input.numberingCostOverride ?? numberingRuns * input.settings.numberingRunPrice;
    // §3.3 — original-only: 100 individually-numbered pages per notebook.
    // original+copies: 50 shared "sets" per notebook (carbon copy shares
    // the original's number regardless of copy count).
    numberingEnd =
      input.contentType === 'ORIGINAL_ONLY'
        ? input.numbering.startNumber + input.notebookQuantity * 100 - 1
        : input.numbering.startNumber + input.notebookQuantity * 50 - 1;
  }

  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;
  const subtotal = designCost + zincCost + printCost + numberingCost + paperCost + bindingCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return {
    totalSheetsFlat,
    sheetsNeeded,
    paperCost,
    zincCost,
    printRuns,
    printCost,
    numberingRuns,
    numberingCost,
    numberingEnd,
    designCost,
    bindingCost,
    extraCosts,
    profitPercentUsed,
    subtotal,
    total,
  };
}

/**
 * Multi-material notebooks (2026-08-17, owner-approved formula — see
 * CLAUDE.md rule 4). `calculateNotebookCost` above is never touched by this
 * function — it's called exactly once, unmodified, and its `sheetsNeeded`/
 * `zincCost`/`printCost`/`numberingCost`/`bindingCost`/`designCost` are used
 * as-is. Only `paperCost` is redistributed across the materials actually in
 * use — one role per copy, freely named/priced by the caller (owner,
 * 2026-08-17: "هختار نوع الورق لكل نسخة في الدفتر" — no fixed "first/
 * middle/last" naming, a genuinely independent material per copy). A
 * notebook is built of equal "sets" (one original page + one page per
 * copy), so every present role — the original and each of the `copies`
 * copies — gets exactly the same weight, `1/(1+copies)` of the pages. The
 * last role absorbs the rounding remainder so the shares always sum to
 * `sheetsNeeded` exactly, never drifting from the unmodified total.
 */
export type NotebookMaterialRole = string;

export interface NotebookMaterialOverride {
  /** `COPY_${n}`, 1-indexed (`COPY_1` is the first copy after the original, ..., `COPY_${copies}` the last). */
  role: NotebookMaterialRole;
  sheetPrice: number;
}

export interface NotebookMaterialBreakdown {
  role: NotebookMaterialRole;
  sheetsNeeded: number;
  sheetPrice: number;
  paperCost: number;
}

export interface NotebookMultiMaterialCostResult extends NotebookCostResult {
  materials: NotebookMaterialBreakdown[];
}

/**
 * `materialOverrides` supplies a subset of `COPY_1..COPY_${copies}`'s own
 * sheet price when they differ from the original's `input.sheetPrice`; a
 * copy with no override simply uses the original's price. Omitted entirely
 * (the common case today — one paper for the whole notebook) returns `base`
 * untouched, wrapped in a single-role `materials` array — byte-identical to
 * calling `calculateNotebookCost` directly.
 */
export function calculateNotebookMultiMaterialCost(
  input: NotebookCostInput,
  materialOverrides?: NotebookMaterialOverride[],
): NotebookMultiMaterialCostResult {
  const base = calculateNotebookCost(input);

  if (!materialOverrides || materialOverrides.length === 0) {
    return {
      ...base,
      materials: [{ role: 'ORIGINAL', sheetsNeeded: base.sheetsNeeded, sheetPrice: input.sheetPrice, paperCost: base.paperCost }],
    };
  }

  const copies = input.copies ?? 0;
  const roles: NotebookMaterialRole[] = ['ORIGINAL'];
  for (let i = 1; i <= copies; i++) roles.push(`COPY_${i}`);

  // Every role (original + each copy) represents exactly one 50-page "set"
  // slot, so they all carry equal weight — no role is bigger than another.
  const totalWeight = roles.length;

  const priceByRole = new Map<NotebookMaterialRole, number>();
  priceByRole.set('ORIGINAL', input.sheetPrice);
  for (const override of materialOverrides) priceByRole.set(override.role, override.sheetPrice);

  let allocated = 0;
  const materials: NotebookMaterialBreakdown[] = roles.map((role, idx) => {
    const isLast = idx === roles.length - 1;
    const sheetsNeeded = isLast ? base.sheetsNeeded - allocated : Math.floor(base.sheetsNeeded / totalWeight);
    allocated += sheetsNeeded;
    const sheetPrice = priceByRole.get(role) ?? input.sheetPrice;
    return { role, sheetsNeeded, sheetPrice, paperCost: sheetsNeeded * sheetPrice };
  });

  const paperCost = materials.reduce((sum, m) => sum + m.paperCost, 0);
  const subtotal = base.designCost + base.zincCost + base.printCost + base.numberingCost + paperCost + base.bindingCost + base.extraCosts;
  const total = subtotal * (1 + base.profitPercentUsed / 100);

  return { ...base, paperCost, subtotal, total, materials };
}

export interface EnvelopeCostInput {
  quantity: number;
  colorCount: number;
  isNewDesign: boolean;
  /** "سعر الظرف الجاهز للقطعة" — a per-order manual input (supplier price at the time), never a stored constant. */
  readyEnvelopePricePerPiece: number;
  settings: PricingConstants;
  /** See `LoosePaperCostInput`'s doc comment — same owner-approved override rules. */
  zincCostOverride?: number;
  printCostOverride?: number;
  designCostOverride?: number;
  profitPercentOverride?: number;
  extraCosts?: number;
}

export interface EnvelopeCostResult {
  designCost: number;
  zincCost: number;
  printRuns: number;
  printCost: number;
  envelopesCost: number;
  extraCosts: number;
  profitPercentUsed: number;
  subtotal: number;
  total: number;
}

/** §3.6 — envelopes. No size tiering at all — the simplest of the six item kinds. */
export function calculateEnvelopeCost(input: EnvelopeCostInput): EnvelopeCostResult {
  const designCost = input.designCostOverride ?? (input.isNewDesign ? input.settings.envelopeDesignPrice : 0);
  const zincCost = input.zincCostOverride ?? input.settings.envelopeZincPrice * input.colorCount;
  const printRuns = Math.ceil(input.quantity / 1000) * input.colorCount;
  const printCost = input.printCostOverride ?? printRuns * input.settings.envelopePrintRunPrice;
  const envelopesCost = input.quantity * input.readyEnvelopePricePerPiece;
  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;

  const subtotal = designCost + zincCost + printCost + envelopesCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return { designCost, zincCost, printRuns, printCost, envelopesCost, extraCosts, profitPercentUsed, subtotal, total };
}

export interface FolderCostInput {
  familyKey: string;
  realLabel: string;
  quantity: number;
  colorCount: number;
  sides: 1 | 2;
  isNewDesign: boolean;
  sheetPrice: number;
  sellophaneEnabled: boolean;
  /** §3.7 — riza/جراب داخلي/فورمة/تكسير وتلزيق: manual per-order line costs, optional, default 0. */
  riza?: number;
  jarab?: number;
  forma?: number;
  taksir?: number;
  families: SizeFamilyInput[];
  settings: PricingConstants;
  /** See `LoosePaperCostInput`'s doc comment — same owner-approved override rules. */
  zincCostOverride?: number;
  printCostOverride?: number;
  designCostOverride?: number;
  wasteSheetsOverride?: number;
  profitPercentOverride?: number;
  extraCosts?: number;
}

export interface FolderCostResult {
  sheetsNeeded: number;
  paperCost: number;
  zincCost: number;
  printRuns: number;
  printCost: number;
  designCost: number;
  selloCost: number;
  riza: number;
  jarab: number;
  forma: number;
  taksir: number;
  extraCosts: number;
  profitPercentUsed: number;
  subtotal: number;
  total: number;
}

/**
 * §3.7 — folders. Reuses loose paper's sheet-count/zinc/print/design math
 * exactly (§3.4, "نفس منطق ورق سايب في حساب عدد الأفرخ") rather than
 * duplicating it — only `sheetsNeeded`/`paperCost`/`zincCost`/`printCost`/
 * `designCost` are taken from that call; its own `subtotal`/`total` are
 * discarded since folders apply margin once across the full folder cost,
 * not on the loose-paper portion alone. No numbering — the spec's folder
 * section never mentions it.
 */
export function calculateFolderCost(input: FolderCostInput): FolderCostResult {
  const base = calculateLoosePaperCost({
    familyKey: input.familyKey,
    realLabel: input.realLabel,
    quantity: input.quantity,
    colorCount: input.colorCount,
    sides: input.sides,
    isNewDesign: input.isNewDesign,
    sheetPrice: input.sheetPrice,
    families: input.families,
    settings: input.settings,
    zincCostOverride: input.zincCostOverride,
    printCostOverride: input.printCostOverride,
    designCostOverride: input.designCostOverride,
    wasteSheetsOverride: input.wasteSheetsOverride,
  });

  const selloCost = input.sellophaneEnabled ? base.sheetsNeeded * input.settings.sellophanePricePerSheet : 0;
  const riza = input.riza ?? 0;
  const jarab = input.jarab ?? 0;
  const forma = input.forma ?? 0;
  const taksir = input.taksir ?? 0;
  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;

  const subtotal =
    base.designCost + base.zincCost + base.printCost + base.paperCost + riza + jarab + forma + taksir + selloCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return {
    sheetsNeeded: base.sheetsNeeded,
    paperCost: base.paperCost,
    zincCost: base.zincCost,
    printRuns: base.printRuns,
    printCost: base.printCost,
    designCost: base.designCost,
    selloCost,
    riza,
    jarab,
    forma,
    taksir,
    extraCosts,
    profitPercentUsed,
    subtotal,
    total,
  };
}
