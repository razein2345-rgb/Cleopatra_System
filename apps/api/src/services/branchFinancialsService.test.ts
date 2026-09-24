import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveItemProfit } from './branchFinancialsService.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Accounting audit fix (2026-09-17, Phase B) — module-level mocks for the
// `getCompanyFinancialSummary` time-basis regression tests further below.
// Must live at the true top level (Vitest hoists `vi.mock` above every
// import regardless of where it's textually placed, and warns/will error
// if it isn't already there) — harmless to the `resolveItemProfit` tests
// above/below, since that function is pure and never touches `prisma` or
// `fixedExpensesService.js`.
const branchFindMany = vi.fn();
const treasuryGroupBy = vi.fn();
const treasuryAggregate = vi.fn();
const orderFindMany = vi.fn();
const orderItemReturnFindMany = vi.fn();
const paymentFindMany = vi.fn();
const inventoryItemFindMany = vi.fn();
const readyProductFindMany = vi.fn();
const settingFindFirst = vi.fn();
const getDailyFixedCostByBranchMock = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    branch: { findMany: (...args: unknown[]) => branchFindMany(...args) },
    treasuryEntry: {
      groupBy: (...args: unknown[]) => treasuryGroupBy(...args),
      aggregate: (...args: unknown[]) => treasuryAggregate(...args),
    },
    order: { findMany: (...args: unknown[]) => orderFindMany(...args) },
    orderItemReturn: { findMany: (...args: unknown[]) => orderItemReturnFindMany(...args) },
    payment: { findMany: (...args: unknown[]) => paymentFindMany(...args) },
    inventoryItem: { findMany: (...args: unknown[]) => inventoryItemFindMany(...args) },
    readyProduct: { findMany: (...args: unknown[]) => readyProductFindMany(...args) },
    setting: { findFirst: (...args: unknown[]) => settingFindFirst(...args) },
  },
}));
vi.mock('./fixedExpensesService.js', () => ({
  getDailyFixedCostByBranch: (...args: unknown[]) => getDailyFixedCostByBranchMock(...args),
}));

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

  /**
   * Accounting audit fix (2026-09-17, Phase 3/Decision 5) — every branch
   * above must also carry an explicit REAL/ESTIMATED/UNKNOWN confidence
   * tag, never silently blended. `cost` must always equal `revenue -
   * profit` (the invariant `resolveItemProfit` is built to preserve).
   */
  describe('cost confidence classification (REAL / ESTIMATED / UNKNOWN)', () => {
    it('REAL: INVENTORY_RETAIL with a recorded cost price', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      byInv.set('inv-1', 5);
      const result = resolveItemProfit(
        { itemTotal: 100, discountAmount: 0, breakdown: { quantity: 10, unitPrice: 10 }, inventoryItemId: 'inv-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('REAL');
      expect(result.cost).toBeCloseTo(50, 5);
      expect(result.cost).toBeCloseTo(result.revenue - (result.profit ?? 0), 5);
    });

    it('UNKNOWN: INVENTORY_RETAIL with no cost price recorded — never inferred as REAL just because a price exists elsewhere', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      byInv.set('inv-1', null);
      const result = resolveItemProfit(
        { itemTotal: 100, discountAmount: 0, breakdown: { quantity: 10, unitPrice: 10 }, inventoryItemId: 'inv-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('UNKNOWN');
      expect(result.cost).toBeNull();
      expect(result.profit).toBeNull();
    });

    it('REAL: PRODUCT via readyProductId FK', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      byProdId.set('rp-1', 30);
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { kind: 'PRODUCT', quantity: 2, unitPrice: 100 }, inventoryItemId: null, readyProductId: 'rp-1', modelName: 'دباسة' },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('REAL');
    });

    it('UNKNOWN: SERVICE/MANUAL with no cost basis concept at all', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        { itemTotal: 100, discountAmount: 0, breakdown: { kind: 'SERVICE', quantity: 1, unitPrice: 100 }, inventoryItemId: null, readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('UNKNOWN');
    });

    it('REAL: BOARDS with a configured supplierCost — the same figure that books a real SupplierPurchase', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        { itemTotal: 600, discountAmount: 0, breakdown: { supplierCost: 200 }, inventoryItemId: null, readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('REAL');
    });

    it('UNKNOWN: BOARDS with no supplierCost recorded (rate never configured)', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        { itemTotal: 600, discountAmount: 0, breakdown: { material: 'FLEX', quantity: 2 }, inventoryItemId: null, readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('UNKNOWN');
    });

    it('REAL: OFFSET real cost path (zinc supplier + paper merchant rates both configured)', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const paperCost = new Map([['paper-1', 5]]);
      const result = resolveItemProfit(
        { itemTotal: 200, discountAmount: 0, breakdown: { subtotal: 120, sheetsNeeded: 10, colorCount: 2 }, inventoryItemId: 'paper-1', readyProductId: null, modelName: null },
        1,
        byInv,
        byProdId,
        byProdName,
        paperCost,
        3,
      );
      expect(result.confidence).toBe('REAL');
    });

    it('ESTIMATED: OFFSET margin-ratio fallback when the real supplier rate is not configured — never presented as REAL', () => {
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
      expect(result.confidence).toBe('ESTIMATED');
    });

    it('REAL: MANUAL item whose supplier task cost is confirmed (status RECEIVED)', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        {
          itemTotal: 300,
          discountAmount: 0,
          breakdown: { kind: 'MANUAL', quantity: 1, unitPrice: 300 },
          inventoryItemId: null,
          readyProductId: null,
          modelName: null,
          supplierTasksCost: 100,
          supplierTasksConfirmed: true,
        },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('REAL');
      expect(result.profit).toBeCloseTo(200, 5);
    });

    it('ESTIMATED: MANUAL item whose supplier task cost is only typed in while still WAITING/SENT — a real number, not yet a confirmed payable', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const result = resolveItemProfit(
        {
          itemTotal: 300,
          discountAmount: 0,
          breakdown: { kind: 'MANUAL', quantity: 1, unitPrice: 300 },
          inventoryItemId: null,
          readyProductId: null,
          modelName: null,
          supplierTasksCost: 100,
          supplierTasksConfirmed: false,
        },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.confidence).toBe('ESTIMATED');
      expect(result.profit).toBeCloseTo(200, 5);
    });

    it('the cost/profit/revenue invariant (cost = revenue - profit) holds for every confidence tier, including under a discount', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      byInv.set('inv-1', 5);
      const result = resolveItemProfit(
        { itemTotal: 100, discountAmount: 10, breakdown: { quantity: 10, unitPrice: 10 }, inventoryItemId: 'inv-1', readyProductId: null, modelName: null },
        0.9,
        byInv,
        byProdId,
        byProdName,
      );
      expect(result.cost).toBeCloseTo(result.revenue - (result.profit ?? 0), 10);
    });

    it('does not silently blend REAL and ESTIMATED into a single unlabeled figure — the two tests above prove the same shape of cost source (a real number typed in) produces different confidence depending on confirmation state', () => {
      const { byInv, byProdId, byProdName } = noCostMaps();
      const confirmed = resolveItemProfit(
        { itemTotal: 300, discountAmount: 0, breakdown: { kind: 'MANUAL' }, inventoryItemId: null, readyProductId: null, modelName: null, supplierTasksCost: 100, supplierTasksConfirmed: true },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      const unconfirmed = resolveItemProfit(
        { itemTotal: 300, discountAmount: 0, breakdown: { kind: 'MANUAL' }, inventoryItemId: null, readyProductId: null, modelName: null, supplierTasksCost: 100, supplierTasksConfirmed: false },
        1,
        byInv,
        byProdId,
        byProdName,
      );
      expect(confirmed.profit).toBe(unconfirmed.profit); // same math
      expect(confirmed.confidence).not.toBe(unconfirmed.confidence); // different certainty, disclosed
    });
  });
});

