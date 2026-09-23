import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17, Phase G — Inventory reconciliation).
 * `getInventoryReconciliationReport` recomputes each item+branch's expected
 * `StockLevel.quantityOnHand` from the `StockMovement` ledger independently
 * and flags any drift — read-only, never writes back to either table.
 */

const stockLevelFindMany = vi.fn();
const stockMovementGroupBy = vi.fn();

function decimal(n: number) {
  return { toNumber: () => n };
}

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    stockLevel: {
      findMany: (...args: unknown[]) => stockLevelFindMany(...args),
    },
    stockMovement: {
      groupBy: (...args: unknown[]) => stockMovementGroupBy(...args),
    },
  },
}));

const { getInventoryReconciliationReport } = await import('./inventoryService.js');

describe('getInventoryReconciliationReport', () => {
  beforeEach(() => {
    stockLevelFindMany.mockReset();
    stockMovementGroupBy.mockReset();
  });

  it('returns an empty report when there are no stock levels at all', async () => {
    stockLevelFindMany.mockResolvedValue([]);

    const rows = await getInventoryReconciliationReport();

    expect(rows).toEqual([]);
    expect(stockMovementGroupBy).not.toHaveBeenCalled();
  });

  it('flags MATCH when the ledger sum agrees with the materialized quantityOnHand', async () => {
    stockLevelFindMany.mockResolvedValue([
      {
        inventoryItemId: 'item-1',
        branchId: 'branch-1',
        quantityOnHand: decimal(30),
        inventoryItem: { name: 'ورق A4' },
        branch: { name: 'كليوباترا' },
      },
    ]);
    stockMovementGroupBy.mockResolvedValue([
      { inventoryItemId: 'item-1', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(50) } },
      { inventoryItemId: 'item-1', branchId: 'branch-1', type: 'OUT', _sum: { quantity: decimal(20) } },
    ]);

    const [row] = await getInventoryReconciliationReport();

    expect(row).toMatchObject({
      inventoryItemId: 'item-1',
      itemName: 'ورق A4',
      branchId: 'branch-1',
      branchName: 'كليوباترا',
      currentQuantityOnHand: 30,
      calculatedQuantityFromMovements: 30,
      difference: 0,
      status: 'MATCH',
    });
  });

  it('flags MISMATCH and reports the correct signed difference when the two disagree', async () => {
    stockLevelFindMany.mockResolvedValue([
      {
        inventoryItemId: 'item-2',
        branchId: 'branch-1',
        quantityOnHand: decimal(12), // materialized value drifted high
        inventoryItem: { name: 'أقلام روتو' },
        branch: { name: 'كليوباترا' },
      },
    ]);
    stockMovementGroupBy.mockResolvedValue([
      { inventoryItemId: 'item-2', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(10) } },
    ]);

    const [row] = await getInventoryReconciliationReport();

    expect(row!.currentQuantityOnHand).toBe(12);
    expect(row!.calculatedQuantityFromMovements).toBe(10);
    expect(row!.difference).toBe(2);
    expect(row!.status).toBe('MISMATCH');
  });

  it('an item+branch with zero recorded movements still reconciles against a zero calculated baseline', async () => {
    stockLevelFindMany.mockResolvedValue([
      {
        inventoryItemId: 'item-3',
        branchId: 'branch-1',
        quantityOnHand: decimal(0),
        inventoryItem: { name: 'صنف جديد' },
        branch: { name: 'كليوباترا' },
      },
    ]);
    stockMovementGroupBy.mockResolvedValue([]);

    const [row] = await getInventoryReconciliationReport();

    expect(row!.calculatedQuantityFromMovements).toBe(0);
    expect(row!.status).toBe('MATCH');
  });

  it('treats sub-thousandth Decimal rounding noise as a MATCH, not a false MISMATCH', async () => {
    stockLevelFindMany.mockResolvedValue([
      {
        inventoryItemId: 'item-4',
        branchId: 'branch-1',
        quantityOnHand: decimal(10.0001),
        inventoryItem: { name: 'ورق مقوى' },
        branch: { name: 'كليوباترا' },
      },
    ]);
    stockMovementGroupBy.mockResolvedValue([
      { inventoryItemId: 'item-4', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(10) } },
    ]);

    const [row] = await getInventoryReconciliationReport();

    expect(row!.difference).toBe(0);
    expect(row!.status).toBe('MATCH');
  });

  it('scopes to a single branch when given a scalar branchId', async () => {
    stockLevelFindMany.mockResolvedValue([]);

    await getInventoryReconciliationReport('branch-1');

    const where = (stockLevelFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.branchId).toBe('branch-1');
  });

  it('scopes to a set of accessible branches when given an array', async () => {
    stockLevelFindMany.mockResolvedValue([]);

    await getInventoryReconciliationReport(['branch-1', 'branch-2']);

    const where = (stockLevelFindMany.mock.calls[0]![0] as { where: { branchId: { in: string[] } } }).where;
    expect(where.branchId).toEqual({ in: ['branch-1', 'branch-2'] });
  });

  it('never filters by branch when called with no branchId (Super Admin / org-wide view)', async () => {
    stockLevelFindMany.mockResolvedValue([]);

    await getInventoryReconciliationReport();

    const where = (stockLevelFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty('branchId');
  });

  it('sorts mismatches by largest absolute drift first, so a reviewer sees what needs attention first', async () => {
    stockLevelFindMany.mockResolvedValue([
      { inventoryItemId: 'small-drift', branchId: 'branch-1', quantityOnHand: decimal(11), inventoryItem: { name: 'A' }, branch: { name: 'Br' } },
      { inventoryItemId: 'big-drift', branchId: 'branch-1', quantityOnHand: decimal(50), inventoryItem: { name: 'B' }, branch: { name: 'Br' } },
      { inventoryItemId: 'no-drift', branchId: 'branch-1', quantityOnHand: decimal(10), inventoryItem: { name: 'C' }, branch: { name: 'Br' } },
    ]);
    stockMovementGroupBy.mockResolvedValue([
      { inventoryItemId: 'small-drift', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(10) } },
      { inventoryItemId: 'big-drift', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(10) } },
      { inventoryItemId: 'no-drift', branchId: 'branch-1', type: 'IN', _sum: { quantity: decimal(10) } },
    ]);

    const rows = await getInventoryReconciliationReport();

    expect(rows.map((r) => r.inventoryItemId)).toEqual(['big-drift', 'small-drift', 'no-drift']);
  });
});
