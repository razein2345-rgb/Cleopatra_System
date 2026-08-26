import { describe, expect, it } from 'vitest';
import { resolveItemProfit } from './branchFinancialsService.js';

// Owner (2026-08-26, "لازم علشان يكون واضح صافي الربح بالظبط يحسب فلوس
// نسبة الربح فقط") — resolveItemProfit's per-item resolution order:
// margin-priced kinds (breakdown.subtotal) → INVENTORY_RETAIL (real FK) →
// PRODUCT (real FK or name fallback) → everything else (unknown).

const noCostMaps = () => ({
  byInv: new Map<string, number | null>(),
  byProdId: new Map<string, number | null>(),
  byProdName: new Map<string, number | null>(),
});

describe('resolveItemProfit', () => {
  it('computes profit from breakdown.subtotal for margin-priced kinds, no discount', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    const result = resolveItemProfit(
      { itemTotal: 150, discountAmount: 0, breakdown: { subtotal: 100 }, inventoryItemId: null, readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.revenue).toBe(150);
    expect(result.profit).toBeCloseTo(50, 5);
  });

  it('shrinks realized profit proportionally when item and order discounts apply', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    // itemTotal 200, subtotal 100 (50% margin), 10% item discount, 20% order discount.
    const result = resolveItemProfit(
      { itemTotal: 200, discountAmount: 20, breakdown: { subtotal: 100 }, inventoryItemId: null, readyProductId: null, modelName: null },
      0.8,
      byInv,
      byProdId,
      byProdName,
    );
    // revenue = (200 - 20) * 0.8 = 144; margin ratio = (200-100)/200 = 0.5; profit = 72
    expect(result.revenue).toBeCloseTo(144, 5);
    expect(result.profit).toBeCloseTo(72, 5);
  });

  it('computes INVENTORY_RETAIL profit from InventoryItem.costPrice via the real FK', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    byInv.set('inv-1', 5);
    const result = resolveItemProfit(
      { itemTotal: 100, discountAmount: 0, breakdown: { quantity: 10, unitPrice: 10 }, inventoryItemId: 'inv-1', readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeCloseTo(50, 5); // (10 - 5) * 10
  });

  it('returns null profit for an INVENTORY_RETAIL item with no cost price recorded', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    byInv.set('inv-1', null);
    const result = resolveItemProfit(
      { itemTotal: 100, discountAmount: 0, breakdown: { quantity: 10, unitPrice: 10 }, inventoryItemId: 'inv-1', readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeNull();
  });

  it('computes PRODUCT profit via the real readyProductId FK', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    byProdId.set('rp-1', 30);
    const result = resolveItemProfit(
      { itemTotal: 200, discountAmount: 0, breakdown: { kind: 'PRODUCT', quantity: 2, unitPrice: 100 }, inventoryItemId: null, readyProductId: 'rp-1', modelName: 'دباسة' },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeCloseTo(140, 5); // (100-30)*2
  });

  it('falls back to a best-effort modelName match for a legacy PRODUCT item with no readyProductId', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    byProdName.set('دباسة مكتبية', 30);
    const result = resolveItemProfit(
      { itemTotal: 200, discountAmount: 0, breakdown: { kind: 'PRODUCT', quantity: 2, unitPrice: 100 }, inventoryItemId: null, readyProductId: null, modelName: 'دباسة مكتبية' },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeCloseTo(140, 5);
  });

  it('returns null profit for SERVICE/MANUAL kinds — no cost basis concept yet', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    const result = resolveItemProfit(
      { itemTotal: 100, discountAmount: 0, breakdown: { kind: 'SERVICE', quantity: 1, unitPrice: 100 }, inventoryItemId: null, readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeNull();
    expect(result.revenue).toBe(100);
  });

  // Owner (2026-08-26, "هيتصمم ويتبعت للمورد... سعر المورد") — part 4 of
  // the treasury/suppliers initiative: BOARDS profit from the real
  // supplier cost computed at pricing time, same discount-shrinking rule
  // as every other tier.
  it('computes BOARDS profit from breakdown.supplierCost', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    const result = resolveItemProfit(
      { itemTotal: 600, discountAmount: 0, breakdown: { supplierCost: 200 }, inventoryItemId: null, readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBe(400); // 600 - 200
  });

  it('shrinks BOARDS supplier cost basis by the order discount factor, same as other tiers', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    const result = resolveItemProfit(
      { itemTotal: 600, discountAmount: 0, breakdown: { supplierCost: 200 }, inventoryItemId: null, readyProductId: null, modelName: null },
      0.8, // 20% order discount
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.revenue).toBe(480); // 600 * 0.8
    expect(result.profit).toBeCloseTo(320, 5); // 480 - (200 * 0.8)
  });

  it('returns null profit for a BOARDS item with no supplierCost recorded (predates the feature or rate never configured)', () => {
    const { byInv, byProdId, byProdName } = noCostMaps();
    const result = resolveItemProfit(
      { itemTotal: 600, discountAmount: 0, breakdown: { material: 'FLEX', quantity: 2 }, inventoryItemId: null, readyProductId: null, modelName: null },
      1,
      byInv,
      byProdId,
      byProdName,
    );
    expect(result.profit).toBeNull();
  });

  // Owner (2026-08-27, "سعر الزنكات بكام من عند المورد... وسعر الورق من
  // عند التاجر... علشان اقدر احسب فرق السعر والربح") — OFFSET real cost
  // (zinc supplier rate + paper merchant rate) overrides the padded
  // marginRatio fallback once both are configured.
  describe('OFFSET real cost (zinc supplier + paper merchant rates)', () => {
    it('uses the real cost for LOOSE_PAPER/FOLDER once both paper and zinc supplier rates are configured', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map([['paper-1', 5]]); // merchant charges 5/sheet
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { subtotal: 120, sheetsNeeded: 10, colorCount: 2 }, inventoryItemId: 'paper-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
        paperCost,
        3, // zinc supplier charges 3/color
      );
      // real cost = 10 sheets * 5 + 2 colors * 3 = 56; profit = 200 - 56 = 144
      // (NOT the marginRatio fallback, which would give (200-120)/200*200 = 80)
      expect(result.profit).toBeCloseTo(144, 5);
    });

    it('falls back to the padded marginRatio when the paper cost price is missing for that item', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map<string, number | null>([['paper-1', null]]);
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { subtotal: 120, sheetsNeeded: 10, colorCount: 2 }, inventoryItemId: 'paper-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
        paperCost,
        3,
      );
      expect(result.profit).toBeCloseTo(80, 5); // (200-120)/200 * 200
    });

    it('falls back to the padded marginRatio when zincSupplierCost is unconfigured (still 0)', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map([['paper-1', 5]]);
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { subtotal: 120, sheetsNeeded: 10, colorCount: 2 }, inventoryItemId: 'paper-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
        paperCost,
        0,
      );
      expect(result.profit).toBeCloseTo(80, 5);
    });

    it('computes real cost for NOTEBOOK from every material copy, not just the original', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map([
        ['cover-paper', 8],
        ['inner-paper', 4],
      ]);
      const result = resolveItemProfit(
        {
          itemTotal: 500,
          discountAmount: 0,
          breakdown: {
            subtotal: 300,
            colorCount: 1,
            materials: [
              { inventoryItemId: 'cover-paper', sheetsNeeded: 5 },
              { inventoryItemId: 'inner-paper', sheetsNeeded: 20 },
            ],
          },
          inventoryItemId: null,
          readyProductId: null,
          modelName: null,
        },
        1,
        byInv,
        byProdId,
        byProdName,
        paperCost,
        2,
      );
      // real cost = (5*8 + 20*4) + 1*2 = 40 + 80 + 2 = 122; profit = 500 - 122 = 378
      expect(result.profit).toBeCloseTo(378, 5);
    });

    it('computes real cost for ENVELOPE from the already-real readyEnvelopePricePerPiece, plus zinc', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        {
          itemTotal: 300,
          discountAmount: 0,
          breakdown: { subtotal: 200, quantity: 50, readyEnvelopePricePerPiece: 3, colorCount: 1 },
          inventoryItemId: null,
          readyProductId: null,
          modelName: null,
        },
        1,
        byInv,
        byProdId,
        byProdName,
        new Map(),
        4,
      );
      // real cost = 50*3 + 1*4 = 154; profit = 300 - 154 = 146
      expect(result.profit).toBeCloseTo(146, 5);
    });

    it('shrinks the real-cost basis by the order discount factor, same as every other tier', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map([['paper-1', 5]]);
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { subtotal: 120, sheetsNeeded: 10, colorCount: 2 }, inventoryItemId: 'paper-1', readyProductId: null, modelName: null },
        0.9, // 10% order discount
        byInv,
        byProdId,
        byProdName,
        paperCost,
        3,
      );
      // revenue = 200*0.9 = 180; real cost basis = 56*0.9 = 50.4; profit = 129.6
      expect(result.revenue).toBe(180);
      expect(result.profit).toBeCloseTo(129.6, 5);
    });
  });
});
