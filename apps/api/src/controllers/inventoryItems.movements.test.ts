import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Branch isolation for editing/deleting an existing StockMovement
 * (owner decision, 2026-09-25 - found in the read-only access review).
 * Both handlers used to work on any movement id with no branch check, and
 * the edit accepted a `branchId` that moves the movement (and its paired
 * quick-sale treasury entry) to another branch. Now access is checked
 * against the MOVEMENT's own branch (plus the destination when it moves),
 * never the caller's home branch, and the audit log records the movement's
 * real branch instead of the actor's.
 *
 * Same technique as `cutover.test.ts`: services and audit are mocked, the
 * real `canAccessBranch` from `authContext.ts` runs - the actual decision.
 */

const getStockMovementBranchId = vi.fn();
const updateStockMovement = vi.fn();
const deleteStockMovement = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/inventoryService.js', () => ({
  getStockMovementBranchId,
  updateStockMovement,
  deleteStockMovement,
  StockMovementNotFoundError: class StockMovementNotFoundError extends Error {},
  InventoryItemNotFoundError: class InventoryItemNotFoundError extends Error {},
  InventoryItemInUseError: class InventoryItemInUseError extends Error {},
  DuplicateBarcodeError: class DuplicateBarcodeError extends Error {},
  NoSalePriceError: class NoSalePriceError extends Error {},
  createInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
  getInventoryItem: vi.fn(),
  getInventoryItemByBarcode: vi.fn(),
  getInventoryReconciliationReport: vi.fn(),
  listInventoryItems: vi.fn(),
  listItemsNeedingSupplier: vi.fn(),
  listStockMovements: vi.fn(),
  quickSaleFromInventory: vi.fn(),
  recordStockMovement: vi.fn(),
  updateInventoryItem: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));
vi.mock('../services/treasuryService.js', () => ({ DayClosedError: class DayClosedError extends Error {} }));
vi.mock('../services/idempotencyService.js', () => ({
  idempotencyKeyFromHeader: vi.fn(),
  runIdempotent: vi.fn(),
  sendIdempotencyError: vi.fn(),
}));
vi.mock('./treasuryEntries.js', () => ({ resolveBranchScope: vi.fn() }));

const { updateStockMovementHandler, deleteStockMovementHandler } = await import('./inventoryItems.js');

const MOVEMENT_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

/** A cashier-style caller whose home branch is A and who has no grant on B. */
const branchAUser: FakeAuth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['ADMIN'], accessibleBranchIds: [BRANCH_A] };
const superAdmin: FakeAuth = { staffId: 'root', branchId: BRANCH_A, roleNames: ['SUPER_ADMIN'], accessibleBranchIds: [BRANCH_A] };

function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function makeReq(auth: FakeAuth, body: unknown = {}) {
  return { params: { id: ITEM_ID, movementId: MOVEMENT_ID }, body, auth } as never;
}

