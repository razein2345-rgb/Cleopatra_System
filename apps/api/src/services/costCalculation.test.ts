import { describe, expect, it } from 'vitest';
import {
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookCost,
  calculateNotebookMultiMaterialCost,
  calculateProductOrServiceCost,
  resolveNumbering,
  type PricingConstants,
  type SizeFamilyInput,
} from '@cleopatra/shared';

// Module under test lives in packages/shared/src/pricing/costCalculation.ts
// (pure functions, no DB dependency) — tested here for the same reason as
// sizeCalculation.test.ts: apps/api already has vitest configured.

const FAMILIES: SizeFamilyInput[] = [
  {
    key: 'standard',
    base: 'REGULAR',
    entries: [
      { label: '12.5×17.5', piecesPerSheet: 32 },
      { label: '17.5×25', piecesPerSheet: 16 },
      { label: '25×35', piecesPerSheet: 8 },
      { label: '35×50', piecesPerSheet: 4 },
      { label: '50×70', piecesPerSheet: 2 },
      { label: '70×100', piecesPerSheet: 1 },
    ],
  },
  {
    key: 'extra2',
    base: 'REGULAR',
    entries: [
      { label: '10×15', piecesPerSheet: 44 },
      { label: '15×20', piecesPerSheet: 22 },
      { label: '20×30', piecesPerSheet: 11 },
      { label: '30×40', piecesPerSheet: 5 },
    ],
  },
  {
    key: 'koshiaGayer',
    base: 'GAYER',
    entries: [
      { label: '11×16.5', piecesPerSheet: 32 },
      { label: '16.5×22', piecesPerSheet: 16 },
      { label: '22×33', piecesPerSheet: 8 },
      { label: '33×44', piecesPerSheet: 4 },
      { label: '44×66', piecesPerSheet: 2 },
      { label: '66×88', piecesPerSheet: 1 },
    ],
  },
];

const SETTINGS: PricingConstants = {
  notebookThreshold: 30,
  looseThreshold: 3000,
  wasteSheetsDefault: 2,
  zincPrice: 75,
  printRunPrice: 75,
  numberingRunPrice: 75,
  designPrice: 75,
  profitPercent: 25,
  envelopeDesignPrice: 100,
  envelopeZincPrice: 75,
  envelopePrintRunPrice: 100,
  sellophanePricePerSheet: 4,
};

describe('resolveNumbering — §3.3', () => {
  it('g1 (extra2) targets 20×30', () => {
    const result = resolveNumbering({ familyKey: 'extra2', realLabel: '10×15', families: FAMILIES });
    expect(result.targetLabel).toBe('20×30');
    expect(result.repeat).toBe(4); // area(20×30)=600 / area(10×15)=150 = 4
  });
});

