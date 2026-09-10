import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * `get_purchase_requests_due` is a pure pass-through to
 * `purchaseRequestService.ts::listPurchaseRequests(status?)` — these tests
 * lock in that it forwards `status` (or its absence) unmodified, imposing
 * no default of its own, and never touches any write function from that
 * module (`markPurchaseRequestPurchased`/`maybeCreatePurchaseRequest`/
 * `createBoardsCatalogPurchaseRequests`).
 */
const listPurchaseRequests = vi.fn();

vi.mock('../../purchaseRequestService.js', () => ({
  listPurchaseRequests: (...args: unknown[]) => listPurchaseRequests(...args),
}));

const { getPurchaseRequestsDueTool } = await import('./getPurchaseRequestsDue.js');

function purchaseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    kind: 'STOCK_SHORTFALL',
    inventoryItemId: 'item-1',
    inventoryItemName: 'ورق كوشيه 300 جرام',
    boardsCatalogItemId: null,
    boardsCatalogItemName: null,
    supplierId: 'supplier-1',
    supplierName: 'مورد الورق',
    orderId: 'order-1',
    orderInvoiceNumber: 'CLP-INV-2026-000001',
    orderItemId: 'item-row-1',
    quantityNeeded: 50,
    status: 'PENDING',
    purchasedQuantity: null,
    purchasedAmount: null,
    purchasedAt: null,
    purchasedByName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  listPurchaseRequests.mockReset();
});

describe('get_purchase_requests_due tool — schema', () => {
  it('accepts no status, "PENDING", or "PURCHASED"', () => {
    expect(() => getPurchaseRequestsDueTool.inputSchema.parse({})).not.toThrow();
    expect(() => getPurchaseRequestsDueTool.inputSchema.parse({ status: 'PENDING' })).not.toThrow();
    expect(() => getPurchaseRequestsDueTool.inputSchema.parse({ status: 'PURCHASED' })).not.toThrow();
  });

  it('rejects a status value outside the real PurchaseRequestStatus enum', () => {
    expect(getPurchaseRequestsDueTool.inputSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
    expect(getPurchaseRequestsDueTool.inputSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });
});

describe('get_purchase_requests_due tool — authorization declaration', () => {
  it('requires inventory.view, the same permission the real route already uses', () => {
    expect(getPurchaseRequestsDueTool.requiredPermission).toBe('inventory.view');
    expect(getPurchaseRequestsDueTool.requiresSuperAdmin).toBeUndefined();
  });
});

describe('get_purchase_requests_due tool — forwards status unmodified (no invented default)', () => {
  it('calls listPurchaseRequests(undefined) when no status is given — same as the real service default', async () => {
    listPurchaseRequests.mockResolvedValueOnce([purchaseRequest(), purchaseRequest({ id: 'pr-2', status: 'PURCHASED' })]);
    const result = await getPurchaseRequestsDueTool.execute({}, { auth: {} as never });
    expect(listPurchaseRequests).toHaveBeenCalledWith(undefined);
    expect(result).toHaveLength(2);
  });

  it('forwards status: "PENDING" unmodified', async () => {
    listPurchaseRequests.mockResolvedValueOnce([purchaseRequest({ status: 'PENDING' })]);
    const result = (await getPurchaseRequestsDueTool.execute({ status: 'PENDING' }, { auth: {} as never })) as unknown[];
    expect(listPurchaseRequests).toHaveBeenCalledWith('PENDING');
    expect(result).toHaveLength(1);
  });

  it('forwards status: "PURCHASED" unmodified', async () => {
    listPurchaseRequests.mockResolvedValueOnce([
      purchaseRequest({ id: 'pr-3', status: 'PURCHASED', purchasedQuantity: 50, purchasedAmount: 1200, purchasedByName: 'محمد' }),
    ]);
    const result = (await getPurchaseRequestsDueTool.execute({ status: 'PURCHASED' }, { auth: {} as never })) as { status: string }[];
    expect(listPurchaseRequests).toHaveBeenCalledWith('PURCHASED');
    expect(result[0]!.status).toBe('PURCHASED');
  });

  it('returns an empty array as-is when the service finds nothing — never invents a row', async () => {
    listPurchaseRequests.mockResolvedValueOnce([]);
    const result = await getPurchaseRequestsDueTool.execute({ status: 'PENDING' }, { auth: {} as never });
    expect(result).toEqual([]);
  });

  it('passes through both real row kinds (STOCK_SHORTFALL and BOARDS_*) without altering their shape', async () => {
    const stockRow = purchaseRequest();
    const boardsRow = purchaseRequest({
      id: 'pr-4',
      kind: 'BOARDS_PURCHASE',
      inventoryItemId: null,
      inventoryItemName: null,
      boardsCatalogItemId: 'board-1',
      boardsCatalogItemName: 'روول أب',
      quantityNeeded: null,
    });
    listPurchaseRequests.mockResolvedValueOnce([stockRow, boardsRow]);
    const result = await getPurchaseRequestsDueTool.execute({}, { auth: {} as never });
    expect(result).toEqual([stockRow, boardsRow]);
  });
});
