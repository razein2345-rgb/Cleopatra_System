import { describe, expect, it, vi } from 'vitest';

/**
 * Cutover-revision-round decision (post-3D, Decision B3) — the compensating
 * ADJUSTMENT for material already physically consumed off-system before
 * cutover, on an Order continuing a pre-cutover commitment
 * (`Order.customerOpeningId`). Covers the 5 cases the owner asked for by
 * name:
 *   1. success path — a positive ADJUSTMENT + StockLevel increment, linked
 *      to the order via `StockMovement.orderId`.
 *   2. multi-material — validated PER-MATERIAL, not per-order aggregate.
 *   3. rejection — a declared quantity that exceeds its own material's
 *      requirement.
 *   4. rejection — `alreadyConsumedOffSystem` with no `customerOpeningId`.
 *   5. `movementDelta`'s positive-only ADJUSTMENT semantics actually match
 *      the value flowing through this exact call site.
 *
 * Two different testing strategies, mirroring the two different kinds of
 * code involved (same split `orderService.discount.test.ts` already uses
 * for `assertItemDiscountsValid`):
 *   - Cases 2/3/4 exercise `assertAlreadyConsumedWithinRequirement` (a
 *     pure, synchronous function) directly with plain data — zero mocking.
 *   - Cases 1/5 exercise `applyAlreadyConsumedAdjustment` (extracted from
 *     `createOrder`'s transaction body into `inventoryService.ts`,
 *     mirroring `deductStockForOrderItem`'s own shape, specifically so it
 *     is testable on its own) with a minimal fake `tx` object — no need to
 *     stand up `createOrder`'s full transaction machinery for these.
 *
 * A sixth test, separate from the 5 requested cases, answers the owner's
 * explicit question of how "zero partial writes on rejection" is verified:
 * since `assertAlreadyConsumedWithinRequirement` runs synchronously BEFORE
 * `prisma.$transaction` is ever called in `createOrder` (every actual
 * write lives inside that transaction callback), a rejection here is a
 * structural guarantee, not just a behavioral one — proven below by
 * asserting the `$transaction` mock was never invoked at all.
 */

const transactionMock = vi.fn();
const attachmentFindMany = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    attachment: { findMany: (...args: unknown[]) => attachmentFindMany(...args) },
  },
}));

const buildPricingContextMock = vi.fn();
const computeItemPricingMock = vi.fn();

vi.mock('./pricingEngineService.js', () => ({
  buildPricingContext: (...args: unknown[]) => buildPricingContextMock(...args),
  computeItemPricing: (...args: unknown[]) => computeItemPricingMock(...args),
  PricingInputError: class PricingInputError extends Error {},
}));

const {
  createOrder,
  assertAlreadyConsumedWithinRequirement,
  AlreadyConsumedExceedsRequirementError,
  AlreadyConsumedWithoutCustomerOpeningError,
} = await import('./orderService.js');
const { applyAlreadyConsumedAdjustment, movementDelta } = await import('./inventoryService.js');

function fakeTx() {
  return {
    stockMovement: { create: vi.fn() },
    stockLevel: { upsert: vi.fn() },
  };
}

describe('applyAlreadyConsumedAdjustment (Test B3, case 1 + case 5)', () => {
  it('case 1: records a positive ADJUSTMENT movement linked to the order and increments StockLevel by the same amount', async () => {
    const tx = fakeTx();

    await applyAlreadyConsumedAdjustment(
      tx as never,
      'item-1',
      'branch-1',
      6,
      'تسوية استهلاك سابق قبل التفعيل — أوردر INV-1',
      'order-1',
    );

    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'item-1',
        branchId: 'branch-1',
        type: 'ADJUSTMENT',
        quantity: 6,
        reference: 'تسوية استهلاك سابق قبل التفعيل — أوردر INV-1',
        orderId: 'order-1',
      },
    });
    expect(tx.stockLevel.upsert).toHaveBeenCalledWith({
      where: { inventoryItemId_branchId: { inventoryItemId: 'item-1', branchId: 'branch-1' } },
      create: { inventoryItemId: 'item-1', branchId: 'branch-1', quantityOnHand: 6 },
      update: { quantityOnHand: { increment: 6 } },
    });
  });

  it('case 1b: a fresh StockLevel row is created with the declared quantity when none exists yet for this item+branch', async () => {
    const tx = fakeTx();
    await applyAlreadyConsumedAdjustment(tx as never, 'item-2', 'branch-2', 3, 'ref', 'order-2');
    const upsertArg = tx.stockLevel.upsert.mock.calls[0]![0] as { create: { quantityOnHand: number } };
    expect(upsertArg.create.quantityOnHand).toBe(3);
  });

  it('case 5: the StockLevel increment always equals movementDelta("ADJUSTMENT", quantity) — proving this call site never ends up signing it negative', async () => {
    for (const quantity of [1, 6, 0.5, 1000]) {
      const tx = fakeTx();
      await applyAlreadyConsumedAdjustment(tx as never, 'item-x', 'branch-x', quantity, 'ref', 'order-x');
      const upsertArg = tx.stockLevel.upsert.mock.calls[0]![0] as { update: { quantityOnHand: { increment: number } } };
      expect(upsertArg.update.quantityOnHand.increment).toBe(movementDelta('ADJUSTMENT', quantity));
      expect(upsertArg.update.quantityOnHand.increment).toBe(quantity);
      expect(upsertArg.update.quantityOnHand.increment).toBeGreaterThan(0);
    }
  });
});