describe('calculateNotebookCost — confirmed worked example (PRICING_ENGINE_SPEC.md §3.5)', () => {
  it('100 notebooks, original+3 copies, 10×15, numbering from 1', () => {
    const result = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 1,
      isNewDesign: true,
      numbering: { startNumber: 1 },
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });

    expect(result.totalSheetsFlat).toBe(20000);
    expect(result.printRuns).toBe(3);
    expect(result.sheetsNeeded).toBe(502);
    expect(result.numberingRuns).toBe(5);

    // NOTE — discrepancy found against the spec document itself, not
    // invented here: PRICING_ENGINE_SPEC.md §3.5 states
    // "نهاية الترقيم = 1 + (100 × 50) - 1 = 500", but that arithmetic is
    // wrong on its own terms — 1 + (100*50) - 1 = 5000, not 500 (the
    // stated formula and the stated inputs are unambiguous; only the
    // written answer doesn't match them, most likely a dropped digit).
    // Implemented the formula literally; flagged to the owner rather than
    // silently "corrected" to match the doc's stated (arithmetically
    // inconsistent) answer.
    expect(result.numberingEnd).toBe(5000);

    expect(result.zincCost).toBe(75); // 75 * 1 color
    expect(result.printCost).toBe(225); // 3 runs * 75
    expect(result.numberingCost).toBe(375); // 5 runs * 75
    expect(result.paperCost).toBe(1506); // 502 sheets * 3
    expect(result.bindingCost).toBe(250); // 100 * 2.5
    expect(result.designCost).toBe(75);

    const expectedSubtotal = 75 + 75 + 225 + 375 + 1506 + 250; // design+zinc+print+numbering+paper+binding
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.total).toBeCloseTo(expectedSubtotal * 1.25, 5);
  });

  it('numberingRunPriceOverride replaces the PER-RUN price, not the total (owner, 2026-08-25)', () => {
    const result = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 1,
      isNewDesign: true,
      numbering: { startNumber: 1 },
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
      numberingRunPriceOverride: 10,
    });

    expect(result.numberingRuns).toBe(5);
    // 5 runs * 10 (overridden per-run price) — NOT 10 flat.
    expect(result.numberingCost).toBe(50);
  });

  it('paperCostOverride replaces the paper cost TOTAL directly, independent of sheetPrice (owner, 2026-08-26)', () => {
    const withoutOverride = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 1,
      isNewDesign: true,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(withoutOverride.paperCost).toBe(1506); // 502 sheets * 3 — unaffected baseline

    const withOverride = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 1,
      isNewDesign: true,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
      paperCostOverride: 1000,
    });
    expect(withOverride.paperCost).toBe(1000); // flat override, not 502*3
    expect(withOverride.sheetsNeeded).toBe(502); // sheet count itself is unaffected — only the price changes
  });

  it('double-sided printing doubles run count, not sheet count (owner, 2026-08-27, "مش موجود عندي اوبشن إني اشتغل على وجهين في الدفاتر")', () => {
    const oneSided = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 1,
      isNewDesign: true,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    const twoSided = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      colorCount: 1,
      sides: 2,
      isNewDesign: true,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(twoSided.printRuns).toBe(oneSided.printRuns * 2);
    expect(twoSided.sheetsNeeded).toBe(oneSided.sheetsNeeded);
    expect(twoSided.paperCost).toBe(oneSided.paperCost);
  });

  it('different sides (owner, 2026-09-01) — notebook applies the same sum-of-colors formula as loose paper', () => {
    const sameSides = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_ONLY',
      colorCount: 2,
      sides: 2,
      isNewDesign: false,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    const genuinelyDifferent = calculateNotebookCost({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_ONLY',
      colorCount: 2,
      sides: 2,
      secondSideColorCount: 1,
      isNewDesign: false,
      bindingPricePerNotebook: 2.5,
      sheetPrice: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // colorCount 2 + secondSideColorCount 1 = 3 total, not colorCount*sides = 4.
    expect(genuinelyDifferent.zincCost).toBe(75 * 3);
    expect(genuinelyDifferent.zincCost).toBeLessThan(sameSides.zincCost);
    expect(genuinelyDifferent.sheetsNeeded).toBe(sameSides.sheetsNeeded); // sides never touch sheet count
  });
});

