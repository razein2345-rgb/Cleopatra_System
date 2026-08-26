/**
 * FEATURE-007 PE-C — boards & signage costing (§3.8).
 *
 * Deliberately independent of `sizeCalculation.ts`/`costCalculation.ts` —
 * the spec itself frames this section as "مستقل بالكامل" (fully
 * independent): priced by the meter, not the sheet, no size-family
 * tiering, and — unlike every other item kind — **no profit margin is
 * applied here at all**. The per-meter price in `Setting` already has
 * margin baked in, so `total` below is the final customer price directly.
 *
 * Pure functions only — no DB/HTTP access.
 */

export type BoardMaterial = 'BANNER' | 'VINYL_NORMAL' | 'VINYL_PRINT_CUT' | 'FLEX' | 'SEASRO';

export interface BoardsPricingConstants {
  boardsBannerNoDesign: number;
  boardsBannerWithDesign: number;
  boardsVinylNormalNoSello: number;
  boardsVinylNormalWithSello: number;
  boardsVinylPrintCutNoSello: number;
  boardsVinylPrintCutWithSello: number;
  boardsFlex: number;
  boardsSeasro: number;
  /** Gap between pieces, in millimeters (spec default 5mm) — only used by VINYL_PRINT_CUT's piece-packing math. */
  boardsGapMM: number;
}

/**
 * Owner (2026-08-26, "هيتصمم ويتبعت للمورد... هكتبلك سعر المتر عليا انا
 * سعر المورد في الإعدادات") — جزء 4 of the treasury/suppliers/reports
 * initiative. What the EXTERNAL supplier charges us per meter, never shown
 * to the customer — one rate per material (no with/without-design or
 * with/without-sellophane split like the sell side: those are OUR
 * add-ons, not the supplier's raw print price). Optional — a board item
 * created before this was configured, or for a material still at its
 * default 0, has no known supplier cost yet, and `supplierCost` below
 * reflects that honestly (0) rather than inventing one.
 */
export interface BoardsSupplierPricingConstants {
  boardsBannerSupplierCost: number;
  boardsVinylNormalSupplierCost: number;
  boardsVinylPrintCutSupplierCost: number;
  boardsFlexSupplierCost: number;
  boardsSeasroSupplierCost: number;
}

export interface BoardsCostInput {
  material: BoardMaterial;
  /** Piece dimensions in centimeters. */
  widthCm: number;
  heightCm: number;
  quantity: number;
  /** BANNER only. */
  hasDesign?: boolean;
  /** VINYL_NORMAL / VINYL_PRINT_CUT only. */
  hasSellophane?: boolean;
  settings: BoardsPricingConstants;
  /** Optional — omitted callers (e.g. a live price preview) simply get `supplierCost: undefined` back, no error. */
  supplierSettings?: BoardsSupplierPricingConstants;
  /**
   * FEATURE-007 — owner-approved manual "خدمات إضافية" amount (2026-08-10,
   * see PRICING_ENGINE_SPEC.md §4's amendment), added directly to `total`
   * — never multiplied by a margin, since boards never apply one at all.
   */
  extraCosts?: number;
  /**
   * Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده") — replaces
   * the settings-resolved `pricePerMeter` for this item only; the existing
   * area/piece-packing multiplication that follows is unchanged, same
   * "override the per-unit price, not the total" shape used throughout
   * `costCalculation.ts`.
   */
  pricePerMeterOverride?: number;
  /**
   * Owner (same day, "في نقطة لازم النسبة تكون موجودة بردو... ده وده وانا
   * اختار") — an alternative to `pricePerMeterOverride`: a markup/markdown
   * percentage applied on top of the settings-resolved `pricePerMeter`
   * instead of typing a flat replacement price (positive = markup,
   * negative = discount off the resolved rate). Mutually exclusive with
   * `pricePerMeterOverride` at the caller/UI level — only one mode is
   * active per item.
   */
  pricePerMeterMarkupPercent?: number;
}

