import { describe, it, expect } from 'vitest';
import {
  resolveCustomOffsetSize, resolveCustomOffsetNumbering, parseOffsetDimensions, fitOffsetPieces,
  calculateLoosePaperCost, calculateNotebookMultiMaterialCost, calculateNotebookCost, calculateFolderCost,
  computeLooseSheetsNeeded, type SizeFamilyInput, type PricingConstants,
} from '@cleopatra/shared';
import { computeItemPricing, PricingInputError, type PricingContext } from './pricingEngineService.js';

const families: SizeFamilyInput[] = [
  { key: 'standard', base: 'REGULAR', entries: [
    { label: '17.5×25', piecesPerSheet: 16 }, { label: '25×35', piecesPerSheet: 8 },
    { label: '35×50', piecesPerSheet: 4 }, { label: '50×70', piecesPerSheet: 2 },
    { label: '70×100', piecesPerSheet: 1 },
  ] },
  { key: 'foolscap', base: 'REGULAR', entries: [
    { label: '11.5×16.5', piecesPerSheet: 36 }, { label: '16.5×23', piecesPerSheet: 18 },
    { label: '23×33', piecesPerSheet: 9 },
  ] },
  { key: 'extra2', base: 'REGULAR', entries: [
    { label: '10×15', piecesPerSheet: 44 }, { label: '15×20', piecesPerSheet: 22 },
    { label: '20×30', piecesPerSheet: 11 }, { label: '30×40', piecesPerSheet: 5 },
  ] },
  { key: 'koshiaGayer', base: 'GAYER', entries: [
    { label: '11×16.5', piecesPerSheet: 32 }, { label: '16.5×22', piecesPerSheet: 16 },
    { label: '22×33', piecesPerSheet: 8 }, { label: '33×44', piecesPerSheet: 4 },
    { label: '66×88', piecesPerSheet: 1 },
  ] },
];
const settings: PricingConstants = { notebookThreshold: 30, looseThreshold: 3000,
  wasteSheetsDefault: 2, zincPrice: 75, printRunPrice: 75, numberingRunPrice: 75,
  designPrice: 75, profitPercent: 25, envelopeDesignPrice: 100, envelopeZincPrice: 75,
  envelopePrintRunPrice: 100, sellophanePricePerSheet: 4 };
const input = { familyKey: 'standard', realLabel: '7×7', quantity: 1000, colorCount: 1,
  sides: 1 as const, isNewDesign: false, sheetPrice: 3, families, settings };