describe('assertAlreadyConsumedWithinRequirement (Test B3, cases 2/3/4)', () => {
  it('does nothing when no item declares any already-consumed quantity, regardless of customerOpeningId', () => {
    const items = [{}, { alreadyConsumedOffSystem: [] }];
    const priced = [
      { materials: undefined, inventoryItemId: 'x', sheetsNeeded: 5 },
      { materials: undefined, inventoryItemId: 'y', sheetsNeeded: 2 },
    ];
    expect(() => assertAlreadyConsumedWithinRequirement(items, priced, false)).not.toThrow();
  });

  it('case 2: validates PER-MATERIAL — passes when each material of a multi-material item stays within its own requirement', () => {
    const items = [
      {
        alreadyConsumedOffSystem: [
          { inventoryItemId: 'paper', quantity: 8 },
          { inventoryItemId: 'cover', quantity: 3 },
        ],
      },
    ];
    const priced = [
      {
        materials: [
          { inventoryItemId: 'paper', sheetsNeeded: 10 },
          { inventoryItemId: 'cover', sheetsNeeded: 4 },
        ],
        inventoryItemId: null,
        sheetsNeeded: null,
      },
    ];
    expect(() => assertAlreadyConsumedWithinRequirement(items, priced, true)).not.toThrow();
  });

  it('case 2b: rejects a multi-material item when only ONE material is over-declared, even though the sum across materials is not obviously excessive', () => {
    const items = [
      {
        alreadyConsumedOffSystem: [
          { inventoryItemId: 'paper', quantity: 12 }, // exceeds paper's own requirement of 10
          { inventoryItemId: 'cover', quantity: 1 }, // well within cover's requirement of 4
        ],
      },
    ];
    const priced = [
      {
        materials: [
          { inventoryItemId: 'paper', sheetsNeeded: 10 },
          { inventoryItemId: 'cover', sheetsNeeded: 4 },
        ],
        inventoryItemId: null,
        sheetsNeeded: null,
      },
    ];
    let caught: unknown;
    try {
      assertAlreadyConsumedWithinRequirement(items, priced, true);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AlreadyConsumedExceedsRequirementError);
    expect((caught as InstanceType<typeof AlreadyConsumedExceedsRequirementError>).inventoryItemId).toBe('paper');
    expect((caught as InstanceType<typeof AlreadyConsumedExceedsRequirementError>).declared).toBe(12);
    expect((caught as InstanceType<typeof AlreadyConsumedExceedsRequirementError>).required).toBe(10);
  });

  it('case 3: rejects a single-material declared quantity that exceeds that item\'s own requirement', () => {
    const items = [{ alreadyConsumedOffSystem: [{ inventoryItemId: 'item-1', quantity: 15 }] }];
    const priced = [{ materials: undefined, inventoryItemId: 'item-1', sheetsNeeded: 10 }];
    expect(() => assertAlreadyConsumedWithinRequirement(items, priced, true)).toThrow(AlreadyConsumedExceedsRequirementError);
  });

  it('case 3b: a declared quantity exactly equal to the requirement is allowed (boundary — not an "exceeds" case)', () => {
    const items = [{ alreadyConsumedOffSystem: [{ inventoryItemId: 'item-1', quantity: 10 }] }];
    const priced = [{ materials: undefined, inventoryItemId: 'item-1', sheetsNeeded: 10 }];
    expect(() => assertAlreadyConsumedWithinRequirement(items, priced, true)).not.toThrow();
  });

  it('case 4: rejects any alreadyConsumedOffSystem entry when the order has no customerOpeningId at all', () => {
    const items = [{ alreadyConsumedOffSystem: [{ inventoryItemId: 'item-1', quantity: 1 }] }];
    const priced = [{ materials: undefined, inventoryItemId: 'item-1', sheetsNeeded: 10 }];
    expect(() => assertAlreadyConsumedWithinRequirement(items, priced, false)).toThrow(AlreadyConsumedWithoutCustomerOpeningError);
  });
});

describe('createOrder — zero partial writes on rejection (structural proof)', () => {
  it('throws before prisma.$transaction is ever entered when assertAlreadyConsumedWithinRequirement rejects', async () => {
    transactionMock.mockClear();
    attachmentFindMany.mockClear();
    buildPricingContextMock.mockResolvedValue({});
    computeItemPricingMock.mockReturnValue({
      total: 100,
      breakdown: {},
      sheetsNeeded: 10,
      inventoryItemId: 'item-1',
      sizeFamilyKey: null,
      realSizeLabel: null,
    });

    const input = {
      partnerId: 'partner-1',
      branchId: 'branch-1',
      staffId: 'staff-1',
      customerOpeningId: 'opening-1',
      items: [
        {
          pricing: { kind: 'MANUAL' },
          productionTrack: null,
          alreadyConsumedOffSystem: [{ inventoryItemId: 'item-1', quantity: 999 }],
        },
      ],
    };

    await expect(createOrder(input as never, new Map())).rejects.toBeInstanceOf(AlreadyConsumedExceedsRequirementError);

    // The structural guarantee: every real write (order, items, stock
    // deduction, the ADJUSTMENT itself) happens exclusively inside the
    // prisma.$transaction callback. If the transaction was never entered,
    // none of those writes could possibly have run — a database round-trip
    // isn't needed to prove "zero partial writes", the call graph already
    // proves it.
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
