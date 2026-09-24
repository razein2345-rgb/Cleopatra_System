import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildStatement, type RawLedgerEntry } from './supplierLedgerService.js';

/**
 * Accounting audit fix (2026-09-17, Decision 1/2/19) — regression coverage
 * for: (a) a SupplierPayment atomically creating exactly one Treasury OUT
 * entry (`sourceType: 'SUPPLIER_PAYMENT'`), rolling back both together if
 * either write fails; (b) branch-scoped totals/statement no longer leaking
 * another branch's supplier activity. Mocks `../lib/prisma.js` following
 * the exact same pattern already established in `posService.test.ts`.
 */

// Owner (2026-08-26, "كل مورد معروف... وهو ليه كام عندي بالظبط... أقدر
// احدد الفترة") — purchase (supplier charges us) is +, payment (we pay
// them) is -. Balance carried in from before `from` must fold into
// openingBalance, not reset to zero at the period boundary. Pre-existing
// coverage, kept as-is.
const d = (s: string) => new Date(s);

describe('buildStatement', () => {
  it('computes a running balance with no date filter', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-08-01'), description: 'ورق', amount: 500 },
      { kind: 'PAYMENT', id: 'pay1', date: d('2026-08-05'), description: null, amount: 200 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-10'), description: 'حبر', amount: 100 },
    ];
    const result = buildStatement(entries);
    expect(result.openingBalance).toBe(0);
    expect(result.entries.map((e) => e.runningBalance)).toEqual([500, 300, 400]);
    expect(result.closingBalance).toBe(400);
  });

  it('folds pre-period entries into openingBalance and keeps the running balance continuous', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-07-01'), description: null, amount: 1000 },
      { kind: 'PAYMENT', id: 'pay1', date: d('2026-07-15'), description: null, amount: 300 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-05'), description: null, amount: 50 },
    ];
    const result = buildStatement(entries, d('2026-08-01'));
    expect(result.openingBalance).toBe(700); // 1000 - 300
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].runningBalance).toBe(750); // 700 + 50
    expect(result.closingBalance).toBe(750);
  });

  it('excludes entries after `to` entirely, from both the list and the closing balance', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-08-01'), description: null, amount: 500 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-20'), description: null, amount: 999 },
    ];
    const result = buildStatement(entries, undefined, d('2026-08-10'));
    expect(result.entries).toHaveLength(1);
    expect(result.closingBalance).toBe(500);
  });
});

const supplierPaymentCreate = vi.fn();
const supplierPaymentUpdate = vi.fn();
const supplierPaymentFindUniqueOrThrow = vi.fn();
const treasuryEntryCreate = vi.fn();
const treasuryEntryUpdateMany = vi.fn();
const treasuryDayClosureFindUnique = vi.fn();
const businessPartnerFindMany = vi.fn();
const supplierPurchaseGroupBy = vi.fn();
const supplierPaymentGroupBy = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        supplierPayment: {
          create: (...args: unknown[]) => supplierPaymentCreate(...args),
          update: (...args: unknown[]) => supplierPaymentUpdate(...args),
          findUniqueOrThrow: (...args: unknown[]) => supplierPaymentFindUniqueOrThrow(...args),
        },
        treasuryEntry: {
          create: (...args: unknown[]) => treasuryEntryCreate(...args),
          updateMany: (...args: unknown[]) => treasuryEntryUpdateMany(...args),
        },
        treasuryDayClosure: {
          findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
        },
      }),
    treasuryDayClosure: {
      findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
    },
    businessPartner: {
      findMany: (...args: unknown[]) => businessPartnerFindMany(...args),
    },
    supplierPurchase: {
      groupBy: (...args: unknown[]) => supplierPurchaseGroupBy(...args),
    },
    supplierPayment: {
      groupBy: (...args: unknown[]) => supplierPaymentGroupBy(...args),
    },
  },
}));

const { createPayment, updatePayment, softDeletePayment, listSuppliers } = await import('./supplierLedgerService.js');

const PARTNER_ID = 'partner-1';
const BRANCH_ID = 'branch-1';
const STAFF_ID = 'staff-1';

function paymentRow(overrides: Partial<{ id: string; amount: { toNumber(): number }; branchId: string | null; recordedById: string; date: Date; method: string | null }> = {}) {
  return {
    id: 'payment-1',
    partnerId: PARTNER_ID,
    amount: { toNumber: () => 500 },
    note: null,
    date: new Date('2026-09-17T00:00:00.000Z'),
    recordedById: STAFF_ID,
    method: 'CASH',
    branchId: BRANCH_ID,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    ...overrides,
  };
}

