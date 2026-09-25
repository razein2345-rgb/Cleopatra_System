import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Opening State / Cutover (Phase 3C.2) — regression coverage for the
 * lifecycle's two highest-risk pieces: maker-checker (a genuinely new
 * pattern for this codebase, per the Phase 3C.1 audit) and inventory
 * activation's three reconciliation cases (IN / OUT / no-movement) plus
 * its idempotent-skip behavior.
 */

const cutoverRecordFindUnique = vi.fn();
const cutoverRecordUpdate = vi.fn();
const treasuryOpeningCount = vi.fn();
const inventoryOpeningCount = vi.fn();
const inventoryOpeningFindMany = vi.fn();
const inventoryOpeningUpdate = vi.fn();
const stockLevelFindUnique = vi.fn();
const stockLevelUpsert = vi.fn();
const stockMovementCreate = vi.fn();

function makeTx() {
  return {
    inventoryOpening: {
      findMany: (...args: unknown[]) => inventoryOpeningFindMany(...args),
      update: (...args: unknown[]) => inventoryOpeningUpdate(...args),
    },
    stockLevel: {
      findUnique: (...args: unknown[]) => stockLevelFindUnique(...args),
      upsert: (...args: unknown[]) => stockLevelUpsert(...args),
    },
    stockMovement: { create: (...args: unknown[]) => stockMovementCreate(...args) },
    cutoverRecord: { update: (...args: unknown[]) => cutoverRecordUpdate(...args) },
  };
}

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    cutoverRecord: {
      findUnique: (...args: unknown[]) => cutoverRecordFindUnique(...args),
      update: (...args: unknown[]) => cutoverRecordUpdate(...args),
    },
    // approveCutover's readiness gate — top-level (not tx-scoped), unlike
    // activateCutover's own inventoryOpening.findMany above.
    treasuryOpening: { count: (...args: unknown[]) => treasuryOpeningCount(...args) },
    inventoryOpening: { count: (...args: unknown[]) => inventoryOpeningCount(...args) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
  },
}));

const {
  assertCanApprove,
  activateCutover,
  approveCutover,
  CutoverApprovalNotAllowedError,
  CutoverActivationNotAllowedError,
  InvalidCutoverTransitionError,
  CutoverSupersededError,
  reopenCutover,
  supersedeCutover,
} = await import('./cutoverService.js');

const CUTOVER_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ITEM_A = '33333333-3333-3333-3333-333333333333';
const ITEM_B = '44444444-4444-4444-4444-444444444444';
const ITEM_C = '55555555-5555-5555-5555-555555555555';
const CREATOR_ID = '66666666-6666-6666-6666-666666666666';
const OTHER_STAFF_ID = '77777777-7777-7777-7777-777777777777';