describe('custom offset sizes', () => {
  it('packs 7×7 stickers on 16.5×23 with 1 cm margins: 6 pieces, 108 per full sheet', () => {
    const layout = resolveCustomOffsetSize({ realLabel: '7×7', base: 'REGULAR', families });
    expect(layout).toMatchObject({ calcLabel: '16.5×23', repeat: 6, calcPiecesPerSheet: 18,
      piecesPerFullSheet: 108, rotation: 0, marginCm: 1, printableWidthCm: 14.5, printableHeightCm: 21 });
    expect(layout.unusedAreaPercent).toBeCloseTo((1 - 294 / 379.5) * 100);
    const result = calculateLoosePaperCost(input);
    expect(result.sheetsNeeded).toBe(12); // ceil(1000/108) + 2 full waste sheets
    expect(result.printRuns).toBe(1);
    expect(result.paperCost).toBe(36);
    expect(result.total).toBe(232.5);
    expect(computeLooseSheetsNeeded(input)).toBe(result.sheetsNeeded);
  });
  it('uses only 66×88 gayer stock and includes its full-sheet waste', () => {
    const result = calculateLoosePaperCost({ ...input, familyKey: 'koshiaGayer' });
    expect(result.customLayout).toMatchObject({ calcLabel: '33×44', repeat: 24, piecesPerFullSheet: 96, sheetBase: 'GAYER' });
    expect(result.sheetsNeeded).toBe(13);
    expect(computeLooseSheetsNeeded({ ...input, familyKey: 'koshiaGayer' })).toBe(13);
  });
  it('rotates a rectangle when needed; never substitutes rounded area for fit', () => {
    expect(fitOffsetPieces([35, 50], [24, 34])).toEqual({ pieces: 2, rotation: 90 });
    expect(fitOffsetPieces([20, 30], [11, 16])).toEqual({ pieces: 2, rotation: 90 });
    const layout = resolveCustomOffsetSize({ realLabel: '23×33', base: 'REGULAR', families, calcLabelOverride: '35×50' });
    expect(layout).toMatchObject({ calcLabel: '35×50', repeat: 2, rotation: 90 });
  });
  it.each(['0×7', '-2×7', '7..2×8', 'NaN×5', 'Infinity×2', '7×', '1e3×2', 'constructor', '__proto__', 'toString'])('rejects invalid %s', realLabel => {
    expect(parseOffsetDimensions(realLabel)).toBeNull();
    expect(() => calculateLoosePaperCost({ ...input, realLabel })).toThrow();
  });
  it('accepts centimetre decimals and Arabic digits', () => {
    expect(parseOffsetDimensions('٧٫٥ * ١٢')).toEqual([7.5, 12]);
    expect(calculateLoosePaperCost({ ...input, realLabel: '12.3x18.5' }).sheetsNeeded).toBeGreaterThan(0);
  });
  it('rejects oversize, impossible overrides, and cross-base candidates', () => {
    expect(() => calculateLoosePaperCost({ ...input, realLabel: '36×51' })).toThrow(/ربع فرخ/);
    expect(() => calculateLoosePaperCost({ ...input, calcSizeOverride: '70×100' })).toThrow();
    expect(() => calculateLoosePaperCost({ ...input, calcSizeOverride: '33×44' })).toThrow();
    expect(() => calculateLoosePaperCost({ ...input, calcSizeOverride: '6×6' })).toThrow();
  });
  it('honours a feasible configured print override and waste override', () => {
    const result = calculateLoosePaperCost({ ...input, calcSizeOverride: '25×35', wasteSheetsOverride: 5 });
    expect(result.customLayout).toMatchObject({ repeat: 12, calcPiecesPerSheet: 8 });
    expect(result.sheetsNeeded).toBe(16);
  });
  it('numbers independently on <=23×33, with no doubling for a big print sheet', () => {
    const numbering = resolveCustomOffsetNumbering('7×7', families, 'REGULAR');
    expect(numbering.repeat).toBe(12); // 23×33 numbering remains independent of print layout.
    const result = calculateLoosePaperCost({ ...input, quantity: 20000, numbering: { startNumber: 101 } });
    expect(result.numberingRuns).toBe(2);
    expect(result.numberingEnd).toBe(20100);
    expect(() => resolveCustomOffsetNumbering('24×34', families, 'REGULAR')).toThrow();
  });
  it('preserves standard tiering and the exact 15×20 notebook exception', () => {
    const result = calculateLoosePaperCost({ ...input, familyKey: 'extra2', realLabel: '10×15', quantity: 3000 });
    expect(result.calcLabel).toBe('30×40');
    expect(result.sheetsNeeded).toBe(77);
    expect(result.customLayout).toBeUndefined();
    const notebook = calculateNotebookMultiMaterialCost({ familyKey: 'extra2', realLabel: '15×20',
      notebookQuantity: 200, contentType: 'ORIGINAL_PLUS_COPIES', copies: 2, originalPagesOverride: 50,
      colorCount: 1, sides: 1, isNewDesign: false, bindingPricePerNotebook: 0, sheetPrice: 3,
      families, settings }, [{ role: 'COPY_1', sheetPrice: 3 }, { role: 'COPY_2', sheetPrice: 3 }]);
    expect(notebook.materials.map(m => m.sheetsNeeded)).toEqual([457, 457, 457]);
    expect(notebook.sheetsNeeded).toBe(1371);
  });
  it('rejects custom notebook sizes rather than repricing standard notebooks', () => {
    expect(() => calculateNotebookCost({ familyKey: 'standard', realLabel: '7×7', notebookQuantity: 100,
      contentType: 'ORIGINAL_PLUS_COPIES', copies: 1, colorCount: 1, sides: 1, isNewDesign: false,
      bindingPricePerNotebook: 0, sheetPrice: 3, families, settings })).toThrow(/القياسية/);
  });
  it('rejects custom folder sizes so custom layouts remain loose-paper only', () => {
    expect(() => calculateFolderCost({ ...input, sellophaneEnabled: false })).toThrow(/للورق السايب فقط/);
  });
  it('also prevents oversized catalogue sizes and manual overrides from exceeding the press', () => {
    expect(() => calculateLoosePaperCost({ ...input, realLabel: '50×70' })).toThrow(/ربع فرخ/);
    expect(() => calculateLoosePaperCost({ ...input, realLabel: '17.5×25', calcSizeOverride: '70×100' })).toThrow(/ربع فرخ/);
    expect(() => calculateLoosePaperCost({ ...input, familyKey: 'koshiaGayer', realLabel: '66×88' })).toThrow(/ربع فرخ/);
  });
  it('uses configured cutting counts, including mixed full-sheet cutting layouts', () => {
    const layout = resolveCustomOffsetSize({ realLabel: '7×7', base: 'REGULAR', families, calcLabelOverride: '20×30' });
    expect(layout.calcPiecesPerSheet).toBe(11);
    expect(layout.piecesPerFullSheet).toBe(88);
  });
  it('rejects a print override that fits only without the edge margins', () => {
    expect(() => calculateLoosePaperCost({ ...input, realLabel: '16×22', calcSizeOverride: '16.5×23' })).toThrow();
  });
  it('server validates actual inventory base and freezes layout in breakdown', () => {
    const ctx = { families, pricingConstants: settings, sheetPriceByInventoryItemId: new Map([['paper', 3]]),
      paperNameByInventoryItemId: new Map(), sheetBaseByInventoryItemId: new Map([['paper', 'REGULAR']]),
    } as PricingContext;
    const line = { pricing: { kind: 'LOOSE_PAPER' as const, sizeFamilyKey: 'standard', realSizeLabel: '7×7',
      inventoryItemId: 'paper', quantity: 1000, colorCount: 1, sides: 1 as const, isNewDesign: false } };
    const result = computeItemPricing(line, ctx);
    expect(result.sheetsNeeded).toBe(12);
    expect(result.breakdown).toHaveProperty('customLayout.repeat', 6);
    ctx.sheetBaseByInventoryItemId?.set('paper', 'GAYER');
    expect(() => computeItemPricing(line, ctx)).toThrow(PricingInputError);
    ctx.sheetBaseByInventoryItemId?.clear();
    expect(() => computeItemPricing(line, ctx)).toThrow(PricingInputError);
  });
});