/**
 * Accounting audit fix (2026-09-17, Phase B/time-basis) — regression
 * coverage for `getCompanyFinancialSummary`'s own time-basis fix:
 * `netProfit`/`realProfit`/`estimatedProfit` must be scoped to TODAY
 * (Cairo business day) only, matching `dailyFixedCost`'s own one-day
 * period — `salesTotal` stays all-time, unchanged, so the two can be told
 * apart in the same response.
 */
describe('getCompanyFinancialSummary — time-basis fix (Phase B)', () => {
  beforeEach(() => {
    branchFindMany.mockReset().mockResolvedValue([{ id: 'branch-1', name: 'الفرع الرئيسي' }]);
    treasuryGroupBy.mockReset().mockResolvedValue([]);
    orderFindMany.mockReset();
    inventoryItemFindMany.mockReset().mockResolvedValue([{ id: 'inv-1', costPrice: { toNumber: () => 5 }, sheetType: null }]);
    readyProductFindMany.mockReset().mockResolvedValue([]);
    settingFindFirst.mockReset().mockResolvedValue({ zincSupplierCost: { toNumber: () => 0 } });
    getDailyFixedCostByBranchMock.mockReset().mockResolvedValue({ perBranch: new Map(), companyWideDaily: 0 });
  });

  function inventoryRetailOrder(branchId: string, date: Date) {
    return {
      branchId,
      date,
      finalTotal: { toNumber: () => 100 },
      discountPercent: { toNumber: () => 0 },
      items: [
        {
          itemTotal: { toNumber: () => 100 },
          discountAmount: { toNumber: () => 0 },
          breakdown: { quantity: 10, unitPrice: 10 },
          inventoryItemId: 'inv-1',
          readyProductId: null,
          modelName: null,
          supplierTasks: [],
        },
      ],
    };
  }

  it('includes a yesterday order in salesTotal (all-time) but NOT in netProfit/realProfit (today-only)', async () => {
    const { getCompanyFinancialSummary } = await import('./branchFinancialsService.js');
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000); // safely before today's Cairo midnight
    orderFindMany.mockResolvedValue([inventoryRetailOrder('branch-1', yesterday)]);

    const summary = await getCompanyFinancialSummary();
    const branch = summary.branches[0]!;

    expect(branch.salesTotal).toBe(100); // all-time — still counts the old order
    expect(branch.netProfit).toBe(0); // today-only — the old order must NOT count
    expect(branch.realProfit).toBe(0);
  });

  it('includes a today order in BOTH salesTotal and netProfit/realProfit', async () => {
    const { getCompanyFinancialSummary } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValue([inventoryRetailOrder('branch-1', new Date())]);

    const summary = await getCompanyFinancialSummary();
    const branch = summary.branches[0]!;

    expect(branch.salesTotal).toBe(100);
    expect(branch.netProfit).toBeCloseTo(50, 5); // (10-5)*10
    expect(branch.realProfit).toBeCloseTo(50, 5);
  });

  it('a mix of yesterday + today orders: salesTotal sums both, netProfit reflects only today', async () => {
    const { getCompanyFinancialSummary } = await import('./branchFinancialsService.js');
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    orderFindMany.mockResolvedValue([inventoryRetailOrder('branch-1', yesterday), inventoryRetailOrder('branch-1', new Date())]);

    const summary = await getCompanyFinancialSummary();
    const branch = summary.branches[0]!;

    expect(branch.salesTotal).toBe(200); // both orders, all-time
    expect(branch.netProfit).toBeCloseTo(50, 5); // only today's order
  });

  it('netAfterDailyFixedCost compares TODAY profit against the SAME one-day fixed cost — no all-time/one-day mixing', async () => {
    const { getCompanyFinancialSummary } = await import('./branchFinancialsService.js');
    getDailyFixedCostByBranchMock.mockResolvedValue({ perBranch: new Map([['branch-1', 20]]), companyWideDaily: 0 });
    orderFindMany.mockResolvedValue([inventoryRetailOrder('branch-1', new Date())]);

    const summary = await getCompanyFinancialSummary();
    const branch = summary.branches[0]!;

    expect(branch.netProfit).toBeCloseTo(50, 5);
    expect(branch.dailyFixedCost).toBe(20);
    expect(branch.netAfterDailyFixedCost).toBeCloseTo(30, 5); // 50 - 20, both today-scoped
  });
});

