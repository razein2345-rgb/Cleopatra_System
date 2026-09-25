import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Post-3C.2-verification correction — regression coverage for the branch-
 * isolation guard added to `applyOpeningCreditHandler` (previously missing
 * entirely: a non-Super-Admin caller scoped to Branch A could apply
 * Opening Credit to a Branch B order, unlike every other Order mutation).
 *
 * This is this codebase's first controller-level test. Everything
 * DB-touching (`loadOrderBranchOr404`, `applyOpeningCreditPayment`,
 * `recordAudit`) is mocked, but the real `canAccessBranch` from
 * `authContext.ts` runs unmocked — that pure, zero-DB function IS the
 * actual authorization decision this correction added, so it is exercised
 * for real rather than assumed correct by a mock.
 */

const loadOrderBranchOr404 = vi.fn();
const applyOpeningCreditPayment = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('./orders.js', () => ({ loadOrderBranchOr404 }));
vi.mock('../services/orderService.js', () => ({
  applyOpeningCreditPayment,
  NoApprovedCustomerOpeningError: class NoApprovedCustomerOpeningError extends Error {},
  OpeningCreditExceededError: class OpeningCreditExceededError extends Error {},
  PaymentExceedsRemainingError: class PaymentExceedsRemainingError extends Error {
    constructor(public readonly remaining = 0) {
      super('exceeds');
    }
  },
  OrderHasNoPartnerError: class OrderHasNoPartnerError extends Error {},
  OrderNotFoundError: class OrderNotFoundError extends Error {},
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const { applyOpeningCreditHandler } = await import('./openingState.js');

interface FakeAuth {
  staffId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

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

function makeReq(id: string, auth: FakeAuth) {
  return {
    params: { id },
    body: { amount: 100, method: 'CASH' },
    header: () => undefined,
    auth,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyOpeningCreditHandler — branch isolation', () => {
  it('a caller scoped to the order\'s own branch may apply Opening Credit', async () => {
    loadOrderBranchOr404.mockResolvedValue('branch-1');
    applyOpeningCreditPayment.mockResolvedValue({ order: {}, paymentId: 'payment-1' });
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).toHaveBeenCalledWith('order-1', 100, 'CASH');
    expect(res.statusCode).toBe(201);
  });

  it('a caller scoped to a different branch is rejected with 403 and never reaches the service', async () => {
    loadOrderBranchOr404.mockResolvedValue('branch-2');
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('an ADMIN scoped to a different branch is rejected the same as any other non-Super-Admin role', async () => {
    loadOrderBranchOr404.mockResolvedValue('branch-2');
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-1', { staffId: 'staff-1', roleNames: ['ADMIN'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('SUPER_ADMIN bypasses branch scoping (canAccessBranch\'s own global bypass), regardless of accessibleBranchIds', async () => {
    loadOrderBranchOr404.mockResolvedValue('branch-2');
    applyOpeningCreditPayment.mockResolvedValue({ order: {}, paymentId: 'payment-1' });
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-1', { staffId: 'staff-1', roleNames: ['SUPER_ADMIN'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).toHaveBeenCalledWith('order-1', 100, 'CASH');
    expect(res.statusCode).toBe(201);
  });

  it('a nonexistent order 404s before any branch check or service call', async () => {
    loadOrderBranchOr404.mockImplementation(async (_id: string, r: { status: (n: number) => { json: (b: unknown) => void } }) => {
      r.status(404).json({ success: false, error: { message: 'Order not found' } });
      return null;
    });
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-missing', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('an amount exceeding the remaining credit still surfaces as a normal service error after passing the branch check', async () => {
    loadOrderBranchOr404.mockResolvedValue('branch-1');
    const { OpeningCreditExceededError } = await import('../services/orderService.js');
    applyOpeningCreditPayment.mockRejectedValue(new (OpeningCreditExceededError as new (...a: never[]) => Error)());
    const res = makeRes();

    await applyOpeningCreditHandler(
      makeReq('order-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }),
      res as never,
    );

    expect(applyOpeningCreditPayment).toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
  });
});
