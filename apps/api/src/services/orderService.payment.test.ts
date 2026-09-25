import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Opening State / Cutover (Phase 3C.1 §6 / 3C.2 §23) — `updatePayment`/
 * `deletePayment` must call `reopenDayIfClosed` for a NORMAL payment
 * correction (unchanged existing behavior) but must NOT for an
 * OPENING_CREDIT_APPLICATION one, since that sourceType never had a
 * linked TreasuryEntry and never affected any TreasuryDayClosure in the
 * first place. Only `../lib/prisma.js` is mocked — `reopenDayIfClosed`'s
 * REAL implementation (from the unmocked `treasuryService.js`) runs
 * against that same mock, so this proves the actual guard, not a stand-in.
 */

const paymentFindUnique = vi.fn();
const paymentUpdate = vi.fn();
const paymentAggregate = vi.fn();
const paymentCreate = vi.fn();
const orderItemReturnAggregate = vi.fn();
const treasuryEntryCreate = vi.fn();
const treasuryEntryUpdateMany = vi.fn();
const treasuryDayClosureFindUnique = vi.fn();
const treasuryDayClosureUpdate = vi.fn();
const customerOpeningFindUnique = vi.fn();
const orderFindUnique = vi.fn();
const orderFindUniqueOrThrow = vi.fn();
const executeRawLockKeys: string[] = [];

function makeTx() {
  return {
    payment: {
      findUnique: (...args: unknown[]) => paymentFindUnique(...args),
      update: (...args: unknown[]) => paymentUpdate(...args),
      aggregate: (...args: unknown[]) => paymentAggregate(...args),
      create: (...args: unknown[]) => paymentCreate(...args),
    },
    orderItemReturn: { aggregate: (...args: unknown[]) => orderItemReturnAggregate(...args) },
    treasuryEntry: {
      updateMany: (...args: unknown[]) => treasuryEntryUpdateMany(...args),
      create: (...args: unknown[]) => treasuryEntryCreate(...args),
    },
    treasuryDayClosure: {
      findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
      update: (...args: unknown[]) => treasuryDayClosureUpdate(...args),
    },
    customerOpening: { findUnique: (...args: unknown[]) => customerOpeningFindUnique(...args) },
    order: {
      findUnique: (...args: unknown[]) => orderFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => orderFindUniqueOrThrow(...args),
    },
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      executeRawLockKeys.push(String(values[0]));
      return Promise.resolve(undefined);
    },
  };
}

vi.mock('../lib/prisma.js', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()) },
}));

const { updatePayment, deletePayment, recordPayment, OpeningCreditExceededError, PaymentExceedsRemainingError } = await import('./orderService.js');

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const PAYMENT_ID = '22222222-2222-2222-2222-222222222222';
const BRANCH_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '44444444-4444-4444-4444-444444444444';
const PARTNER_ID = '55555555-5555-5555-5555-555555555555';

function decimal(n: number) {
  return { toNumber: () => n };
}

beforeEach(() => {
  vi.clearAllMocks();
  executeRawLockKeys.length = 0;
  orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, branchId: BRANCH_ID, invoiceNumber: 'CLP-INV-1', finalTotal: new Prisma.Decimal(1000000) });
  paymentAggregate.mockResolvedValue({ _sum: { amount: null } });
  orderItemReturnAggregate.mockResolvedValue({ _sum: { refundAmount: null } });
  paymentCreate.mockResolvedValue({ id: PAYMENT_ID });
  orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });
  // A closed day exists — reopenDayIfClosed's real implementation will
  // flip it open if (and only if) it's actually called.
  treasuryDayClosureFindUnique.mockResolvedValue({ id: 'closure-1', branchId: BRANCH_ID, isOpen: false });
});

describe('updatePayment — Treasury Day reopen guard', () => {
  it('a NORMAL payment correction reopens the closed day (unchanged existing behavior)', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'NORMAL', createdAt: new Date(),
    });

    await updatePayment(ORDER_ID, PAYMENT_ID, { amount: 150 }, STAFF_ID);

    expect(treasuryDayClosureFindUnique).toHaveBeenCalled();
    expect(treasuryDayClosureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOpen: true }) }),
    );
  });

  it('an OPENING_CREDIT_APPLICATION correction does NOT reopen any Treasury Day', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });

    await updatePayment(ORDER_ID, PAYMENT_ID, { amount: 150 }, STAFF_ID);

    expect(treasuryDayClosureFindUnique).not.toHaveBeenCalled();
    expect(treasuryDayClosureUpdate).not.toHaveBeenCalled();
  });
});