describe('createPayment — SupplierPayment atomically posts a Treasury OUT (Decision 1)', () => {
  beforeEach(() => {
    supplierPaymentCreate.mockReset();
    treasuryEntryCreate.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null); // day not closed
  });

  it('creates exactly one SupplierPayment and exactly one paired TreasuryEntry', async () => {
    supplierPaymentCreate.mockResolvedValue(paymentRow());

    await createPayment(PARTNER_ID, { amount: 500, date: '2026-09-17', method: 'CASH', branchId: BRANCH_ID }, STAFF_ID);

    expect(supplierPaymentCreate).toHaveBeenCalledTimes(1);
    expect(treasuryEntryCreate).toHaveBeenCalledTimes(1);
  });

  it('the TreasuryEntry carries the correct branch, method, sourceType, and linking relation', async () => {
    supplierPaymentCreate.mockResolvedValue(paymentRow({ id: 'payment-42' }));

    await createPayment(PARTNER_ID, { amount: 500, date: '2026-09-17', method: 'VODAFONE_CASH', branchId: BRANCH_ID }, STAFF_ID);

    const data = treasuryEntryCreate.mock.calls[0]![0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.sourceType).toBe('SUPPLIER_PAYMENT');
    expect(data.method).toBe('VODAFONE_CASH');
    expect(data.branchId).toBe(BRANCH_ID);
    expect(data.supplierPaymentId).toBe('payment-42');
    expect(data.partnerId).toBe(PARTNER_ID);
    expect(data.amount).toBe(500);
  });

  it('blocks the whole operation when the branch day is already closed — never creates a partial record', async () => {
    treasuryDayClosureFindUnique.mockResolvedValue({ isOpen: false });

    await expect(
      createPayment(PARTNER_ID, { amount: 500, date: '2026-09-17', method: 'CASH', branchId: BRANCH_ID }, STAFF_ID),
    ).rejects.toThrow();

    expect(supplierPaymentCreate).not.toHaveBeenCalled();
    expect(treasuryEntryCreate).not.toHaveBeenCalled();
  });

  it('rolls back the SupplierPayment when the TreasuryEntry creation fails (atomic transaction)', async () => {
    supplierPaymentCreate.mockResolvedValue(paymentRow());
    treasuryEntryCreate.mockRejectedValue(new Error('db exploded'));

    await expect(
      createPayment(PARTNER_ID, { amount: 500, date: '2026-09-17', method: 'CASH', branchId: BRANCH_ID }, STAFF_ID),
    ).rejects.toThrow('db exploded');
    // Both calls happen inside the same mocked $transaction callback — a
    // real Prisma transaction rolls back the SupplierPayment create too
    // when the callback throws; this test locks that both writes are
    // issued from within the one shared transaction, not two separate
    // top-level calls that could partially succeed.
    expect(supplierPaymentCreate).toHaveBeenCalledTimes(1);
    expect(treasuryEntryCreate).toHaveBeenCalledTimes(1);
  });
});

describe('updatePayment / softDeletePayment — keep the linked TreasuryEntry in sync (Decision 1/19)', () => {
  beforeEach(() => {
    supplierPaymentFindUniqueOrThrow.mockReset();
    supplierPaymentUpdate.mockReset();
    treasuryEntryUpdateMany.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null);
  });

  it('editing the amount updates both the SupplierPayment and its TreasuryEntry to the same new amount', async () => {
    supplierPaymentFindUniqueOrThrow.mockResolvedValue(paymentRow());
    supplierPaymentUpdate.mockResolvedValue(paymentRow({ amount: { toNumber: () => 750 } }));

    await updatePayment('payment-1', { amount: 750 });

    expect(treasuryEntryUpdateMany).toHaveBeenCalledTimes(1);
    const call = treasuryEntryUpdateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ supplierPaymentId: 'payment-1' });
    expect(call.data.amount).toBe(750);
  });

  it('soft-deleting a payment soft-deletes its linked TreasuryEntry in the same transaction — never a dangling entry', async () => {
    supplierPaymentFindUniqueOrThrow.mockResolvedValue(paymentRow());

    await softDeletePayment('payment-1', STAFF_ID);

    expect(supplierPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'payment-1' }, data: expect.objectContaining({ isDeleted: true }) }),
    );
    expect(treasuryEntryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { supplierPaymentId: 'payment-1' }, data: expect.objectContaining({ isDeleted: true }) }),
    );
  });
});

describe('listSuppliers — branch isolation (Decision 2/Fix D)', () => {
  beforeEach(() => {
    businessPartnerFindMany.mockReset();
    supplierPurchaseGroupBy.mockReset();
    supplierPaymentGroupBy.mockReset();
    businessPartnerFindMany.mockResolvedValue([
      { id: PARTNER_ID, nameAr: 'مورد الاختبار', phone: null, branchId: 'branch-a', commercialProfile: null },
    ]);
    supplierPurchaseGroupBy.mockResolvedValue([]);
    supplierPaymentGroupBy.mockResolvedValue([]);
  });

  it('with no branchId, aggregates purchases/payments across every branch (Super Admin / org-wide view)', async () => {
    await listSuppliers();

    const purchaseWhere = supplierPurchaseGroupBy.mock.calls[0]![0].where;
    expect(purchaseWhere).not.toHaveProperty('branchId');
  });

  it('scopes both purchase and payment totals to a single requested branch', async () => {
    await listSuppliers('branch-a');

    expect(supplierPurchaseGroupBy.mock.calls[0]![0].where.branchId).toBe('branch-a');
    expect(supplierPaymentGroupBy.mock.calls[0]![0].where.branchId).toBe('branch-a');
  });

  it('a branch-A-scoped caller never sees branch-B activity mixed into the totals — array form scopes to the accessible set only', async () => {
    await listSuppliers(['branch-a']);

    const purchaseWhere = supplierPurchaseGroupBy.mock.calls[0]![0].where;
    expect(purchaseWhere.branchId).toEqual({ in: ['branch-a'] });
    expect(purchaseWhere.branchId.in).not.toContain('branch-b');
  });
});
