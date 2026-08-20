/**
 * system_specifications_v2.md §13.3 — Digital printing costing, "نظام
 * التنزيلة" (Yield-based). Owner-approved explicit approval (2026-08-16) to
 * implement, since this touches pricing-protected territory (CLAUDE.md rule
 * 3) — but this was the FIRST implementation of Digital-track costing, not
 * a modification of any existing approved calculation: `NewOrderPage.tsx`
 * showed a literal "قريبًا" placeholder for this track before this file
 * existed, and no other pricing file computes anything for it.
 *
 * Extended 2026-08-20 (also owner-approved, CLAUDE.md rule 3) —
 * "الداخلي في الديجيتال مش هيطبع على الربع كل مرة... محتاج تشوف وتعمل
 * سيرش ازاي هتعدل الديجيتال بحيث يتماشي مع كل الاوردرات": a second
 * printing machine that runs plain A4/A3 sheets directly (no packing/
 * Yield — one copy is always one whole sheet), typically used for a
 * book's interior pages rather than small Yield-packed pieces. Combined
 * with the owner's separate asks that day — quantity-tiered pricing
 * (admin-managed via `DigitalPriceTier`, replacing the old flat
 * `digitalPrintPricePerQuarter` constant), and fully independent price
 * tables per color mode (color/BW) and side-count (single/double) — every
 * digital component now picks one of 3 print bases × 2 color modes × 2
 * side-counts = 12 independent tier tables. `QUARTER`'s own Yield math is
 * completely unchanged from the 2026-08-16 formula; only where its print
 * price comes from changed (a tier lookup instead of one flat number).
 *
 * Deliberately independent of `sizeCalculation.ts`/`costCalculation.ts` —
 * same reasoning as `boardsCostCalculation.ts`: this track has its own
 * fixed feed-size constraint(s), not the family/tiering system the
 * Offset-paper tracks use.
 *
 * Pure functions only — no DB/HTTP access.
 */

export type DigitalPrintBasis = 'QUARTER' | 'A4_DIRECT' | 'A3_DIRECT';
export type DigitalColorMode = 'COLOR' | 'BW';
export type DigitalSides = 'SINGLE' | 'DOUBLE';

/** One row of an admin-managed quantity-tier price list — see `DigitalPriceTier` (Prisma) for the full 12-table structure this belongs to. */
export interface DigitalPriceTier {
  /** Inclusive lower bound; the engine picks the highest tier whose `minQuantity` is still ≤ the item's quantity. */
  minQuantity: number;
  pricePerUnit: number;
}

export interface DigitalPricingConstants {
  /** Machine feed size (§13.3, spec default 50×35cm) — configurable per rule 15, not hardcoded, in case the machine changes. Only meaningful for `printBasis: 'QUARTER'`. */
  digitalQuarterWidthCm: number;
  digitalQuarterHeightCm: number;
  /** "سعر سلوفان الربع" — sellophane cost for one full quarter-sheet. Only meaningful for `printBasis: 'QUARTER'` — the direct-sheet machine doesn't offer sellophane. */
  digitalSellophanePricePerQuarter: number;
  profitPercent: number;
  /** "أفرخ التهدير الافتراضية" — same Setting already used by `sizeCalculation.ts`'s sheet-count math (rule 5: reused, not duplicated), applied here too since Digital consumes full sheets the same way Offset paper jobs do. */
  wasteSheetsDefault: number;
}

export interface DigitalCostInput {
  printBasis: DigitalPrintBasis;
  colorMode: DigitalColorMode;
  sides: DigitalSides;
  /** The one (basis, colorMode, sides) tier table this component's own combination resolves to — the caller (service layer) picks the matching 1-of-12 table before calling this function; this function never sees the other 11. */
  printTiers: DigitalPriceTier[];
  pieceWidthCm: number;
  pieceHeightCm: number;
  quantity: number;
  /**
   * "Yield" — pieces per quarter-sheet, only meaningful for `printBasis:
   * 'QUARTER'`. The caller (NewOrderPage) auto-fills this from
   * `suggestYield` below, but Pre-Press can override it before final
   * pricing (§13.3.1) — required (and validated) only for QUARTER; ignored
   * for A4_DIRECT/A3_DIRECT, where one copy is always exactly one sheet.
   */
  yieldPerQuarter?: number;
  /** "سعر الفرخ" — resolved from the selected paper's `InventoryItem`/`SheetType`, same source as the LOOSE_PAPER/NOTEBOOK/FOLDER kinds. For QUARTER this is the price of the *big* sheet a quarter is cut from; for A4_DIRECT/A3_DIRECT the selected InventoryItem is presumed already A4/A3-sized stock, so this is the price of one whole sheet directly (no ÷4). */
  sheetPrice: number;
  /** Only meaningful for `printBasis: 'QUARTER'` — not offered for the direct-sheet machine. */
  sellophaneEnabled?: boolean;
  /** "سعر البشر" — optional, always caller-entered per piece (no stored constant, §13.3.2's own note). */
  boshrPricePerPiece?: number;
  settings: DigitalPricingConstants;
  profitPercentOverride?: number;
  /** Pre-summed manual "خدمات إضافية" amount — same treatment as every other item kind. */
  extraCosts?: number;
}