/**
 * Phase 3D re-audit fix — `applyOpeningCreditPayment`'s advisory lock and
 * ceiling check only protect the CREATE path. Editing an EXISTING
 * OPENING_CREDIT_APPLICATION payment's amount through this generic,
 * pre-existing endpoint (gated on `payments.edit`, not `orders.edit`) had
 * no re-check at all — a caller could raise it past the customer's
 * approved credit with zero validation. This locks the fix: the same
 * ceiling (SUM(other applications) + newAmount <= creditAmount) is now
 * enforced here too, under the same advisory lock key (partnerId).
 */
describe('updatePayment — Opening Credit ceiling re-check', () => {
  beforeEach(() => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, branchId: BRANCH_ID, partnerId: PARTNER_ID, invoiceNumber: 'CLP-INV-1', finalTotal: new Prisma.Decimal(1000000) });
  });

  it('raising the amount within the true remaining credit succeeds', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(1000), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });
    customerOpeningFindUnique.mockResolvedValue({ creditAmount: decimal(5000) });
    // No other applications consumed besides this row itself (excluded by id).
    paymentAggregate.mockResolvedValue({ _sum: { amount: null } });

    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 4000 }, STAFF_ID)).resolves.toBeDefined();

    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 4000 }) }));
    // partner lock (opening-credit ceiling) first, then the per-order payment lock — always in that order, so it can't deadlock with recordPayment (order lock only) or applyOpeningCreditPayment (partner lock only)
    expect(executeRawLockKeys).toEqual([PARTNER_ID, `order-payments:${ORDER_ID}`]);
  });

  it('raising the amount past the true remaining credit is rejected — payment is never updated', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(1000), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });
    customerOpeningFindUnique.mockResolvedValue({ creditAmount: decimal(5000) });
    // Another 3,000 already consumed by a different payment — only 2,000 truly remains.
    paymentAggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(3000) } });

    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 2500 }, STAFF_ID)).rejects.toThrow(OpeningCreditExceededError);

    expect(paymentUpdate).not.toHaveBeenCalled();
    // The aggregate must exclude this payment's own current row from "already consumed".
    expect(paymentAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: PAYMENT_ID } }) }),
    );
  });

  it('an amount exactly equal to the true remaining credit is allowed (boundary)', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(1000), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });
    customerOpeningFindUnique.mockResolvedValue({ creditAmount: decimal(5000) });
    paymentAggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(3000) } });

    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 2000 }, STAFF_ID)).resolves.toBeDefined();
  });

  it('changing only the method (amount unchanged) skips the ceiling re-check entirely', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(1000), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });

    await updatePayment(ORDER_ID, PAYMENT_ID, { method: 'BANK_ACCOUNT' }, STAFF_ID);

    expect(customerOpeningFindUnique).not.toHaveBeenCalled();
    expect(paymentAggregate).not.toHaveBeenCalled();
    expect(executeRawLockKeys).toEqual([]);
  });

  it('a NORMAL payment amount change never triggers the Opening Credit ceiling check', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'NORMAL', createdAt: new Date(),
    });

    await updatePayment(ORDER_ID, PAYMENT_ID, { amount: 999999 }, STAFF_ID);

    expect(customerOpeningFindUnique).not.toHaveBeenCalled();
    // (the overpayment check aggregates payments now, but never the opening-credit-only sum)
    expect(paymentAggregate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sourceType: 'OPENING_CREDIT_APPLICATION' }) }),
    );
  });
});

describe('deletePayment — Treasury Day reopen guard', () => {
  it('deleting a NORMAL payment reopens the closed day (unchanged existing behavior)', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'NORMAL', createdAt: new Date(),
    });

    await deletePayment(ORDER_ID, PAYMENT_ID, STAFF_ID);

    expect(treasuryDayClosureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOpen: true }) }),
    );
  });

  it('deleting an OPENING_CREDIT_APPLICATION payment does NOT reopen any Treasury Day', async () => {
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'OPENING_CREDIT_APPLICATION', createdAt: new Date(),
    });

    await deletePayment(ORDER_ID, PAYMENT_ID, STAFF_ID);

    expect(treasuryDayClosureFindUnique).not.toHaveBeenCalled();
    expect(treasuryDayClosureUpdate).not.toHaveBeenCalled();
    // The soft-delete itself must still happen regardless of sourceType.
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDeleted: true }) }),
    );
  });
});

