/**
 * system_specifications_v2.md §13.3 — Digital printing costing, "نظام
 * التنزيلة" (Yield-based). Owner-approved explicit approval (2026-08-16) to
 * implement, since this touches pricing-protected territory (CLAUDE.md rule
 * 3) — but this is the FIRST implementation of Digital-track costing, not a
 * modification of any existing approved calculation: `NewOrderPage.tsx`
 * showed a literal "قريبًا" placeholder for this track before this file
 * existed, and no other pricing file computes anything for it.
 *
 * Deliberately independent of `sizeCalculation.ts`/`costCalculation.ts` —
 * same reasoning as `boardsCostCalculation.ts`: this track has its own
 * fixed feed-size constraint (quarter-sheet) and its own variable (Yield),
 * not the family/tiering system the Offset-paper tracks use.
 *
 * Pure functions only — no DB/HTTP access.
 */

export interface DigitalPricingConstants {
  /** "سعر طباعة الربع" — print cost for one full quarter-sheet pass. */
  digitalPrintPricePerQuarter: number;
  /** "سعر سلوفان الربع" — sellophane cost for one full quarter-sheet. */
  digitalSellophanePricePerQuarter: number;
  /** Machine feed size (§13.3, spec default 50×35cm) — configurable per rule 15, not hardcoded, in case the machine changes. */
  digitalQuarterWidthCm: number;
  digitalQuarterHeightCm: number;
  profitPercent: number;
  /** "أفرخ التهدير الافتراضية" — same Setting already used by `sizeCalculation.ts`'s sheet-count math (rule 5: reused, not duplicated), applied here too since Digital consumes full sheets (quartered) the same way Offset paper jobs do. */
  wasteSheetsDefault: number;
}

export interface DigitalCostInput {
  pieceWidthCm: number;
  pieceHeightCm: number;
  quantity: number;
  /**
   * "Yield" — pieces per quarter-sheet. The caller (NewOrderPage) auto-fills
   * this from `suggestYield` below, but Pre-Press can override it before
   * final pricing (§13.3.1) — always required here, never recomputed
   * silently, since the auto-suggestion doesn't know trim margins or grain
   * direction.
   */
  yieldPerQuarter: number;
  /** "سعر الفرخ" — resolved from the selected paper's `InventoryItem`/`SheetType`, same source as the LOOSE_PAPER/NOTEBOOK/FOLDER kinds. */
  sheetPrice: number;
  sellophaneEnabled?: boolean;
  /** "سعر البشر" — optional, always caller-entered per piece (no stored constant, §13.3.2's own note). */
  boshrPricePerPiece?: number;
  settings: DigitalPricingConstants;
  profitPercentOverride?: number;
  /** Pre-summed manual "خدمات إضافية" amount — same treatment as every other item kind. */
  extraCosts?: number;
}

export interface DigitalCostResult {
  fitsInQuarter: boolean;
  /** Only set when `!fitsInQuarter` — number of quarter-sheets one piece consumes. */
  unitsNeeded: number | null;
  paperCostPerPiece: number;
  printCostPerPiece: number;
  sellophaneCostPerPiece: number;
  boshrCostPerPiece: number;
  costPerPiece: number;
  quantity: number;
  extraCosts: number;
  subtotal: number;
  profitPercentUsed: number;
  total: number;
  /** Total quarter-sheets needed for the whole quantity (before rounding up to full sheets). */
  quartersNeeded: number;
  /** Full sheets consumed (quartersNeeded ÷ 4, rounded up, plus waste) — mirrors `sizeCalculation.ts`'s `computeLooseSheetsNeeded`, feeds `OrderItem.sheetsConsumed` for the same generic inventory-deduction path every other paper-based kind already uses. */
  sheetsNeeded: number;
}

export class DigitalCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigitalCalculationError';
  }
}

/**
 * Auto-suggests Yield from piece vs. quarter-sheet dimensions (§13.3.1) —
 * a plain grid fit in the better of the two orientations (portrait vs.
 * landscape). This is a starting point only; trim margins and grain
 * direction are Pre-Press's call, applied by editing the suggested value
 * before submitting, not by this function.
 */
export function suggestYield(
  pieceWidthCm: number,
  pieceHeightCm: number,
  quarterWidthCm: number,
  quarterHeightCm: number,
): number {
  const straight = Math.floor(quarterWidthCm / pieceWidthCm) * Math.floor(quarterHeightCm / pieceHeightCm);
  const rotated = Math.floor(quarterWidthCm / pieceHeightCm) * Math.floor(quarterHeightCm / pieceWidthCm);
  return Math.max(straight, rotated);
}

/** §13.3.2 — the Yield-based digital cost formula, applied verbatim. */
export function calculateDigitalCost(input: DigitalCostInput): DigitalCostResult {
  const quarterAreaCm2 = input.settings.digitalQuarterWidthCm * input.settings.digitalQuarterHeightCm;
  const pieceAreaCm2 = input.pieceWidthCm * input.pieceHeightCm;
  const fitsInQuarter = pieceAreaCm2 <= quarterAreaCm2;

  const quarterSheetPrice = input.sheetPrice / 4;
  const sellophaneEnabled = input.sellophaneEnabled ?? false;

  let paperCostPerPiece: number;
  let printCostPerPiece: number;
  let sellophaneCostPerPiece: number;
  let unitsNeeded: number | null = null;

  if (fitsInQuarter) {
    if (!Number.isFinite(input.yieldPerQuarter) || input.yieldPerQuarter <= 0) {
      throw new DigitalCalculationError('Yield must be a positive number for a piece that fits within a quarter-sheet');
    }
    paperCostPerPiece = quarterSheetPrice / input.yieldPerQuarter;
    printCostPerPiece = input.settings.digitalPrintPricePerQuarter / input.yieldPerQuarter;
    sellophaneCostPerPiece = sellophaneEnabled
      ? input.settings.digitalSellophanePricePerQuarter / input.yieldPerQuarter
      : 0;
  } else {
    unitsNeeded = Math.ceil(pieceAreaCm2 / quarterAreaCm2);
    paperCostPerPiece = quarterSheetPrice * unitsNeeded;
    printCostPerPiece = input.settings.digitalPrintPricePerQuarter * unitsNeeded;
    sellophaneCostPerPiece = sellophaneEnabled ? input.settings.digitalSellophanePricePerQuarter * unitsNeeded : 0;
  }

  const boshrCostPerPiece = input.boshrPricePerPiece ?? 0;
  const costPerPiece = paperCostPerPiece + printCostPerPiece + sellophaneCostPerPiece + boshrCostPerPiece;
  const extraCosts = input.extraCosts ?? 0;
  const subtotal = costPerPiece * input.quantity + extraCosts;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;
  const total = subtotal * (1 + profitPercentUsed / 100);

  // How much physical paper this job actually consumes — same "quarters
  // needed" concept whether the piece fits within one quarter (several
  // pieces share a quarter, per Yield) or needs several quarters each.
  const quartersNeeded = fitsInQuarter
    ? Math.ceil(input.quantity / input.yieldPerQuarter)
    : (unitsNeeded as number) * input.quantity;
  const sheetsNeeded = Math.ceil(quartersNeeded / 4) + input.settings.wasteSheetsDefault;

  return {
    fitsInQuarter,
    unitsNeeded,
    paperCostPerPiece,
    printCostPerPiece,
    sellophaneCostPerPiece,
    boshrCostPerPiece,
    costPerPiece,
    quantity: input.quantity,
    extraCosts,
    subtotal,
    profitPercentUsed,
    total,
    quartersNeeded,
    sheetsNeeded,
  };
}