export interface DigitalCostResult {
  /** Only meaningful for QUARTER — always `true` for A4_DIRECT/A3_DIRECT (there's no "doesn't fit" case when a copy is already exactly one sheet). */
  fitsInQuarter: boolean;
  /** Only set for QUARTER when `!fitsInQuarter` — number of quarter-sheets one piece consumes. Always `null` for A4_DIRECT/A3_DIRECT. */
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
  /** Total quarter-sheets needed for the whole quantity — QUARTER only; `0` for A4_DIRECT/A3_DIRECT (see `sheetsNeeded` instead). */
  quartersNeeded: number;
  /** Full sheets consumed — mirrors `sizeCalculation.ts`'s `computeLooseSheetsNeeded`, feeds `OrderItem.sheetsConsumed` for the same generic inventory-deduction path every other paper-based kind already uses. QUARTER: `ceil(quartersNeeded / 4) + waste`. A4_DIRECT/A3_DIRECT: one sheet per copy (single- or double-sided both consume the same one physical sheet) `+ waste`. */
  sheetsNeeded: number;
}

export class DigitalCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigitalCalculationError';
  }
}

/**
 * Owner (2026-08-20) — "شرائح كمية أعدلها بنفسي من الإعدادات": picks the
 * highest tier whose `minQuantity` is still ≤ `quantity`, so an
 * open-ended table (no explicit upper bound per tier) just works — adding
 * a new highest tier extends coverage, it never needs to "close off" the
 * previous one.
 */
function findTierPrice(tiers: DigitalPriceTier[], quantity: number): number {
  let best: DigitalPriceTier | null = null;
  for (const tier of tiers) {
    if (tier.minQuantity <= quantity && (best === null || tier.minQuantity > best.minQuantity)) {
      best = tier;
    }
  }
  if (best === null) {
    throw new DigitalCalculationError('لا يوجد سعر طباعة معرّف لهذه الكمية — أضف شريحة كمية تبدأ من رقم أقل من أو يساوي الكمية المطلوبة');
  }
  return best.pricePerUnit;
}