function decimal(n: number) {
  return { toNumber: () => n };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Cutover-revision-round decision (post-3D, Decision C) — the full 4-state
 * matrix, replacing the pre-revision tests (which tested the OLD rule: any
 * authenticated caller could approve someone else's record, and ADMIN
 * could self-approve). This is the ONE authoritative test of the shared
 * primitive's boolean logic — `approveCutover`/`approveCustomerOpening`/
 * `approveSupplierOpening` each get a much thinner integration test below
 * (and in openingStateService.test.ts) that only confirms they call this
 * function correctly and persist its return value, not the full matrix
 * three times over.
 */
describe('assertCanApprove — maker-checker (post-revision: ADMIN+ minimum, no ADMIN self-approval)', () => {
  it('a non-admin cannot approve even someone ELSE\'s record — the new minimum-approver-role gate', () => {
    expect(() => assertCanApprove(CREATOR_ID, OTHER_STAFF_ID, [])).toThrow(CutoverApprovalNotAllowedError);
  });

  it('an ADMIN cannot approve their OWN record — self-approval is fully blocked now, no ADMIN exception', () => {
    expect(() => assertCanApprove(CREATOR_ID, CREATOR_ID, ['ADMIN'])).toThrow(CutoverApprovalNotAllowedError);
  });

  it('a SUPER_ADMIN CAN approve their own record — the one remaining emergency exception — and it reports true', () => {
    expect(assertCanApprove(CREATOR_ID, CREATOR_ID, ['SUPER_ADMIN'])).toBe(true);
  });

  it('an ADMIN CAN approve someone ELSE\'s record — the normal case — and it reports false (not a self-approved exception)', () => {
    expect(assertCanApprove(CREATOR_ID, OTHER_STAFF_ID, ['ADMIN'])).toBe(false);
  });
});

/**
 * Thin integration coverage — confirms `approveCutover` actually wires
 * `assertCanApprove` with the right fields (`createdById`) and correctly
 * persists its return value as `selfApprovedException`. Does not re-test
 * the role/self-approval matrix itself (see the dedicated block above).
 */
describe('approveCutover — maker-checker integration', () => {
  function setupReviewCutover(createdById: string) {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, status: 'REVIEW', createdById });
    treasuryOpeningCount.mockResolvedValue(0);
    inventoryOpeningCount.mockResolvedValue(0);
    cutoverRecordUpdate.mockResolvedValue({
      id: CUTOVER_ID,
      branchId: BRANCH_ID,
      lastManualDate: new Date('2026-09-30'),
      goLiveDate: new Date('2026-10-01'),
      status: 'APPROVED',
      isSuperseded: false,
      supersededById: null,
      supersededAt: null,
      supersededReason: null,
      createdById,
      reviewedById: null,
      reviewedAt: null,
      approvedById: OTHER_STAFF_ID,
      approvedAt: new Date(),
      activatedById: null,
      activatedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      notes: null,
      selfApprovedException: createdById === OTHER_STAFF_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it('SUPER_ADMIN approving their OWN cutover succeeds and persists selfApprovedException: true', async () => {
    setupReviewCutover(OTHER_STAFF_ID); // creator === approver
    const result = await approveCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);
    expect(result.selfApprovedException).toBe(true);
    expect(cutoverRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: true }) }),
    );
  });

  it('ADMIN approving someone ELSE\'s cutover succeeds and persists selfApprovedException: false', async () => {
    setupReviewCutover(CREATOR_ID); // creator !== approver (OTHER_STAFF_ID)
    await approveCutover(CUTOVER_ID, OTHER_STAFF_ID, ['ADMIN']);
    expect(cutoverRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: false }) }),
    );
  });

  it('ADMIN approving their OWN cutover is rejected before any update', async () => {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, status: 'REVIEW', createdById: OTHER_STAFF_ID });
    await expect(approveCutover(CUTOVER_ID, OTHER_STAFF_ID, ['ADMIN'])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });

  it('a non-admin approving someone else\'s cutover is rejected before any update', async () => {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, status: 'REVIEW', createdById: CREATOR_ID });
    await expect(approveCutover(CUTOVER_ID, OTHER_STAFF_ID, [])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });
});