/**
 * Owner decision (2026-09-25) — a normal payment may not exceed what the
 * customer still owes (same standard opening-credit applications and
 * advance repayments already enforce). "Remaining" = finalTotal - returns
 * - other payments, the same figure the UI calls remainingBalance.
 */
describe('recordPayment — overpayment rejection', () => {
  beforeEach(() => {
    treasuryDayClosureFindUnique.mockResolvedValue(null);
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, branchId: BRANCH_ID, partnerId: PARTNER_ID, invoiceNumber: 'CLP-INV-1', finalTotal: new Prisma.Decimal(500) });
  });

  it('a 600 payment on a 500 invoice is rejected and nothing is written', async () => {
    await expect(recordPayment(ORDER_ID, { method: 'CASH', amount: 600 }, STAFF_ID)).rejects.toThrow(PaymentExceedsRemainingError);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(treasuryEntryCreate).not.toHaveBeenCalled();
  });

  it('carries the true remaining so the UI can say how much is still owed', async () => {
    paymentAggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(200) } });
    await expect(recordPayment(ORDER_ID, { method: 'CASH', amount: 400 }, STAFF_ID)).rejects.toMatchObject({ remaining: 300 });
  });

  it('paying exactly the remaining balance is allowed (boundary)', async () => {
    paymentAggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(200) } });
    await expect(recordPayment(ORDER_ID, { method: 'CASH', amount: 300 }, STAFF_ID)).resolves.toBeDefined();
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    expect(treasuryEntryCreate).toHaveBeenCalledTimes(1);
  });

  it('returns reduce what is owed: a 500 invoice with 100 returned only allows 400', async () => {
    orderItemReturnAggregate.mockResolvedValue({ _sum: { refundAmount: new Prisma.Decimal(100) } });
    await expect(recordPayment(ORDER_ID, { method: 'CASH', amount: 401 }, STAFF_ID)).rejects.toThrow(PaymentExceedsRemainingError);
    await expect(recordPayment(ORDER_ID, { method: 'CASH', amount: 400 }, STAFF_ID)).resolves.toBeDefined();
  });

  it('the check runs under a per-order advisory lock so concurrent payments serialize', async () => {
    await recordPayment(ORDER_ID, { method: 'CASH', amount: 100 }, STAFF_ID);
    expect(executeRawLockKeys).toContain(`order-payments:${ORDER_ID}`);
  });
});

describe('updatePayment — overpayment rejection (NORMAL payments)', () => {
  beforeEach(() => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, branchId: BRANCH_ID, partnerId: PARTNER_ID, invoiceNumber: 'CLP-INV-1', finalTotal: new Prisma.Decimal(500) });
    paymentFindUnique.mockResolvedValue({
      id: PAYMENT_ID, isDeleted: false, orderId: ORDER_ID, amount: decimal(100), method: 'CASH',
      sourceType: 'NORMAL', createdAt: new Date(),
    });
  });

  it('raising a payment past the invoice total is rejected; the payment is never updated', async () => {
    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 600 }, STAFF_ID)).rejects.toThrow(PaymentExceedsRemainingError);
    expect(paymentUpdate).not.toHaveBeenCalled();
    // this payment's own old amount must not count as "already paid"
    expect(paymentAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: PAYMENT_ID } }) }),
    );
  });

  it('raising within the total is allowed, including up to exactly the total', async () => {
    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 500 }, STAFF_ID)).resolves.toBeDefined();
    expect(paymentUpdate).toHaveBeenCalled();
  });

  it('lowering the amount or changing only the method never runs the check (an already-overpaid order stays correctable)', async () => {
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, isDeleted: false, branchId: BRANCH_ID, partnerId: PARTNER_ID, invoiceNumber: 'CLP-INV-1', finalTotal: new Prisma.Decimal(50) });
    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { amount: 80 }, STAFF_ID)).resolves.toBeDefined();
    await expect(updatePayment(ORDER_ID, PAYMENT_ID, { method: 'BANK_ACCOUNT' }, STAFF_ID)).resolves.toBeDefined();
    expect(paymentAggregate).not.toHaveBeenCalled();
  });
});