describe('calculateNotebookMultiMaterialCost — per-copy independent print job (owner, 2026-09-01)', () => {
  const baseInput = {
    familyKey: 'standard',
    realLabel: '25×35',
    notebookQuantity: 500,
    contentType: 'ORIGINAL_PLUS_COPIES' as const,
    copies: 1,
    colorCount: 1,
    sides: 1 as const,
    isNewDesign: false,
    bindingPricePerNotebook: 2,
    sheetPrice: 5,
    families: FAMILIES,
    settings: SETTINGS,
  };

  it('sheet-price-only override (no print fields) stays byte-identical to calculateNotebookCost (regression guard)', () => {
    const base = calculateNotebookCost(baseInput);
    const result = calculateNotebookMultiMaterialCost(baseInput, [{ role: 'COPY_1', sheetPrice: 8 }]);
    expect(result.zincCost).toBe(base.zincCost);
    expect(result.printRuns).toBe(base.printRuns);
    expect(result.printCost).toBe(base.printCost);
    expect(result.designCost).toBe(base.designCost);
  });

  it('owner\'s real job (500 دفتر حر ن 235، 25×35): الأصل مكون من ورقتين، ورقة "شبه بعض" وورقة "مختلفين" — each copy is its own independent print job, not one shared setting', () => {
    // Isolated reference: "runs per unit of color" for a 500×50-page block
    // at this size, with colorCount=1/sides=1 so totalColorCount=1 and
    // printRuns IS that reference count directly — used below to predict
    // each role's own runs without duplicating resolveCalcSize's tiering.
    const reference = calculateNotebookCost({ ...baseInput, contentType: 'ORIGINAL_ONLY', originalPagesOverride: 50 });
    const runsPerColor = reference.printRuns;

    const result = calculateNotebookMultiMaterialCost(baseInput, [
      // ORIGINAL left with no print override at all — falls back to the
      // notebook-wide "same shape" setting (colorCount:1, sides:1 above).
      { role: 'COPY_1', sheetPrice: 6, colorCount: 2, sides: 2, secondSideColorCount: 1, isNewDesign: true, secondSideIsNewDesign: true },
    ]);

    // ORIGINAL: totalColorCount = 1 (colorCount 1 × sides 1, untouched).
    // COPY_1: totalColorCount = 2 + 1 = 3 (genuinely different sides, summed not multiplied).
    expect(result.zincCost).toBe(75 * 1 + 75 * 3);
    expect(result.printRuns).toBe(runsPerColor * 1 + runsPerColor * 3);
    expect(result.printCost).toBe(result.printRuns * 75);
    // ORIGINAL: isNewDesign false → 0. COPY_1: both sides new → designPrice × 2.
    expect(result.designCost).toBe(75 * 2);
    // Paper split/binding/numbering are untouched by any of this.
    expect(result.paperCost).toBe(result.materials.reduce((sum, m) => sum + m.paperCost, 0));
    expect(result.bindingCost).toBe(baseInput.bindingPricePerNotebook * baseInput.notebookQuantity);
  });

  it('a copy with no print override at all still shares the pooled zinc plate with the original (only an explicit override carves a role out into its own independent plate)', () => {
    // sheetPrice-only override (no colorCount/sides/... fields) — same as
    // the very first test above, just phrased against the pool directly:
    // ORIGINAL and COPY_1 are still one combined print job, one shared
    // zinc cost, because neither one was told it's printed independently.
    const pooled = calculateNotebookMultiMaterialCost(baseInput, [{ role: 'COPY_1', sheetPrice: 5 }]);
    const base = calculateNotebookCost(baseInput);
    expect(pooled.zincCost).toBe(base.zincCost); // one plate for the whole notebook, not two
  });

  it('an explicit per-role override always charges its own zinc plate, even when the numbers happen to match the notebook default — a separate design/paper needs a separate plate regardless of color count', () => {
    const carvedOut = calculateNotebookMultiMaterialCost(baseInput, [
      { role: 'COPY_1', sheetPrice: 5, colorCount: 1, sides: 1, isNewDesign: false },
    ]);
    const base = calculateNotebookCost(baseInput);
    expect(carvedOut.zincCost).toBe(base.zincCost * 2); // ORIGINAL's plate (pool) + COPY_1's own plate
  });
});

