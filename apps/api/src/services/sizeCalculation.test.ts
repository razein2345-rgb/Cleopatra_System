import { describe, expect, it } from 'vitest';
import {
  computeLooseSheetsNeeded,
  computeNotebookSheetsNeeded,
  resolveCalcSize,
  SizeCalculationError,
  type SizeFamilyInput,
  type TieringSettings,
} from '@cleopatra/shared';

// Module under test lives in packages/shared/src/pricing/sizeCalculation.ts
// (pure functions, no DB dependency) — tested here because apps/api already
// has vitest configured and this is where the calc gets consumed (Inventory
// deduction, FEATURE-007 M2).

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
    key: 'foolscap',
    base: 'REGULAR',
    entries: [
      { label: '11.5×16.5', piecesPerSheet: 36 },
      { label: '16.5×23', piecesPerSheet: 18 },
      { label: '23×33', piecesPerSheet: 9 },
    ],
  },
  {
    key: 'extra1',
    base: 'REGULAR',
    entries: [
      { label: '10×14', piecesPerSheet: 50 },
      { label: '14×20', piecesPerSheet: 25 },
      { label: '20×28', piecesPerSheet: 10 },
      { label: '28×40', piecesPerSheet: 5 },
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
    key: 'gawab',
    base: 'REGULAR',
    entries: [
      { label: '11×14', piecesPerSheet: 44 },
      { label: '14×22', piecesPerSheet: 22 },
      { label: '22×28', piecesPerSheet: 10 },
      { label: '28×42', piecesPerSheet: 5 },
    ],
  },
  {
    key: 'aSeries',
    base: 'REGULAR',
    entries: [
      { label: 'A7', piecesPerSheet: 64 },
      { label: 'A6', piecesPerSheet: 32 },
      { label: 'A5', piecesPerSheet: 16 },
      { label: 'A4', piecesPerSheet: 8 },
      { label: 'A3', piecesPerSheet: 4 },
      { label: 'A2', piecesPerSheet: 2 },
      { label: 'A1', piecesPerSheet: 1 },
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

const SETTINGS: TieringSettings = {
  notebookThreshold: 30,
  looseThreshold: 3000,
  wasteSheetsDefault: 2,
};

describe('sizeCalculation — confirmed worked example (PRICING_ENGINE_SPEC.md §3.5)', () => {
  it('100 notebooks, original+3 copies, 10×15, group g1 → calc size 30×40, repeat 8, 502 sheets', () => {
    const calc = resolveCalcSize({
      familyKey: 'extra2',
      realLabel: '10×15',
      quantity: 100,
      jobKind: 'NOTEBOOK',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('30×40');
    expect(calc.repeat).toBe(8);
    expect(calc.calcPiecesPerSheet).toBe(5);

    const sheetsNeeded = computeNotebookSheetsNeeded({
      familyKey: 'extra2',
      realLabel: '10×15',
      notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES',
      copies: 3,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // totalSheetsFlat = 100 * (50 + 50*3) = 20,000
    // units = 20,000 / 8 = 2,500
    // sheetsNeeded = ceil(2,500 / 5) + 2 = 502
    expect(sheetsNeeded).toBe(502);
  });

  it('below the notebook threshold, stays on the smaller calc size', () => {
    const calc = resolveCalcSize({
      familyKey: 'extra2',
      realLabel: '10×15',
      quantity: 10, // < notebookThreshold (30)
      jobKind: 'NOTEBOOK',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('20×30');
    expect(calc.repeat).toBe(4); // area(20×30)=600 / area(10×15)=150 = 4
  });
});

describe('sizeCalculation — area-based repeat (MASTER_HANDOFF §24 worked example)', () => {
  it('A5 fits 4x into A3', () => {
    // MASTER_HANDOFF.md §24's own example is a notebook job (100 دفتر
    // روشتات) — quantity 100 clears notebookThreshold (30) but not
    // looseThreshold (3000), so jobKind matters here.
    const calc = resolveCalcSize({
      familyKey: 'aSeries',
      realLabel: 'A5',
      quantity: 100,
      jobKind: 'NOTEBOOK',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('A3');
    expect(calc.repeat).toBe(4);
  });
});

describe('sizeCalculation — A-series special threshold (A4 uses 10, not the group threshold)', () => {
  it('A4 tiers to A3 above quantity 10', () => {
    const calc = resolveCalcSize({
      familyKey: 'aSeries',
      realLabel: 'A4',
      quantity: 11,
      jobKind: 'LOOSE_PAPER',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('A3');
  });

  it('A4 stays A4 at or below quantity 10', () => {
    const calc = resolveCalcSize({
      familyKey: 'aSeries',
      realLabel: 'A4',
      quantity: 10,
      jobKind: 'LOOSE_PAPER',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('A4');
    expect(calc.repeat).toBe(1);
  });
});

describe('sizeCalculation — gayer sheets never tier (§3.4)', () => {
  it('direct piecesPerSheet lookup regardless of quantity', () => {
    const sheetsNeeded = computeLooseSheetsNeeded({
      familyKey: 'koshiaGayer',
      realLabel: '22×33',
      quantity: 100,
      families: FAMILIES,
      settings: SETTINGS,
    });
    // repeat = 8 (piecesPerSheet), units = ceil(100/8) + waste(2) = 13 + 2 = 15
    expect(sheetsNeeded).toBe(15);
  });
});

describe('sizeCalculation — fixed single-size group (g5, foolscap)', () => {
  it('always calcs to 23×33 regardless of quantity', () => {
    const below = resolveCalcSize({
      familyKey: 'foolscap',
      realLabel: '11.5×16.5',
      quantity: 1,
      jobKind: 'LOOSE_PAPER',
      families: FAMILIES,
      settings: SETTINGS,
    });
    const above = resolveCalcSize({
      familyKey: 'foolscap',
      realLabel: '11.5×16.5',
      quantity: 100000,
      jobKind: 'LOOSE_PAPER',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(below.calcLabel).toBe('23×33');
    expect(above.calcLabel).toBe('23×33');
  });
});

describe('sizeCalculation — real size already at/above the group tiering size', () => {
  it('prints as requested, no further tiering (repeat 1)', () => {
    const calc = resolveCalcSize({
      familyKey: 'extra2',
      realLabel: '30×40', // already the group's "above" size
      quantity: 100,
      jobKind: 'LOOSE_PAPER',
      families: FAMILIES,
      settings: SETTINGS,
    });
    expect(calc.calcLabel).toBe('30×40');
    expect(calc.repeat).toBe(1);
  });
});

describe('sizeCalculation — error handling', () => {
  it('throws on unknown family', () => {
    expect(() =>
      resolveCalcSize({
        familyKey: 'doesNotExist',
        realLabel: '10×15',
        quantity: 1,
        jobKind: 'LOOSE_PAPER',
        families: FAMILIES,
        settings: SETTINGS,
      }),
    ).toThrow(SizeCalculationError);
  });

  it('throws on unknown size within a known family', () => {
    expect(() =>
      resolveCalcSize({
        familyKey: 'extra2',
        realLabel: '99×99',
        quantity: 1,
        jobKind: 'LOOSE_PAPER',
        families: FAMILIES,
        settings: SETTINGS,
      }),
    ).toThrow(SizeCalculationError);
  });
});