/**
 * Auto-suggests Yield from piece vs. quarter-sheet dimensions (§13.3.1) —
 * a plain grid fit in the better of the two orientations (portrait vs.
 * landscape). This is a starting point only; trim margins and grain
 * direction are Pre-Press's call, applied by editing the suggested value
 * before submitting, not by this function. QUARTER basis only.
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

/** §13.3.2 — the Yield-based digital cost formula for `QUARTER`, print price now sourced from a quantity tier instead of one flat constant; a separate, simpler whole-sheet formula for `A4_DIRECT`/`A3_DIRECT`. */
export function calculateDigitalCost(input: DigitalCostInput): DigitalCostResult {
  const printPricePerUnit = findTierPrice(input.printTiers, input.quantity);
  const boshrCostPerPiece = input.boshrPricePerPiece ?? 0;
  const extraCosts = input.extraCosts ?? 0;
  const profitPercentUsed = input.profitPercentOverride ?? input.settings.profitPercent;

  if (input.printBasis === 'A4_DIRECT' || input.printBasis === 'A3_DIRECT') {
    // Owner (2026-08-20, "كل نسخة = ورقة كاملة واحدة") — no Yield/packing
    // at all: one copy always consumes exactly one whole sheet, single- or
    // double-sided alike (double-sided still prints on the same one
    // physical sheet, just both faces — see the tier table selection,
    // not this formula, for where the price actually differs). No
    // sellophane on this machine.
    const paperCostPerPiece = input.sheetPrice;
    const printCostPerPiece = printPricePerUnit;
    const costPerPiece = paperCostPerPiece + printCostPerPiece + boshrCostPerPiece;
    const subtotal = costPerPiece * input.quantity + extraCosts;
    const total = subtotal * (1 + profitPercentUsed / 100);
    const sheetsNeeded = input.quantity + input.settings.wasteSheetsDefault;

    return {
      fitsInQuarter: true,
      unitsNeeded: null,
      paperCostPerPiece,
      printCostPerPiece,
      sellophaneCostPerPiece: 0,
      boshrCostPerPiece,
      costPerPiece,
      quantity: input.quantity,
      extraCosts,
      subtotal,
      profitPercentUsed,
      total,
      quartersNeeded: 0,
      sheetsNeeded,
    };
  }

  // printBasis === 'QUARTER' — unchanged Yield math from the 2026-08-16
  // formula, only the print price's source changed.
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
    if (!Number.isFinite(input.yieldPerQuarter) || (input.yieldPerQuarter as number) <= 0) {
      throw new DigitalCalculationError('Yield must be a positive number for a piece that fits within a quarter-sheet');
    }
    const yieldPerQuarter = input.yieldPerQuarter as number;
    paperCostPerPiece = quarterSheetPrice / yieldPerQuarter;
    printCostPerPiece = printPricePerUnit / yieldPerQuarter;
    sellophaneCostPerPiece = sellophaneEnabled ? input.settings.digitalSellophanePricePerQuarter / yieldPerQuarter : 0;
  } else {
    unitsNeeded = Math.ceil(pieceAreaCm2 / quarterAreaCm2);
    paperCostPerPiece = quarterSheetPrice * unitsNeeded;
    printCostPerPiece = printPricePerUnit * unitsNeeded;
    sellophaneCostPerPiece = sellophaneEnabled ? input.settings.digitalSellophanePricePerQuarter * unitsNeeded : 0;
  }

  const costPerPiece = paperCostPerPiece + printCostPerPiece + sellophaneCostPerPiece + boshrCostPerPiece;
  const subtotal = costPerPiece * input.quantity + extraCosts;
  const total = subtotal * (1 + profitPercentUsed / 100);

  // How much physical paper this job actually consumes — same "quarters
  // needed" concept whether the piece fits within one quarter (several
  // pieces share a quarter, per Yield) or needs several quarters each.
  const quartersNeeded = fitsInQuarter
    ? Math.ceil(input.quantity / (input.yieldPerQuarter as number))
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

/**
 * Multi-component digital items (2026-08-17, owner-approved formula — see
 * CLAUDE.md rule 3). A magazine-style item (cover on one material, interior
 * on another) is priced as a list of arbitrary named components, each
 * computed via a fully independent, unmodified call to `calculateDigitalCost`
 * above (own size/machine/material — exactly as if it were its own separate
 * Digital item, e.g. cover on QUARTER, interior on A4_DIRECT), then summed.
 *
 * `extraCosts` (the manual "خدمات إضافية" amount) is applied to the first
 * component only so it isn't double-counted across components; every
 * component shares one `profitPercentOverride` (one margin per order item,
 * not per component). Since `total_i = subtotal_i * (1 + p/100)` with the
 * same `p` for every component, `sum(total_i) = sum(subtotal_i) * (1+p/100)`
 * algebraically — for a single component this is byte-identical to calling
 * `calculateDigitalCost` directly, not an approximation.
 */
export interface DigitalComponentInput extends DigitalCostInput {
  label: string;
  inventoryItemId: string;
}

export interface DigitalComponentBreakdown extends DigitalCostResult {
  label: string;
  inventoryItemId: string;
}

export interface DigitalMultiComponentCostResult {
  total: number;
  subtotal: number;
  extraCosts: number;
  profitPercentUsed: number;
  components: DigitalComponentBreakdown[];
}

export function calculateDigitalMultiComponentCost(components: DigitalComponentInput[]): DigitalMultiComponentCostResult {
  if (components.length === 0) {
    throw new DigitalCalculationError('At least one digital component is required');
  }

  const results: DigitalComponentBreakdown[] = components.map((component, idx) => {
    const result = calculateDigitalCost({ ...component, extraCosts: idx === 0 ? (component.extraCosts ?? 0) : 0 });
    return { ...result, label: component.label, inventoryItemId: component.inventoryItemId };
  });

  const total = results.reduce((sum, r) => sum + r.total, 0);
  const subtotal = results.reduce((sum, r) => sum + r.subtotal, 0);

  return {
    total,
    subtotal,
    extraCosts: results[0].extraCosts,
    profitPercentUsed: results[0].profitPercentUsed,
    components: results,
  };
}
