import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Opening State / Cutover (Phase 3C.2) — regression coverage for
 * `applyOpeningCreditPayment`'s hard correctness invariant:
 *
 *   SUM(Payment.amount WHERE sourceType = OPENING_CREDIT_APPLICATION
 *       AND order.partnerId = X) <= CustomerOpening(X).creditAmount
 *
 * under concurrent requests. Uses the exact same fake-`$transaction`-
 * chaining + advisory-lock-key-capture technique already established in
 * `treasuryService.test.ts`'s "Treasury day-closure concurrency" block —
 * `pg_advisory_xact_lock` makes Postgres itself serialize two
 * transactions taking the same key, so chaining the mock's calls in
 * submission order reproduces that guarantee without a real database.
 */

const orderFindUnique = vi.fn();
const customerOpeningFindUnique = vi.fn();
const paymentAggregate = vi.fn();
const paymentCreate = vi.fn();
const orderFindUniqueOrThrow = vi.fn();
const orderItemReturnAggregate = vi.fn();
const executeRawLockKeys: string[] = [];

function makeTx() {
  return {
    customerOpening: { findUnique: (...args: unknown[]) => customerOpeningFindUnique(...args) },
    payment: {
      aggregate: (...args: unknown[]) => paymentAggregate(...args),
      create: (...args: unknown[]) => paymentCreate(...args),
    },
    order: { findUniqueOrThrow: (...args: unknown[]) => orderFindUniqueOrThrow(...args) },
    orderItemReturn: { aggregate: (...args: unknown[]) => orderItemReturnAggregate(...args) },
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      executeRawLockKeys.push(String(values[0]));
      return Promise.resolve(undefined);
    },
  };
}

let transactionChain = Promise.resolve();
const transactionMock = vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
  const run = transactionChain.then(() => fn(makeTx()));
  transactionChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
});

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    $transaction: (...args: [(tx: unknown) => Promise<unknown>]) => transactionMock(...args),
  },
}));

const { applyOpeningCreditPayment, OpeningCreditExceededError, NoApprovedCustomerOpeningError, OrderHasNoPartnerError, OrderNotFoundError, PaymentExceedsRemainingError } =
  await import('./orderService.js');

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';

// real Decimals: the overpayment check does Decimal arithmetic on these sums
function decimal(n: number) {
  return new Prisma.Decimal(n);
}

beforeEach(() => {
  vi.clearAllMocks();
  executeRawLockKeys.length = 0;
  transactionChain = Promise.resolve();
  orderItemReturnAggregate.mockResolvedValue({ _sum: { refundAmount: null } });
});