describe('activateCutover', () => {
  function setupCutover() {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, branchId: BRANCH_ID, status: 'APPROVED' });
    cutoverRecordUpdate.mockResolvedValue({
      id: CUTOVER_ID,
      branchId: BRANCH_ID,
      lastManualDate: new Date('2026-09-30'),
      goLiveDate: new Date('2026-10-01'),
      status: 'ACTIVE',
      isSuperseded: false,
      supersededById: null,
      supersededAt: null,
      supersededReason: null,
      createdById: CREATOR_ID,
      reviewedById: null,
      reviewedAt: null,
      approvedById: null,
      approvedAt: null,
      activatedById: OTHER_STAFF_ID,
      activatedAt: new Date(),
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    inventoryOpeningUpdate.mockResolvedValue({});
  }

  it('only a SUPER_ADMIN may activate', async () => {
    setupCutover();
    await expect(activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['ADMIN'])).rejects.toThrow(CutoverActivationNotAllowedError);
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });

  it('rejects activation of a SUPERSEDED cutover even though its status is APPROVED — nothing is written', async () => {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, branchId: BRANCH_ID, status: 'APPROVED', isSuperseded: true });
    inventoryOpeningFindMany.mockResolvedValue([{ id: 'op-1', inventoryItemId: ITEM_A, quantity: decimal(140) }]);
    await expect(activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'])).rejects.toThrow(CutoverSupersededError);
    expect(stockMovementCreate).not.toHaveBeenCalled();
    expect(stockLevelUpsert).not.toHaveBeenCalled();
    expect(inventoryOpeningUpdate).not.toHaveBeenCalled();
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });

  it('rejects activation of a cutover that is not APPROVED', async () => {
    cutoverRecordFindUnique.mockResolvedValue({ id: CUTOVER_ID, branchId: BRANCH_ID, status: 'DRAFT' });
    await expect(activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'])).rejects.toThrow(InvalidCutoverTransitionError);
  });

  it('opening quantity > current StockLevel creates an IN movement for the difference', async () => {
    setupCutover();
    inventoryOpeningFindMany.mockResolvedValue([{ id: 'op-1', inventoryItemId: ITEM_A, quantity: decimal(140) }]);
    stockLevelFindUnique.mockResolvedValue({ quantityOnHand: decimal(100) });

    await activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);

    expect(stockMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ inventoryItemId: ITEM_A, branchId: BRANCH_ID, type: 'IN', quantity: 40, inventoryOpeningId: 'op-1' }),
    });
    expect(inventoryOpeningUpdate).toHaveBeenCalledWith({ where: { id: 'op-1' }, data: { activatedAt: expect.any(Date) } });
  });

  it('opening quantity < current StockLevel creates an OUT movement for the difference', async () => {
    setupCutover();
    inventoryOpeningFindMany.mockResolvedValue([{ id: 'op-2', inventoryItemId: ITEM_B, quantity: decimal(80) }]);
    stockLevelFindUnique.mockResolvedValue({ quantityOnHand: decimal(100) });

    await activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);

    expect(stockMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ inventoryItemId: ITEM_B, type: 'OUT', quantity: 20, inventoryOpeningId: 'op-2' }),
    });
  });

  it('opening quantity == current StockLevel creates NO StockMovement, only activatedAt', async () => {
    setupCutover();
    inventoryOpeningFindMany.mockResolvedValue([{ id: 'op-3', inventoryItemId: ITEM_C, quantity: decimal(100) }]);
    stockLevelFindUnique.mockResolvedValue({ quantityOnHand: decimal(100) });

    await activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);

    expect(stockMovementCreate).not.toHaveBeenCalled();
    expect(stockLevelUpsert).not.toHaveBeenCalled();
    expect(inventoryOpeningUpdate).toHaveBeenCalledWith({ where: { id: 'op-3' }, data: { activatedAt: expect.any(Date) } });
  });

  it('no prior StockLevel row treats current quantity as 0 (a brand-new item/branch)', async () => {
    setupCutover();
    inventoryOpeningFindMany.mockResolvedValue([{ id: 'op-4', inventoryItemId: ITEM_A, quantity: decimal(50) }]);
    stockLevelFindUnique.mockResolvedValue(null);

    await activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);

    expect(stockMovementCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'IN', quantity: 50 }) });
  });

  it('only queries InventoryOpening rows with activatedAt: null — already-activated rows are never reprocessed (idempotent skip)', async () => {
    setupCutover();
    inventoryOpeningFindMany.mockResolvedValue([]);

    await activateCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN']);

    expect(inventoryOpeningFindMany).toHaveBeenCalledWith({ where: { cutoverId: CUTOVER_ID, activatedAt: null } });
    expect(stockMovementCreate).not.toHaveBeenCalled();
    expect(cutoverRecordUpdate).toHaveBeenCalledWith({
      where: { id: CUTOVER_ID },
      data: { status: 'ACTIVE', activatedById: OTHER_STAFF_ID, activatedAt: expect.any(Date) },
    });
  });
});

/**
 * Owner decision (2026-09-25) — a superseded cutover is dead: reopen and
 * supersede-again reject it (server-side, not just hidden buttons) and write
 * nothing, same as activate above.
 */
describe('reopenCutover / supersedeCutover — superseded records', () => {
  const superseded = { id: CUTOVER_ID, branchId: BRANCH_ID, status: 'APPROVED', isSuperseded: true };

  it('reopen of a superseded cutover is rejected and writes nothing', async () => {
    cutoverRecordFindUnique.mockResolvedValue(superseded);
    await expect(reopenCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'], 'خطأ')).rejects.toThrow(CutoverSupersededError);
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });

  it('superseding an already superseded cutover is rejected — the first who/when/why is never overwritten', async () => {
    cutoverRecordFindUnique.mockResolvedValue(superseded);
    await expect(supersedeCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'], 'سبب تاني')).rejects.toThrow(CutoverSupersededError);
    expect(cutoverRecordUpdate).not.toHaveBeenCalled();
  });

  it('a normal (non-superseded) cutover can still be reopened and superseded', async () => {
    cutoverRecordFindUnique.mockResolvedValue({ ...superseded, isSuperseded: false });
    cutoverRecordUpdate.mockResolvedValue({
      id: CUTOVER_ID, branchId: BRANCH_ID, lastManualDate: new Date('2026-09-30'), goLiveDate: new Date('2026-10-01'),
      status: 'DRAFT', isSuperseded: true, supersededById: null, supersededAt: null, supersededReason: null,
      createdById: CREATOR_ID, reviewedById: null, reviewedAt: null, approvedById: null, approvedAt: null,
      activatedById: null, activatedAt: null, reopenedById: null, reopenedAt: null, reopenReason: null,
      notes: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await expect(reopenCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'], 'تصحيح')).resolves.toBeDefined();
    await expect(supersedeCutover(CUTOVER_ID, OTHER_STAFF_ID, ['SUPER_ADMIN'], 'إلغاء')).resolves.toBeDefined();
    expect(cutoverRecordUpdate).toHaveBeenCalledTimes(2);
  });
});