function movementResult(branchId: string) {
  return {
    item: { id: ITEM_ID },
    previous: { id: MOVEMENT_ID, branchId, type: 'OUT', quantity: 2, reference: 'بيع سريع', date: '2026-09-25T00:00:00.000Z' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function expectNothingWritten() {
  expect(updateStockMovement).not.toHaveBeenCalled();
  expect(deleteStockMovement).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

describe('updateStockMovementHandler - branch isolation', () => {
  it('a caller without access to the movement\'s branch gets 403 and nothing is written', async () => {
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();

    await updateStockMovementHandler(makeReq(branchAUser, { quantity: 5 }), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('moving a movement OUT of the caller\'s reach is rejected even when the source branch is theirs', async () => {
    getStockMovementBranchId.mockResolvedValue(BRANCH_A);
    const res = makeRes();

    await updateStockMovementHandler(makeReq(branchAUser, { branchId: BRANCH_B }), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('moving a movement IN from a branch the caller cannot access is rejected too (source checked, not just destination)', async () => {
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();

    await updateStockMovementHandler(makeReq(branchAUser, { branchId: BRANCH_A }), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted movement is 404, not a permission leak', async () => {
    const { StockMovementNotFoundError } = await import('../services/inventoryService.js');
    getStockMovementBranchId.mockRejectedValue(new (StockMovementNotFoundError as new () => Error)());
    const res = makeRes();

    await updateStockMovementHandler(makeReq(branchAUser, { quantity: 1 }), res as never);

    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('a caller with access to the movement\'s branch may edit it, and the audit records the MOVEMENT\'s branch, not the actor\'s home branch', async () => {
    // Home branch A, granted access to B - editing a B movement must be audited under B.
    const grantedUser: FakeAuth = { ...branchAUser, accessibleBranchIds: [BRANCH_A, BRANCH_B] };
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    updateStockMovement.mockResolvedValue({ ...movementResult(BRANCH_B), updatedTreasuryEntry: { id: 'entry-1', amount: 30, branchId: BRANCH_B } });
    const res = makeRes();

    await updateStockMovementHandler(makeReq(grantedUser, { quantity: 3 }), res as never);

    expect(updateStockMovement).toHaveBeenCalledWith(MOVEMENT_ID, { quantity: 3 });
    expect(res.body).toMatchObject({ success: true });
    const branchIds = recordAudit.mock.calls.map((c) => (c[0] as { branchId: string }).branchId);
    expect(branchIds).toEqual([BRANCH_B, BRANCH_B]); // movement audit + paired treasury entry audit
    expect(branchIds).not.toContain(BRANCH_A);
  });

  it('moving between two branches the caller can access is allowed, audited under the ORIGINAL branch with the new one in the payload', async () => {
    const grantedUser: FakeAuth = { ...branchAUser, accessibleBranchIds: [BRANCH_A, BRANCH_B] };
    getStockMovementBranchId.mockResolvedValue(BRANCH_A);
    updateStockMovement.mockResolvedValue({ ...movementResult(BRANCH_A), updatedTreasuryEntry: { id: 'entry-1', amount: 30, branchId: BRANCH_B } });
    const res = makeRes();

    await updateStockMovementHandler(makeReq(grantedUser, { branchId: BRANCH_B }), res as never);

    expect(updateStockMovement).toHaveBeenCalledTimes(1);
    const [movementAudit, entryAudit] = recordAudit.mock.calls.map((c) => c[0] as { branchId: string; newValue: Record<string, unknown> });
    expect(movementAudit!.branchId).toBe(BRANCH_A);
    expect(movementAudit!.newValue).toMatchObject({ branchId: BRANCH_B });
    expect(entryAudit!.branchId).toBe(BRANCH_A);
    expect(entryAudit!.newValue).toMatchObject({ branchId: BRANCH_B });
  });

  it('a SUPER_ADMIN may edit a movement of any branch', async () => {
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    updateStockMovement.mockResolvedValue({ ...movementResult(BRANCH_B), updatedTreasuryEntry: null });
    const res = makeRes();

    await updateStockMovementHandler(makeReq(superAdmin, { quantity: 4 }), res as never);

    expect(res.body).toMatchObject({ success: true });
    expect(updateStockMovement).toHaveBeenCalledTimes(1);
  });
});

describe('deleteStockMovementHandler - branch isolation', () => {
  it('a caller without access to the movement\'s branch gets 403 and nothing is written (no stock or treasury reversal)', async () => {
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();

    await deleteStockMovementHandler(makeReq(branchAUser), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted movement is 404', async () => {
    const { StockMovementNotFoundError } = await import('../services/inventoryService.js');
    getStockMovementBranchId.mockRejectedValue(new (StockMovementNotFoundError as new () => Error)());
    const res = makeRes();

    await deleteStockMovementHandler(makeReq(branchAUser), res as never);

    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('a caller with access deletes it, and both audit rows carry the movement\'s branch', async () => {
    const grantedUser: FakeAuth = { ...branchAUser, accessibleBranchIds: [BRANCH_A, BRANCH_B] };
    getStockMovementBranchId.mockResolvedValue(BRANCH_B);
    deleteStockMovement.mockResolvedValue({ ...movementResult(BRANCH_B), reversedTreasuryEntry: { id: 'entry-1', amount: 30 } });
    const res = makeRes();

    await deleteStockMovementHandler(makeReq(grantedUser), res as never);

    expect(deleteStockMovement).toHaveBeenCalledWith(MOVEMENT_ID, grantedUser.staffId);
    const branchIds = recordAudit.mock.calls.map((c) => (c[0] as { branchId: string }).branchId);
    expect(branchIds).toEqual([BRANCH_B, BRANCH_B]);
  });
});
