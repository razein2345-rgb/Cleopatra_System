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
 *
 * `targetLabelOverride` (owner, 2026-08-17: "بالنسبة للترقيم عايز بردو
 * انا اللي اقولك مقاس الترقيم وانت تشوف مقاس الورق ده هياخد كام قطعة")
 * — optional manual override of the numbering target, same "toggle +
 * value, defaults to automatic" pattern as `resolveCalcSize`'s
 * `calcLabelOverride`. `repeat` is computed with the exact same
 * area-ratio/piece-ratio formulas the automatic path already uses.
 */
export function resolveNumbering(params: {
  familyKey: string;
  realLabel: string;
  families: SizeFamilyInput[];
  targetLabelOverride?: string;
}): { repeat: number; targetLabel: string } {
  const family = findFamily(params.families, params.familyKey);
  const realEntry = findEntry(family, params.realLabel);
  if (!realEntry) {
    throw new SizeCalculationError(`Unknown size "${params.realLabel}" in family "${params.familyKey}"`);
  }

  if (params.targetLabelOverride) {
    if (params.targetLabelOverride === params.realLabel) {
      return { repeat: 1, targetLabel: params.targetLabelOverride };
    }
    // Owner (2026-08-17, "لا يحصرني في المقاسات الموجودة") — the typed
    // numbering size no longer has to be a known catalog entry; area-ratio
    // (same formula the automatic path already uses) works for any
    // "WxH"-format label. A label that DOES match a real entry (or isn't
    // "WxH" parseable, e.g. A-series) still falls back to the piece-ratio
    // formula, exactly as before this extension.
    const realAreaOv = parseAreaLabel(params.realLabel);
    const targetAreaOv = parseAreaLabel(params.targetLabelOverride);
    if (realAreaOv !== null && targetAreaOv !== null) {
      return { repeat: Math.max(1, Math.round(targetAreaOv / realAreaOv)), targetLabel: params.targetLabelOverride };
    }
    const targetEntry = findEntry(family, params.targetLabelOverride);
    if (!targetEntry) {
      throw new SizeCalculationError(`مقاس الترقيم "${params.targetLabelOverride}" — لازم يكون بصيغة "عرض×ارتفاع" لو مش من المقاسات الجاهزة`);
    }
    return {
      repeat: Math.round(realEntry.piecesPerSheet / targetEntry.piecesPerSheet),
      targetLabel: params.targetLabelOverride,
    };
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

/**
 * Owner (2026-09-01, "لما اختار وجهين في احتمالين إما يكونوا نفس الشكل
 * او مختلفين... لو مختلفين هيبقى في سعر للتصميم التاني وسعر للزنكاية
 * التانية") — shared by `calculateLoosePaperCost`/`calculateNotebookCost`
 * (FOLDER reuses loose paper's own call, no separate implementation
 * needed there). Two sides with the SAME design/colors is the existing,
 * unchanged case: `secondSideColorCount` stays absent, and the total
 * plate/run count is just `colorCount * sides` exactly as before this
 * feature. Two DIFFERENT sides is new: each side gets its own
 * independent color count (owner: "كل وجه ليه عدد ألوان مستقل"), and the
 * total plates/runs is their SUM (owner: "مجموع الألوان × عدد الطبعات
 * العادي") — when both sides happen to have the same count, this sum
 * equals the old `colorCount * 2` exactly, so nothing already-priced
 * ever changes just by this feature existing.
 */
function resolveTotalColorCount(colorCount: number, sides: 1 | 2, secondSideColorCount?: number): number {
  return secondSideColorCount !== undefined ? colorCount + secondSideColorCount : colorCount * sides;
}

/** See `resolveTotalColorCount`'s doc comment — the same "different sides" toggle applied to design cost: each side's own "تصميم جديد" is billed independently (owner: "خانتين منفصلتين... واحدة لكل وجه") only once a second side is actually distinguished; otherwise this is the single existing designCost, unchanged. */
function resolveDesignCost(isNewDesign: boolean, designPrice: number, secondSideIsNewDesign?: boolean): number {
  const first = isNewDesign ? designPrice : 0;
  if (secondSideIsNewDesign === undefined) return first;
  return first + (secondSideIsNewDesign ? designPrice : 0);
}

export interface LoosePaperCostInput {
  familyKey: string;
  realLabel: string;
  quantity: number;
  colorCount: number;
  sides: 1 | 2;
  /** Owner (2026-09-01) — see `resolveTotalColorCount`'s doc comment. Undefined = "same shape on both sides" (existing behavior, unaffected). */
  secondSideColorCount?: number;
  isNewDesign: boolean;
  /** Owner (2026-09-01) — see `resolveDesignCost`'s doc comment. */
  secondSideIsNewDesign?: boolean;
  numbering?: NumberingInput;
  sheetPrice: number;
  families: SizeFamilyInput[];
  settings: PricingConstants;
  /**
   * FEATURE-007 — owner-approved manual overrides (2026-08-10, see
   * PRICING_ENGINE_SPEC.md §4's amendment; extended 2026-08-17 to
   * design/numbering — owner: "عايز أقدر أعدل سعر الزنك وتراج الطبع
   * وترقيم والتصميم من واجهة الطلبات... ساعات بحتاج أغير لما احب أحسب
   * مناقصة"). `designCostOverride` replaces that one computed TOTAL cost
   * only. `numberingRunPriceOverride` (owner, 2026-08-25: "عايز لما احب
   * احط سعر الترقيم غير سعر الديفولت يكون سعر الترقيم للتراج الواحد مش
   * سعر الترقيم الكلي") replaces the PER-RUN price
   * (`settings.numberingRunPrice`) that feeds the existing
   * `numberingRuns ×` multiplication, not the final total — same shape as
   * `zincPriceOverride`/`printRunPriceOverride` below, for the same reason
   * (less error-prone than typing a pre-multiplied total by hand). Was
   * originally a total-replacing `numberingCostOverride` — renamed, not
   * kept alongside, to avoid two different ways of overriding the same
   * number.
   * `profitPercentOverride` replaces `settings.profitPercent` for this
   * item only. `extraCosts` is the pre-summed manual "خدمات إضافية" amount
   * (bagging/adhesive/sample — see orderItemPricing.ts), added to subtotal
   * before margin, same treatment as §3.7's riza/jarab/forma/taksir.
   */
  numberingRunPriceOverride?: number;
  designCostOverride?: number;
  /**
   * Owner (2026-08-17, "عايز زرار التعديل... يكون بيحط سعر الزنكاية
   * الواحدة، سعر تراج الطباعة الواحد") — same-day refinement of the zinc/
   * print overrides above: replaces the PER-UNIT price
   * (`settings.zincPrice`/`settings.printRunPrice`) that feeds the
   * existing multiplication, not the final total — `zincCost`/`printCost`
   * are still `colorCount`/`printRuns` × this price, exactly as the
   * automatic path already computes them. Less error-prone than typing a
   * pre-multiplied total by hand (the previous `zincCostOverride`/
   * `printCostOverride` shape, replaced here — not kept alongside this,
   * to avoid two different ways of overriding the same number).
   */
  zincPriceOverride?: number;
  printRunPriceOverride?: number;
  /** Owner (2026-08-17) — same override treatment for "الهالك" (waste sheets), replacing `settings.wasteSheetsDefault` for this item only. */
  wasteSheetsOverride?: number;
  /**
   * Owner (2026-08-17) — manual print/numbering size overrides (see
   * `resolveCalcSize`/`resolveNumbering`'s own doc comments for the full
   * rationale). Neither changes any formula — only which size feeds the
   * existing repeat/sheetsNeeded/printRuns/numberingRuns calculations.
   */
  calcSizeOverride?: string;
  numberingSizeOverride?: string;
  profitPercentOverride?: number;
  extraCosts?: number;
  /**
   * Owner (2026-08-26, "عايز اقدر اعدل في إجمالي سعر الورق في الصنف بعد ما
   * يتحسب") — replaces the computed `paperCost` TOTAL directly (unlike
   * `sheetPriceOverride`, which replaces the per-sheet rate and keeps the
   * `sheetsNeeded ×` multiplication). A separate, independent control —
   * owner confirmed both should exist side by side, not one replacing the
   * other.
   */
  paperCostOverride?: number;
}

export interface LoosePaperCostResult {
  /**
   * Owner (2026-08-24, "المفروض المقاس اللي يتحط المقاس اللي بيتحسب عليه
   * الطباعة... لو شغلانه 20*30 وهما اكتر من 30 دفتر المفروض هيتطبع على
   * مقاس 30*40 فا هو ده مقاس التكسير") — the size the job is actually
   * imposed/printed on (`resolveCalcSize`'s own tiered result), already
   * computed below and previously discarded. Purely additive: no formula
   * changed, this just surfaces the value that was already there.
   */
  calcLabel: string;
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
  let calcLabel: string;

  if (family.base === 'GAYER') {
    const calc = resolveCalcSize({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      quantity: input.quantity,
      jobKind: 'LOOSE_PAPER',
      families: input.families,
      settings: input.settings,
      calcLabelOverride: input.calcSizeOverride,
    });
    sheetsNeeded = Math.ceil(input.quantity / calc.repeat) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
    printUnits = input.quantity;
    calcLabel = calc.calcLabel;
  } else {
    const calc = resolveCalcSize({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      quantity: input.quantity,
      jobKind: 'LOOSE_PAPER',
      families: input.families,
      settings: input.settings,
      calcLabelOverride: input.calcSizeOverride,
    });
    printUnits = input.quantity / calc.repeat;
    sheetsNeeded = Math.ceil(printUnits / calc.calcPiecesPerSheet) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
    calcLabel = calc.calcLabel;
  }

  const paperCost = input.paperCostOverride ?? sheetsNeeded * input.sheetPrice;
  const totalColorCount = resolveTotalColorCount(input.colorCount, input.sides, input.secondSideColorCount);
  const zincCost = (input.zincPriceOverride ?? input.settings.zincPrice) * totalColorCount;
  // §3.4 — "وجهين" doubles the run count only, not the sheet count.
  const printRuns = Math.ceil(printUnits / 1000) * totalColorCount;
  const printCost = printRuns * (input.printRunPriceOverride ?? input.settings.printRunPrice);

  let numberingRuns = 0;
  let numberingCost = 0;
  let numberingEnd: number | null = null;
  if (input.numbering) {
    const { repeat: numRepeat } = resolveNumbering({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      families: input.families,
      targetLabelOverride: input.numberingSizeOverride,
    });
    const numberingUnits = input.quantity / numRepeat;
    numberingRuns = Math.ceil(numberingUnits / 1000);
    numberingCost = numberingRuns * (input.numberingRunPriceOverride ?? input.settings.numberingRunPrice);
    // §3.3 — loose paper: each sheet is its own number.
    numberingEnd = input.numbering.startNumber + input.quantity - 1;
  }

  const designCost =
    input.designCostOverride ?? resolveDesignCost(input.isNewDesign, input.settings.designPrice, input.secondSideIsNewDesign);
  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;

  const subtotal = paperCost + zincCost + printCost + numberingCost + designCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return {
    calcLabel,
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
  /** Owner (2026-08-27, "مش موجود عندي اوبشن إني اشتغل على وجهين في الدفاتر") — same "وجهين يضاعف عدد التراجات فقط، مش عدد الأفرخ" rule `LoosePaperCostInput.sides`/`FolderCostInput` already use, extended here for the first time. */
  sides: 1 | 2;
  /** Owner (2026-09-01) — see `resolveTotalColorCount`'s doc comment. Undefined = "same shape on both sides" (existing behavior, unaffected). */
  secondSideColorCount?: number;
  isNewDesign: boolean;
  /** Owner (2026-09-01) — see `resolveDesignCost`'s doc comment. */
  secondSideIsNewDesign?: boolean;
  numbering?: NumberingInput;
  bindingPricePerNotebook: number;
  sheetPrice: number;
  families: SizeFamilyInput[];
  settings: PricingConstants;
  /** See `LoosePaperCostInput`'s doc comment — same owner-approved override rules. */
  zincPriceOverride?: number;
  printRunPriceOverride?: number;
  numberingRunPriceOverride?: number;
  designCostOverride?: number;
  wasteSheetsOverride?: number;
  calcSizeOverride?: string;
  numberingSizeOverride?: string;
  /**
   * Owner (2026-08-17, "عايز اقدر أعدل على عدد الورق الداخلي للدفتر...
   * ممكن يكون 100 للأصل و100 للصورة... ممكن يكون 50 أصل فقط") — manual
   * override of the per-notebook page counts, replacing the fixed
   * 100-page (ORIGINAL_ONLY) / 50-page (ORIGINAL_PLUS_COPIES original
   * "set" count) defaults. `originalPagesOverride` applies in both content
   * types; `copyPagesOverride` only matters for ORIGINAL_PLUS_COPIES and
   * applies uniformly to every copy (this notebook already prices each
   * copy's own paper independently via `materials` — this override is
   * about page COUNT, a separate concern). Neither changes any formula —
   * `sheetsPerNotebook`/`numberingEnd` are computed with the exact same
   * arithmetic, just fed a caller-chosen number instead of a literal.
   */
  originalPagesOverride?: number;
  copyPagesOverride?: number;
  profitPercentOverride?: number;
  extraCosts?: number;
  /** See `LoosePaperCostInput.paperCostOverride`'s doc comment — same total-replacing override, independent of `sheetPriceOverride`/per-copy `materials`. Applied to the final aggregated paper cost in `calculateNotebookMultiMaterialCost`, not per-role. */
  paperCostOverride?: number;
}

export interface NotebookCostResult {
  /** See `LoosePaperCostResult.calcLabel`'s doc comment — same concept, notebook path. */
  calcLabel: string;
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
  const originalPages = input.originalPagesOverride ?? (input.contentType === 'ORIGINAL_ONLY' ? 100 : 50);
  const copyPages = input.copyPagesOverride ?? 50;
  const sheetsPerNotebook =
    input.contentType === 'ORIGINAL_ONLY' ? originalPages : originalPages + copyPages * (input.copies ?? 0);
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
    calcLabelOverride: input.calcSizeOverride,
  });

  const units = totalSheetsFlat / calc.repeat;
  const totalColorCount = resolveTotalColorCount(input.colorCount, input.sides, input.secondSideColorCount);
  const printRuns = Math.ceil(units / 1000) * totalColorCount;
  const printCost = printRuns * (input.printRunPriceOverride ?? input.settings.printRunPrice);

  const sheetsNeeded = Math.ceil(units / calc.calcPiecesPerSheet) + (input.wasteSheetsOverride ?? input.settings.wasteSheetsDefault);
  const paperCost = input.paperCostOverride ?? sheetsNeeded * input.sheetPrice;
  const zincCost = (input.zincPriceOverride ?? input.settings.zincPrice) * totalColorCount;
  const designCost =
    input.designCostOverride ?? resolveDesignCost(input.isNewDesign, input.settings.designPrice, input.secondSideIsNewDesign);
  const bindingCost = input.bindingPricePerNotebook * input.notebookQuantity;

  let numberingRuns = 0;
  let numberingCost = 0;
  let numberingEnd: number | null = null;
  if (input.numbering) {
    const { repeat: numRepeat } = resolveNumbering({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      families: input.families,
      targetLabelOverride: input.numberingSizeOverride,
    });
    const numberingUnits = totalSheetsFlat / numRepeat;
    numberingRuns = Math.ceil(numberingUnits / 1000);
    numberingCost = numberingRuns * (input.numberingRunPriceOverride ?? input.settings.numberingRunPrice);
    // §3.3 — original-only: `originalPages` individually-numbered pages
    // per notebook. original+copies: `originalPages` shared "sets" per
    // notebook (carbon copy shares the original's number regardless of
    // copy count) — same `originalPages` value either way, already
    // computed above (owner-overridable, defaults to 100/50 exactly as
    // before).
    numberingEnd = input.numbering.startNumber + input.notebookQuantity * originalPages - 1;
  }

  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;
  const subtotal = designCost + zincCost + printCost + numberingCost + paperCost + bindingCost + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  return {
    calcLabel: calc.calcLabel,
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
  /**
   * Owner (2026-09-01, "الأصل مكون من ورقتين... كل ورقة فيهم وجهين وفي
   * ورقة فيهم الوجهين شبه بعض والورقة التانية الوجهين مختلفين") — an
   * independent print job for this copy, distinct from the notebook-wide
   * `colorCount`/`sides`/`secondSideColorCount`/`isNewDesign`/
   * `secondSideIsNewDesign` on `NotebookCostInput`. Any field left
   * undefined falls back to that shared setting for this copy. See
   * `calculateNotebookMultiMaterialCost`'s own doc comment for the formula.
   */
  colorCount?: number;
  sides?: 1 | 2;
  secondSideColorCount?: number;
  isNewDesign?: boolean;
  secondSideIsNewDesign?: boolean;
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
 *
 * Owner (2026-09-01, "الأصل مكون من ورقتين... ورقة فيهم الوجهين شبه بعض
 * والورقة التانية الوجهين مختلفين") — a copy can ALSO override its own
 * `colorCount`/`sides`/`secondSideColorCount`/`isNewDesign`/
 * `secondSideIsNewDesign`, making it a genuinely independent print job
 * (separate zinc plate, separate press runs) rather than just a different
 * paper. `calculateNotebookCost` itself is still never touched — when NO
 * copy overrides any print field (the common case, including every
 * pre-existing multi-material notebook that only ever overrode paper
 * price), `base`'s notebook-wide zinc/print/design numbers are used exactly
 * as before, byte-identical.
 *
 * When at least one role DOES override a print field, that role's zinc/
 * print/design cost is carved out and computed independently from its own
 * page share (`notebookQuantity × originalPages` for ORIGINAL, `×
 * copyPages` for any COPY), using the same run-size-tiering formula
 * `calculateNotebookCost` uses. Every remaining role without a print
 * override stays pooled together and priced with the notebook-wide shared
 * settings, exactly as `base` already computed for the combined sheet
 * count — carving a role out only ever adds a new, previously-impossible
 * combination, it never changes the arithmetic for a role that keeps using
 * the shared settings. This carve-out is necessary (not just "sum every
 * role independently") because `ceil(a/1000) + ceil(b/1000)` is not always
 * `ceil((a+b)/1000)` — always aggregating everything as one shared pool
 * (today's behavior) or always splitting every role apart would each
 * silently change run counts for jobs that never asked for that.
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

  const overrideByRole = new Map<NotebookMaterialRole, NotebookMaterialOverride>();
  for (const override of materialOverrides) overrideByRole.set(override.role, override);

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

  const paperCost = input.paperCostOverride ?? materials.reduce((sum, m) => sum + m.paperCost, 0);

  const hasPrintOverride = (o: NotebookMaterialOverride | undefined): o is NotebookMaterialOverride =>
    o !== undefined &&
    (o.colorCount !== undefined || o.sides !== undefined || o.secondSideColorCount !== undefined || o.isNewDesign !== undefined || o.secondSideIsNewDesign !== undefined);

  const anyPrintOverride = roles.some((role) => hasPrintOverride(overrideByRole.get(role)));

  let zincCost = base.zincCost;
  let printRuns = base.printRuns;
  let printCost = base.printCost;
  let designCost = base.designCost;

  if (anyPrintOverride) {
    const { repeat } = resolveCalcSize({
      familyKey: input.familyKey,
      realLabel: input.realLabel,
      quantity: input.notebookQuantity,
      jobKind: 'NOTEBOOK',
      families: input.families,
      settings: input.settings,
      calcLabelOverride: input.calcSizeOverride,
    });
    const originalPages = input.originalPagesOverride ?? (input.contentType === 'ORIGINAL_ONLY' ? 100 : 50);
    const copyPages = input.copyPagesOverride ?? 50;
    const zincPrice = input.zincPriceOverride ?? input.settings.zincPrice;
    const printRunPrice = input.printRunPriceOverride ?? input.settings.printRunPrice;

    zincCost = 0;
    printRuns = 0;
    printCost = 0;
    let designCostSum = 0;
    let pooledFlatSheets = base.totalSheetsFlat;

    for (const role of roles) {
      const override = overrideByRole.get(role);
      if (!hasPrintOverride(override)) continue;
      const flatSheets = input.notebookQuantity * (role === 'ORIGINAL' ? originalPages : copyPages);
      pooledFlatSheets -= flatSheets;
      const totalColorCount = resolveTotalColorCount(
        override.colorCount ?? input.colorCount,
        override.sides ?? input.sides,
        override.secondSideColorCount,
      );
      const runs = Math.ceil(flatSheets / repeat / 1000) * totalColorCount;
      zincCost += zincPrice * totalColorCount;
      printRuns += runs;
      printCost += runs * printRunPrice;
      designCostSum += resolveDesignCost(override.isNewDesign ?? input.isNewDesign, input.settings.designPrice, override.secondSideIsNewDesign);
    }

    if (pooledFlatSheets > 0) {
      const pooledTotalColorCount = resolveTotalColorCount(input.colorCount, input.sides, input.secondSideColorCount);
      const pooledRuns = Math.ceil(pooledFlatSheets / repeat / 1000) * pooledTotalColorCount;
      zincCost += zincPrice * pooledTotalColorCount;
      printRuns += pooledRuns;
      printCost += pooledRuns * printRunPrice;
      designCostSum += resolveDesignCost(input.isNewDesign, input.settings.designPrice, input.secondSideIsNewDesign);
    }

    // A flat `designCostOverride` replaces the whole notebook's design cost
    // once (same as `calculateNotebookCost`'s own rule) — it never sums per
    // role, unlike zinc/print which are inherently per-plate quantities.
    designCost = input.designCostOverride ?? designCostSum;
  }

  const subtotal = designCost + zincCost + printCost + base.numberingCost + paperCost + base.bindingCost + base.extraCosts;
  const total = subtotal * (1 + base.profitPercentUsed / 100);

  return { ...base, zincCost, printRuns, printCost, designCost, paperCost, subtotal, total, materials };
}

export interface EnvelopeCostInput {
  quantity: number;
  colorCount: number;
  isNewDesign: boolean;
  /** "سعر الظرف الجاهز للقطعة" — a per-order manual input (supplier price at the time), never a stored constant. */
  readyEnvelopePricePerPiece: number;
  settings: PricingConstants;
  /** See `LoosePaperCostInput`'s doc comment — same owner-approved override rules. */
  zincPriceOverride?: number;
  printRunPriceOverride?: number;
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
  const zincCost = (input.zincPriceOverride ?? input.settings.envelopeZincPrice) * input.colorCount;
  const printRuns = Math.ceil(input.quantity / 1000) * input.colorCount;
  const printCost = printRuns * (input.printRunPriceOverride ?? input.settings.envelopePrintRunPrice);
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
  /** Owner (2026-09-01) — see `resolveTotalColorCount`'s doc comment; passed straight through to the internal `calculateLoosePaperCost` call below. */
  secondSideColorCount?: number;
  isNewDesign: boolean;
  /** Owner (2026-09-01) — see `resolveDesignCost`'s doc comment; passed straight through to the internal `calculateLoosePaperCost` call below. */
  secondSideIsNewDesign?: boolean;
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
  zincPriceOverride?: number;
  printRunPriceOverride?: number;
  designCostOverride?: number;
  wasteSheetsOverride?: number;
  calcSizeOverride?: string;
  profitPercentOverride?: number;
  extraCosts?: number;
  /** See `LoosePaperCostInput.paperCostOverride`'s doc comment — passed straight through to the internal `calculateLoosePaperCost` call below. */
  paperCostOverride?: number;
}

export interface FolderCostResult {
  /** See `LoosePaperCostResult.calcLabel`'s doc comment — folders reuse loose paper's sheet-count math, same concept. */
  calcLabel: string;
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
    secondSideColorCount: input.secondSideColorCount,
    isNewDesign: input.isNewDesign,
    secondSideIsNewDesign: input.secondSideIsNewDesign,
    sheetPrice: input.sheetPrice,
    families: input.families,
    settings: input.settings,
    zincPriceOverride: input.zincPriceOverride,
    printRunPriceOverride: input.printRunPriceOverride,
    designCostOverride: input.designCostOverride,
    wasteSheetsOverride: input.wasteSheetsOverride,
    calcSizeOverride: input.calcSizeOverride,
    paperCostOverride: input.paperCostOverride,
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
    calcLabel: base.calcLabel,
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