describe('calculateLoosePaperCost — gayer sheets never tier (§3.4)', () => {
  it('direct piecesPerSheet lookup, no numbering requested', () => {
    const result = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // repeat = 8 (piecesPerSheet), sheetsNeeded = ceil(100/8) + 2 = 15
    expect(result.sheetsNeeded).toBe(15);
    expect(result.paperCost).toBe(75); // 15 * 5
    expect(result.zincCost).toBe(150); // 75 * 2 colors
    expect(result.printRuns).toBe(2); // ceil(100/1000)=1 * 2 colors * 1 side
    expect(result.numberingCost).toBe(0);
    expect(result.numberingEnd).toBeNull();
    expect(result.designCost).toBe(0);
  });

  it('double-sided printing doubles run count, not sheet count', () => {
    const oneSided = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 1,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    const twoSided = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 1,
      sides: 2,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(twoSided.printRuns).toBe(oneSided.printRuns * 2);
    expect(twoSided.sheetsNeeded).toBe(oneSided.sheetsNeeded);
  });

  it('different sides (owner, 2026-09-01, "لما اختار وجهين... مختلفين هيبقى في سعر للتصميم التاني وسعر للزنكاية التانية") — each side its own color count, summed for zinc/print runs; sheet count and paper cost stay untouched', () => {
    const sameSides = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 2,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // Same sides with colorCount 2 → total color count 4 (2*2), identical
    // to "different sides" with side1=2 + side2=2 — confirms the two
    // formulas agree exactly when both sides happen to match.
    const differentSidesButEqual = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 2,
      secondSideColorCount: 2,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(differentSidesButEqual.printRuns).toBe(sameSides.printRuns);
    expect(differentSidesButEqual.zincCost).toBe(sameSides.zincCost);
    expect(differentSidesButEqual.paperCost).toBe(sameSides.paperCost);

    // Genuinely different color counts: side 1 = 2 colors, side 2 = 1 color.
    const genuinelyDifferent = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 2,
      secondSideColorCount: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // Total color count = 2 + 1 = 3 (not colorCount * sides = 4).
    expect(genuinelyDifferent.zincCost).toBe(75 * 3);
    expect(genuinelyDifferent.printRuns).toBe(Math.ceil(100 / 1000) * 3);
    expect(genuinelyDifferent.paperCost).toBe(sameSides.paperCost); // sheet count never affected by sides

    // Design cost: each side's own "تصميم جديد" billed independently once distinguished.
    const bothNewDesigns = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 2,
      secondSideColorCount: 1,
      isNewDesign: true,
      secondSideIsNewDesign: true,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(bothNewDesigns.designCost).toBe(75 * 2); // designPrice charged twice, once per side
  });
});

// No confirmed worked example exists for envelopes/folders (unlike
// notebooks) — these tests check the formula is applied exactly as
// written in PRICING_ENGINE_SPEC.md §3.6-3.7, not against real business
// numbers. Flagged in 02_PLAN.md as a known confidence gap.
describe('calculateEnvelopeCost — §3.6 (no confirmed worked example, formula-literal only)', () => {
  it('applies envelope-specific constants, independent of loose-paper/notebook ones', () => {
    const result = calculateEnvelopeCost({
      quantity: 2500,
      colorCount: 2,
      isNewDesign: true,
      readyEnvelopePricePerPiece: 1.5,
      settings: SETTINGS,
    });
    expect(result.designCost).toBe(100); // envelopeDesignPrice
    expect(result.zincCost).toBe(150); // envelopeZincPrice(75) * 2 colors
    expect(result.printRuns).toBe(6); // ceil(2500/1000)=3 * 2 colors
    expect(result.printCost).toBe(600); // 6 * envelopePrintRunPrice(100)
    expect(result.envelopesCost).toBe(3750); // 2500 * 1.5
    const expectedSubtotal = 100 + 150 + 600 + 3750;
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.total).toBeCloseTo(expectedSubtotal * 1.25, 5);
  });

  it('no design cost when reusing an existing design', () => {
    const result = calculateEnvelopeCost({
      quantity: 1000,
      colorCount: 1,
      isNewDesign: false,
      readyEnvelopePricePerPiece: 1,
      settings: SETTINGS,
    });
    expect(result.designCost).toBe(0);
  });
});