describe('applyOpeningCreditPayment', () => {
  it('creates a Payment with sourceType OPENING_CREDIT_APPLICATION and no TreasuryEntry', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(5000) });
    paymentAggregate.mockResolvedValue({ _sum: { amount: null } });
    paymentCreate.mockResolvedValue({ id: 'payment-1' });
    orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });

    const result = await applyOpeningCreditPayment(ORDER_ID, 5000, 'CASH');

    expect(result.paymentId).toBe('payment-1');
    expect(paymentCreate).toHaveBeenCalledWith({
      data: { orderId: ORDER_ID, method: 'CASH', amount: 5000, sourceType: 'OPENING_CREDIT_APPLICATION' },
    });
    // No treasuryEntry.create call exists in the tx mock at all — if the
    // implementation ever tried to call it, this test would throw
    // "tx.treasuryEntry is undefined" rather than silently passing.
  });

  it('acquires the advisory lock keyed by partnerId as the first statement inside the transaction', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(1000) });
    paymentAggregate.mockResolvedValue({ _sum: { amount: null } });
    paymentCreate.mockResolvedValue({ id: 'payment-1' });
    orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });

    await applyOpeningCreditPayment(ORDER_ID, 100, 'CASH');

    expect(executeRawLockKeys[0]).toBe(PARTNER_ID);
  });

  it('rejects an order with no partner', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: null });
    await expect(applyOpeningCreditPayment(ORDER_ID, 100, 'CASH')).rejects.toThrow(OrderHasNoPartnerError);
  });

  it('rejects a nonexistent order', async () => {
    orderFindUnique.mockResolvedValue(null);
    await expect(applyOpeningCreditPayment(ORDER_ID, 100, 'CASH')).rejects.toThrow(OrderNotFoundError);
  });

  it('rejects when the customer has no approved CustomerOpening', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue(null);
    await expect(applyOpeningCreditPayment(ORDER_ID, 100, 'CASH')).rejects.toThrow(NoApprovedCustomerOpeningError);
  });

  it('rejects a DRAFT (not yet approved) CustomerOpening the same as none at all', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'DRAFT', creditAmount: decimal(5000) });
    await expect(applyOpeningCreditPayment(ORDER_ID, 100, 'CASH')).rejects.toThrow(NoApprovedCustomerOpeningError);
  });

  it('rejects an amount exceeding the exact remaining credit', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(5000) });
    paymentAggregate.mockResolvedValue({ _sum: { amount: decimal(3000) } }); // already consumed 3000
    await expect(applyOpeningCreditPayment(ORDER_ID, 2000.01, 'CASH')).rejects.toThrow(OpeningCreditExceededError);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('allows an amount exactly equal to the remaining credit (boundary)', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(5000) });
    paymentAggregate.mockResolvedValue({ _sum: { amount: decimal(3000) } });
    paymentCreate.mockResolvedValue({ id: 'payment-2' });
    orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });

    await expect(applyOpeningCreditPayment(ORDER_ID, 2000, 'CASH')).resolves.toMatchObject({ paymentId: 'payment-2' });
  });

  /**
   * The core concurrency invariant. Two "concurrent" applications against
   * the SAME partner's 5,000 credit, each requesting 3,000 — only one may
   * succeed under the advisory lock (which the transactionChain mock
   * serializes exactly as pg_advisory_xact_lock would). The mock's
   * paymentAggregate call must reflect the FIRST call's already-created
   * payment by the time the second call reads it — simulated here by
   * having the mock's return value change after the first transaction
   * commits.
   */
  it('under concurrent applications for the same partner, total consumed never exceeds the original credit', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(1000000) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(5000) });
    orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });

    let consumedSoFar = 0;
    paymentAggregate.mockImplementation(() => Promise.resolve({ _sum: { amount: decimal(consumedSoFar) } }));
    paymentCreate.mockImplementation(({ data }: { data: { amount: number } }) => {
      consumedSoFar += data.amount;
      return Promise.resolve({ id: `payment-${consumedSoFar}` });
    });

    const [first, second] = await Promise.allSettled([
      applyOpeningCreditPayment(ORDER_ID, 3000, 'CASH'),
      applyOpeningCreditPayment(ORDER_ID, 3000, 'CASH'),
    ]);

    const succeeded = [first, second].filter((r) => r.status === 'fulfilled');
    const failed = [first, second].filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(OpeningCreditExceededError);
    expect(consumedSoFar).toBeLessThanOrEqual(5000);
    // Same lock key both times — proves both attempts were serialized
    // through the same critical section, not two independent, unlocked runs.
    // both attempts take the partner lock first; only the first passes the credit ceiling, so only it goes on to the per-order payment lock
    expect(executeRawLockKeys).toEqual([PARTNER_ID, `order-payments:${ORDER_ID}`, PARTNER_ID]);
  });
});

/**
 * Owner decision (2026-09-25) - an opening-credit application is a payment
 * like any other and may not exceed what the customer still owes on THIS
 * invoice, even when the customer's approved credit is larger.
 */
describe('applyOpeningCreditPayment - invoice overpayment', () => {
  function setup(invoiceTotal: number, paidOnOrder: number) {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, partnerId: PARTNER_ID, finalTotal: decimal(invoiceTotal) });
    customerOpeningFindUnique.mockResolvedValue({ status: 'APPROVED', creditAmount: decimal(5000) });
    // the credit-consumed sum (filtered by sourceType) and the order's paid sum (filtered by orderId) share this mock
    paymentAggregate.mockImplementation((args: { where: { sourceType?: string } }) =>
      Promise.resolve({ _sum: { amount: args.where.sourceType ? null : decimal(paidOnOrder) } }),
    );
    paymentCreate.mockResolvedValue({ id: 'payment-1' });
    orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });
  }

  it('rejects an application larger than the invoice remaining even though the credit would cover it - nothing is written', async () => {
    setup(500, 0);
    await expect(applyOpeningCreditPayment(ORDER_ID, 600, 'CASH')).rejects.toThrow(PaymentExceedsRemainingError);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('counts payments already made on the invoice: 500 invoice, 200 paid, only 300 can still be applied', async () => {
    setup(500, 200);
    await expect(applyOpeningCreditPayment(ORDER_ID, 301, 'CASH')).rejects.toMatchObject({ remaining: 300 });
    await expect(applyOpeningCreditPayment(ORDER_ID, 300, 'CASH')).resolves.toMatchObject({ paymentId: 'payment-1' });
    expect(paymentCreate).toHaveBeenCalledTimes(1);
  });

  it('the credit ceiling still applies first: an amount over the remaining credit is an OpeningCreditExceededError', async () => {
    setup(100000, 0);
    await expect(applyOpeningCreditPayment(ORDER_ID, 5000.01, 'CASH')).rejects.toThrow(OpeningCreditExceededError);
  });
});