export interface BoardsCostResult {
  pricePerMeter: number;
  // The regular (area-based) path — BANNER/VINYL_NORMAL/FLEX/SEASRO.
  pieceAreaM2?: number;
  totalAreaM2?: number;
  // The VINYL_PRINT_CUT path — piece-packing per square meter.
  piecesPerMeter?: number;
  metersNeeded?: number;
  extraCosts: number;
  /** The final customer price — no margin applied on top of this. */
  total: number;
  /** What we owe the external supplier for this item — `undefined` when `supplierSettings` wasn't passed in. Never includes `extraCosts` (those are our own add-ons, not the supplier's charge). */
  supplierCost?: number;
}

export class BoardsCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardsCalculationError';
  }
}

function resolvePricePerMeter(input: BoardsCostInput): number {
  switch (input.material) {
    case 'BANNER':
      return input.hasDesign ? input.settings.boardsBannerWithDesign : input.settings.boardsBannerNoDesign;
    case 'VINYL_NORMAL':
      return input.hasSellophane ? input.settings.boardsVinylNormalWithSello : input.settings.boardsVinylNormalNoSello;
    case 'VINYL_PRINT_CUT':
      return input.hasSellophane ? input.settings.boardsVinylPrintCutWithSello : input.settings.boardsVinylPrintCutNoSello;
    case 'FLEX':
      return input.settings.boardsFlex;
    case 'SEASRO':
      return input.settings.boardsSeasro;
  }
}

function resolveSupplierPricePerMeter(material: BoardMaterial, supplierSettings: BoardsSupplierPricingConstants): number {
  switch (material) {
    case 'BANNER':
      return supplierSettings.boardsBannerSupplierCost;
    case 'VINYL_NORMAL':
      return supplierSettings.boardsVinylNormalSupplierCost;
    case 'VINYL_PRINT_CUT':
      return supplierSettings.boardsVinylPrintCutSupplierCost;
    case 'FLEX':
      return supplierSettings.boardsFlexSupplierCost;
    case 'SEASRO':
      return supplierSettings.boardsSeasroSupplierCost;
  }
}

/** §3.8 — boards & signage. */
export function calculateBoardsCost(input: BoardsCostInput): BoardsCostResult {
  const resolvedPricePerMeter = resolvePricePerMeter(input);
  const pricePerMeter =
    input.pricePerMeterOverride ??
    (input.pricePerMeterMarkupPercent !== undefined
      ? resolvedPricePerMeter * (1 + input.pricePerMeterMarkupPercent / 100)
      : resolvedPricePerMeter);
  const extraCosts = input.extraCosts ?? 0;
  const supplierPricePerMeter = input.supplierSettings ? resolveSupplierPricePerMeter(input.material, input.supplierSettings) : undefined;

  if (input.material === 'VINYL_PRINT_CUT') {
    const gapCm = input.settings.boardsGapMM / 10;
    const perRow = Math.floor((100 + gapCm) / (input.widthCm + gapCm));
    const perCol = Math.floor((100 + gapCm) / (input.heightCm + gapCm));
    const piecesPerMeter = perRow * perCol;
    if (piecesPerMeter <= 0) {
      throw new BoardsCalculationError('Piece dimensions too large to fit even one piece per square meter');
    }
    const metersNeeded = Math.ceil(input.quantity / piecesPerMeter);
    return {
      pricePerMeter,
      piecesPerMeter,
      metersNeeded,
      extraCosts,
      total: metersNeeded * pricePerMeter + extraCosts,
      supplierCost: supplierPricePerMeter !== undefined ? metersNeeded * supplierPricePerMeter : undefined,
    };
  }

  const pieceAreaM2 = (input.widthCm / 100) * (input.heightCm / 100);
  const totalAreaM2 = pieceAreaM2 * input.quantity;
  return {
    pricePerMeter,
    pieceAreaM2,
    totalAreaM2,
    extraCosts,
    total: totalAreaM2 * pricePerMeter + extraCosts,
    supplierCost: supplierPricePerMeter !== undefined ? totalAreaM2 * supplierPricePerMeter : undefined,
  };
}