/**
 * Cutover-revision-round decision (post-3D, Decision B1) — regression
 * coverage for the B1 exclusion guarantee: `Order.customerOpeningId`
 * (traceability only, linking a continuation Order to a prior pre-cutover
 * commitment) must never feed Income/Revenue/Profitability. `grep`
 * confirms today that the field, and its forced Prisma back-relation
 * `CustomerOpening.ordersContinuingThisOpening`, are never referenced in
 * this file or in `reportsOverviewService.ts` — this test pins that fact
 * so a future edit that starts reading either one here fails loudly
 * instead of silently reintroducing a profitability special-case. The
 * behavioral half (below) proves the same thing dynamically: an order
 * carrying `customerOpeningId` must compute the exact same salesTotal/
 * netProfit/realProfit as an otherwise-identical ordinary order.
 */
describe('B1 exclusion guarantee — customerOpeningId must never feed profitability', () => {
  it('customerOpeningId and ordersContinuingThisOpening are referenced zero times in the profitability-computing source files', () => {
    const filesToCheck = ['branchFinancialsService.ts', 'reportsOverviewService.ts'];
    for (const file of filesToCheck) {
      const source = readFileSync(join(currentDir, file), 'utf8');
      expect(source, `customerOpeningId leaked into ${file}`).not.toMatch(/customerOpeningId/);
      expect(source, `ordersContinuingThisOpening leaked into ${file}`).not.toMatch(/ordersContinuingThisOpening/);
    }
  });

  it('an order with customerOpeningId set contributes to salesTotal/netProfit/realProfit exactly like an ordinary order with the same numbers', async () => {
    branchFindMany.mockReset().mockResolvedValue([{ id: 'branch-1', name: 'الفرع الرئيسي' }]);
    treasuryGroupBy.mockReset().mockResolvedValue([]);
    inventoryItemFindMany.mockReset().mockResolvedValue([{ id: 'inv-1', costPrice: { toNumber: () => 5 }, sheetType: null }]);
    readyProductFindMany.mockReset().mockResolvedValue([]);
    settingFindFirst.mockReset().mockResolvedValue({ zincSupplierCost: { toNumber: () => 0 } });
    getDailyFixedCostByBranchMock.mockReset().mockResolvedValue({ perBranch: new Map(), companyWideDaily: 0 });
    const { getCompanyFinancialSummary } = await import('./branchFinancialsService.js');
    const { todayInBusinessTimezone } = await import('../lib/businessTimezone.js');
    // Deliberately NOT `new Date()` — the "today" bucket this function
    // computes against is `todayInBusinessTimezone()` (Cairo business day),
    // which can disagree with the test runner's own local wall-clock day
    // for a window around any midnight. Anchoring to the exact same
    // function the code under test uses keeps this assertion meaningful
    // regardless of the machine's local timezone or the moment it runs.
    const definitelyToday = new Date(todayInBusinessTimezone().getTime() + 60 * 60 * 1000);

    function buildOrder(customerOpeningId: string | null) {
      return {
        branchId: 'branch-1',
        date: definitelyToday,
        finalTotal: { toNumber: () => 100 },
        discountPercent: { toNumber: () => 0 },
        customerOpeningId,
        items: [
          {
            itemTotal: { toNumber: () => 100 },
            discountAmount: { toNumber: () => 0 },
            breakdown: { quantity: 10, unitPrice: 10 },
            inventoryItemId: 'inv-1',
            readyProductId: null,
            modelName: null,
            supplierTasks: [],
          },
        ],
      };
    }

    orderFindMany.mockResolvedValue([buildOrder(null)]);
    const ordinary = await getCompanyFinancialSummary();

    orderFindMany.mockResolvedValue([buildOrder('opening-1')]);
    const continuation = await getCompanyFinancialSummary();

    const [ordinaryBranch, continuationBranch] = [ordinary.branches[0]!, continuation.branches[0]!];
    expect(continuationBranch.salesTotal).toBe(ordinaryBranch.salesTotal);
    expect(continuationBranch.netProfit).toBe(ordinaryBranch.netProfit);
    expect(continuationBranch.realProfit).toBe(ordinaryBranch.realProfit);
    // Sanity pin, same math as the time-basis tests above: (10-5)*10 = 50.
    expect(continuationBranch.netProfit).toBeCloseTo(50, 5);
  });
});

