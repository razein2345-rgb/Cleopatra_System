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

  it('returns null profit for SERVICE/MANUAL/BOARDS kinds — no cost basis concept yet', () => {
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
});