describe('calculateFolderCost — §3.7 (no confirmed worked example, formula-literal only)', () => {
  it('reuses loose-paper sheet/zinc/print math, adds sello + manual line costs, margin applied once', () => {
    const looseEquivalent = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 1,
      isNewDesign: true,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });

    const result = calculateFolderCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 1,
      isNewDesign: true,
      sheetPrice: 5,
      sellophaneEnabled: true,
      riza: 50,
      jarab: 30,
      forma: 20,
      taksir: 10,
      families: FAMILIES,
      settings: SETTINGS,
    });

    expect(result.sheetsNeeded).toBe(looseEquivalent.sheetsNeeded);
    expect(result.paperCost).toBe(looseEquivalent.paperCost);
    expect(result.zincCost).toBe(looseEquivalent.zincCost);
    expect(result.printCost).toBe(looseEquivalent.printCost);
    expect(result.designCost).toBe(looseEquivalent.designCost);
    expect(result.selloCost).toBe(looseEquivalent.sheetsNeeded * 4); // sellophanePricePerSheet

    const expectedSubtotal =
      result.designCost + result.zincCost + result.printCost + result.paperCost + 50 + 30 + 20 + 10 + result.selloCost;
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.total).toBeCloseTo(expectedSubtotal * 1.25, 5);
    // Folders' own total must not equal the loose-paper equivalent's total
    // — margin is applied once across the *full* folder subtotal
    // (including sello/riza/jarab/forma/taksir), not on the paper portion
    // alone and then re-applied.
    expect(result.total).not.toBeCloseTo(looseEquivalent.total, 2);
  });

  it('optional line costs default to 0, sello skipped when disabled', () => {
    const result = calculateFolderCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 1,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      sellophaneEnabled: false,
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(result.selloCost).toBe(0);
    expect(result.riza).toBe(0);
    expect(result.jarab).toBe(0);
    expect(result.forma).toBe(0);
    expect(result.taksir).toBe(0);
  });
});

describe('calculateProductOrServiceCost — §3.9 (unit price already includes everything, no markup)', () => {
  it('is a plain unit price × quantity, nothing more', () => {
    expect(calculateProductOrServiceCost(45.5, 3)).toBe(136.5);
  });

  it('adds extraCosts on top, still no margin', () => {
    expect(calculateProductOrServiceCost(45.5, 3, 20)).toBe(156.5);
  });
});

// FEATURE-007 — owner-approved manual overrides (2026-08-10), amending
// PRICING_ENGINE_SPEC.md §4. See costCalculation.ts's own doc comments.
describe('owner-approved manual overrides — profitPercentOverride/zincCostOverride/printCostOverride/extraCosts', () => {
  it('profitPercentOverride replaces the global margin for this item only', () => {
    const withDefault = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 1,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
    });
    const withOverride = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 1,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
      profitPercentOverride: 40,
    });
    expect(withDefault.profitPercentUsed).toBe(25);
    expect(withOverride.profitPercentUsed).toBe(40);
    expect(withOverride.subtotal).toBe(withDefault.subtotal);
    expect(withOverride.total).toBeCloseTo(withDefault.subtotal * 1.4, 5);
  });

  it('zincPriceOverride/printRunPriceOverride replace the per-unit price, still multiplied by colorCount/printRuns like the automatic path', () => {
    const result = calculateLoosePaperCost({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      colorCount: 2,
      sides: 1,
      isNewDesign: false,
      sheetPrice: 5,
      families: FAMILIES,
      settings: SETTINGS,
      zincPriceOverride: 999,
      printRunPriceOverride: 111,
    });
    // GAYER, quantity 100, sides 1, colorCount 2 → printRuns = ceil(100/1000) * 2 * 1 = 2.
    expect(result.printRuns).toBe(2);
    expect(result.zincCost).toBe(999 * 2);
    expect(result.printCost).toBe(111 * 2);
    expect(result.paperCost).toBe(75); // unaffected — same as the non-override test above
    expect(result.subtotal).toBe(999 * 2 + 111 * 2 + 75); // + numberingCost(0) + designCost(0) + extraCosts(0)
  });

  it('extraCosts (manual خدمات إضافية) is added to subtotal before margin', () => {
    const result = calculateEnvelopeCost({
      quantity: 1000,
      colorCount: 1,
      isNewDesign: false,
      readyEnvelopePricePerPiece: 1,
      settings: SETTINGS,
      extraCosts: 50,
    });
    // baseline (no extras): designCost(0) + zinc(75) + printCost(1*100=100) + envelopesCost(1000) = 1175
    expect(result.subtotal).toBe(1175 + 50);
    expect(result.total).toBeCloseTo((1175 + 50) * 1.25, 5);
  });

});
