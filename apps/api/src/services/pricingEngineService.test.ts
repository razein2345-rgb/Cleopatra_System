import { describe, expect, it } from 'vitest';
import { computeItemPricing, PricingInputError, type PricingContext, type PricingLineItem } from './pricingEngineService.js';

// Owner (2026-08-27, "روول أب... بيتكون من رول أب وبانر... مش تابعة
// للبانر نفسه") — the new BOARDS "catalog item" dispatch path: when
// `boardsCatalogItemId` is set on the parent item, pricing bypasses the
// material/width/height geometry formula entirely and uses the catalog
// row's flat price/supplierCost instead (mirrors PRODUCT/SERVICE's
// readyProductId/serviceId dispatch).

function baseContext(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    families: [],
    pricingConstants: {
      notebookThreshold: 0,
      looseThreshold: 0,
      wasteSheetsDefault: 0,
      zincPrice: 0,
      printRunPrice: 0,
      numberingRunPrice: 0,
      designPrice: 0,
      profitPercent: 0,
      envelopeDesignPrice: 0,
      envelopeZincPrice: 0,
      envelopePrintRunPrice: 0,
      sellophanePricePerSheet: 0,
    },
    boardsConstants: {
      boardsBannerNoDesign: 0,
      boardsBannerWithDesign: 0,
      boardsVinylNormalNoSello: 0,
      boardsVinylNormalWithSello: 0,
      boardsVinylPrintCutNoSello: 0,
      boardsVinylPrintCutWithSello: 0,
      boardsFlex: 0,
      boardsSeasro: 0,
      boardsGapMM: 0,
    },
    boardsSupplierConstants: {
      boardsBannerSupplierCost: 0,
      boardsVinylNormalSupplierCost: 0,
      boardsVinylPrintCutSupplierCost: 0,
      boardsFlexSupplierCost: 0,
      boardsSeasroSupplierCost: 0,
    },
    digitalConstants: {
      digitalQuarterWidthCm: 0,
      digitalQuarterHeightCm: 0,
      digitalSellophanePricePerQuarter: 0,
      profitPercent: 0,
      wasteSheetsDefault: 0,
    },
    vatRate: 0,
    sheetPriceByInventoryItemId: new Map(),
    paperNameByInventoryItemId: new Map(),
    catalogPriceById: new Map(),
    salePriceByInventoryItemId: new Map(),
    digitalPriceTiersByKey: new Map(),
    boardsCatalogById: new Map(),
    ...overrides,
  };
}

describe('computeItemPricing — BOARDS catalog item dispatch', () => {
  it('prices a flat-priced catalog item (e.g. Roll-Up) by quantity, ignoring material/size', () => {
    const ctx = baseContext({
      boardsCatalogById: new Map([['ru-1', { name: 'روول أب', price: 500, supplierCost: 300 }]]),
    });
    const item: PricingLineItem = {
      boardsCatalogItemId: 'ru-1',
      pricing: { kind: 'BOARDS', quantity: 2 },
    };
    const result = computeItemPricing(item, ctx);
    expect(result.total).toBe(1000);
    const breakdown = result.breakdown as Record<string, unknown>;
    expect(breakdown.unitPrice).toBe(500);
    expect(breakdown.itemName).toBe('روول أب');
    // supplierCost is the TOTAL for the line (per-unit × quantity), same
    // convention as the existing material/geometry BOARDS path.
    expect(breakdown.supplierCost).toBe(600);
  });

  it('lets supplierCostOverride replace the catalog default per order', () => {
    const ctx = baseContext({
      boardsCatalogById: new Map([['ru-1', { name: 'روول أب', price: 500, supplierCost: 300 }]]),
    });
    const item: PricingLineItem = {
      boardsCatalogItemId: 'ru-1',
      pricing: { kind: 'BOARDS', quantity: 1, supplierCostOverride: 450 },
    };
    const result = computeItemPricing(item, ctx);
    const breakdown = result.breakdown as Record<string, unknown>;
    expect(breakdown.supplierCost).toBe(450);
  });

  it('omits supplierCost entirely when the catalog item has none configured', () => {
    const ctx = baseContext({
      boardsCatalogById: new Map([['ru-1', { name: 'روول أب', price: 500, supplierCost: null }]]),
    });
    const item: PricingLineItem = {
      boardsCatalogItemId: 'ru-1',
      pricing: { kind: 'BOARDS', quantity: 1 },
    };
    const result = computeItemPricing(item, ctx);
    const breakdown = result.breakdown as Record<string, unknown>;
    expect('supplierCost' in breakdown).toBe(false);
  });

  it('throws when boardsCatalogItemId references a row buildPricingContext never loaded', () => {
    const ctx = baseContext();
    const item: PricingLineItem = {
      boardsCatalogItemId: 'missing',
      pricing: { kind: 'BOARDS', quantity: 1 },
    };
    expect(() => computeItemPricing(item, ctx)).toThrow(PricingInputError);
  });

  it('still requires material/widthCm/heightCm on the untouched geometry path when no catalog item is given', () => {
    const ctx = baseContext();
    const item: PricingLineItem = {
      pricing: { kind: 'BOARDS', quantity: 1 },
    };
    expect(() => computeItemPricing(item, ctx)).toThrow(PricingInputError);
  });
});