/**
 * Accounting audit fix (2026-09-17, Phase 3 C/D) — regression coverage for
 * `getProfitabilityReport`: Revenue ≠ Cash Received ≠ AR, no double
 * counting of supplier/salary/return costs already represented elsewhere,
 * and the fixed-cost proration matches the requested period's day count.
 */
describe('getProfitabilityReport — Revenue/Cash/AR + Gross→Operating Profit (Phase C/D)', () => {
  const FROM = new Date('2026-09-01T00:00:00.000Z');
  const TO = new Date('2026-09-02T23:59:59.999Z'); // 2 days inclusive

  beforeEach(() => {
    orderFindMany.mockReset();
    orderItemReturnFindMany.mockReset().mockResolvedValue([]);
    paymentFindMany.mockReset().mockResolvedValue([]);
    inventoryItemFindMany.mockReset().mockResolvedValue([{ id: 'inv-1', costPrice: { toNumber: () => 5 }, sheetType: null }]);
    readyProductFindMany.mockReset().mockResolvedValue([]);
    settingFindFirst.mockReset().mockResolvedValue({ zincSupplierCost: { toNumber: () => 0 } });
    getDailyFixedCostByBranchMock.mockReset().mockResolvedValue({ perBranch: new Map(), companyWideDaily: 0 });
    treasuryAggregate.mockReset().mockResolvedValue({ _sum: { amount: null } });
  });

  function retailItem(revenue: number, qty: number) {
    return {
      itemTotal: { toNumber: () => revenue },
      discountAmount: { toNumber: () => 0 },
      breakdown: { quantity: qty, unitPrice: revenue / qty },
      inventoryItemId: 'inv-1',
      readyProductId: null,
      modelName: null,
      supplierTasks: [],
    };
  }

  it('Revenue, Cash Received, and AR are independent — a customer with an unpaid balance makes them all different', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    // periodOrders (revenue calc)
    orderFindMany.mockResolvedValueOnce([
      { finalTotal: { toNumber: () => 1000 }, discountPercent: { toNumber: () => 0 }, items: [retailItem(1000, 100)] },
    ]);
    // arOrders (current AR snapshot) — same order, only 400 paid so far
    orderFindMany.mockResolvedValueOnce([
      { finalTotal: { toNumber: () => 1000 }, payments: [{ amount: { toNumber: () => 400 } }], itemReturns: [] },
    ]);
    paymentFindMany.mockResolvedValue([{ amount: { toNumber: () => 400 } }]);

    const report = await getProfitabilityReport(FROM, TO);

    expect(report.revenue).toBe(1000);
    expect(report.cashReceived).toBe(400);
    expect(report.accountsReceivable).toBe(600);
    expect(report.revenue).not.toBe(report.cashReceived);
    expect(report.cashReceived).not.toBe(report.accountsReceivable);
  });

  it('a return recorded in the period reduces revenue (contra-revenue), never touches cashReceived', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValueOnce([
      { finalTotal: { toNumber: () => 1000 }, discountPercent: { toNumber: () => 0 }, items: [retailItem(1000, 100)] },
    ]);
    orderFindMany.mockResolvedValueOnce([]);
    orderItemReturnFindMany.mockResolvedValue([{ refundAmount: { toNumber: () => 150 } }]);
    paymentFindMany.mockResolvedValue([{ amount: { toNumber: () => 1000 } }]);

    const report = await getProfitabilityReport(FROM, TO);

    expect(report.revenue).toBe(850); // 1000 - 150
    expect(report.cashReceived).toBe(1000); // unaffected by the return
  });

  it('Gross Profit = realProfit + estimatedProfit, excluding unknown-cost revenue', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    inventoryItemFindMany.mockResolvedValue([{ id: 'inv-1', costPrice: { toNumber: () => 5 }, sheetType: null }]);
    orderFindMany.mockResolvedValueOnce([
      {
        finalTotal: { toNumber: () => 1300 },
        discountPercent: { toNumber: () => 0 },
        items: [
          retailItem(1000, 100), // REAL: revenue 1000, cost 500, profit 500
          { ...retailItem(300, 1), inventoryItemId: null, breakdown: { kind: 'SERVICE', quantity: 1, unitPrice: 300 } }, // UNKNOWN
        ],
      },
    ]);
    orderFindMany.mockResolvedValueOnce([]);

    const report = await getProfitabilityReport(FROM, TO);

    expect(report.realProfit).toBeCloseTo(500, 5);
    expect(report.unknownCostRevenue).toBeCloseTo(300, 5);
    expect(report.grossProfit).toBeCloseTo(500, 5); // excludes the unknown item entirely
    expect(report.hasUnknownProfitItems).toBe(true);
  });

  it('manualTreasuryExpenses only counts sourceType MANUAL — never double-counts a value already represented elsewhere', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValueOnce([]);
    orderFindMany.mockResolvedValueOnce([]);
    treasuryAggregate.mockResolvedValue({ _sum: { amount: { toNumber: () => 750 } } });

    const report = await getProfitabilityReport(FROM, TO);

    expect(report.manualTreasuryExpenses).toBe(750);
    // Confirms the query itself only asks for sourceType MANUAL — the
    // actual double-count protection (excluding SUPPLIER_PAYMENT/
    // SALARY_PAYMENT/EMPLOYEE_ADVANCE/RETURN) is enforced by this filter.
    const call = treasuryAggregate.mock.calls[0]![0];
    expect(call.where.sourceType).toBe('MANUAL');
    expect(call.where.type).toBe('EXPENSE');
  });

  it('fixedExpenseCost is prorated to the exact number of days in the requested range, not a flat one-day amount', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValueOnce([]);
    orderFindMany.mockResolvedValueOnce([]);
    getDailyFixedCostByBranchMock.mockResolvedValue({ perBranch: new Map([['branch-1', 100]]), companyWideDaily: 0 });

    // FROM..TO spans exactly 2 days (2026-09-01 through 2026-09-02 inclusive).
    const report = await getProfitabilityReport(FROM, TO, ['branch-1']);

    expect(report.fixedExpenseCost).toBe(200); // 100/day * 2 days, not 100
  });

  it('operatingProfit = grossProfit - operatingExpenses, and operatingExpenses = fixedExpenseCost + manualTreasuryExpenses', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValueOnce([
      { finalTotal: { toNumber: () => 1000 }, discountPercent: { toNumber: () => 0 }, items: [retailItem(1000, 100)] },
    ]);
    orderFindMany.mockResolvedValueOnce([]);
    getDailyFixedCostByBranchMock.mockResolvedValue({ perBranch: new Map([['branch-1', 50]]), companyWideDaily: 0 });
    treasuryAggregate.mockResolvedValue({ _sum: { amount: { toNumber: () => 100 } } });

    const report = await getProfitabilityReport(FROM, TO, ['branch-1']);

    expect(report.grossProfit).toBeCloseTo(500, 5); // (10-5)*100
    expect(report.operatingExpenses).toBe(200); // 50*2 days + 100 manual
    expect(report.operatingProfit).toBeCloseTo(300, 5); // 500 - 200
  });

  it('is branch-scoped — a requested branchIds filter is applied to the order/return/payment/treasury queries', async () => {
    const { getProfitabilityReport } = await import('./branchFinancialsService.js');
    orderFindMany.mockResolvedValueOnce([]);
    orderFindMany.mockResolvedValueOnce([]);

    await getProfitabilityReport(FROM, TO, ['branch-a']);

    expect(orderFindMany.mock.calls[0]![0].where.branchId).toEqual({ in: ['branch-a'] });
    expect(orderItemReturnFindMany.mock.calls[0]![0].where.branchId).toEqual({ in: ['branch-a'] });
    expect(treasuryAggregate.mock.calls[0]![0].where.branchId).toEqual({ in: ['branch-a'] });
  });
});
