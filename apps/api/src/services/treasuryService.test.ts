import { describe, expect, it, vi, beforeEach } from 'vitest';

const groupBy = vi.fn();
const cutoverRecordFindFirst = vi.fn().mockResolvedValue(null);
const treasuryOpeningFindMany = vi.fn().mockResolvedValue([]);
const branchFindMany = vi.fn().mockResolvedValue([]);

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    treasuryEntry: {
      groupBy: (...args: unknown[]) => groupBy(...args),
    },
    cutoverRecord: {
      findFirst: (...args: unknown[]) => cutoverRecordFindFirst(...args),
    },
    treasuryOpening: {
      findMany: (...args: unknown[]) => treasuryOpeningFindMany(...args),
    },
    branch: {
      findMany: (...args: unknown[]) => branchFindMany(...args),
    },
  },
}));

const { getTreasuryBalance, getBranchCashPosition, getCashPosition } = await import('./treasuryService.js');

/** Mimics a Prisma `Decimal` field just enough for `mapDayClosureToDto`'s/`mapTreasuryEntryToDto`'s `.toNumber()` calls. */
function decimal(n: number) {
  return { toNumber: () => n };
}

/**
 * 3C.2 correction — `getBranchCashPosition`/`getCashPosition` had zero
 * tests of their own before this pass (confirmed by direct audit: they had
 * zero callers too, which is exactly why this coverage was missing).
 * `groupBy` here is shared with every other describe block in this file,
 * so each test below drives it with `mockImplementation` keyed on the
 * `by` array rather than call order, to stay correct regardless of the
 * `Promise.all` scheduling inside `getBranchCashPosition`.
 */
describe('getBranchCashPosition / getCashPosition (Opening State / Cutover)', () => {
  beforeEach(() => {
    cutoverRecordFindFirst.mockReset().mockResolvedValue(null);
    treasuryOpeningFindMany.mockReset().mockResolvedValue([]);
    branchFindMany.mockReset().mockResolvedValue([]);
    groupBy.mockReset().mockResolvedValue([]);
  });

  it('a branch with no ACTIVE cutover falls through to getTreasuryBalance untouched — no TreasuryOpening read at all', async () => {
    groupBy.mockImplementation((args: { by: string[] }) =>
      Promise.resolve(
        args.by.includes('method')
          ? [{ method: 'CASH', type: 'INCOME', _sum: { amount: decimal(500) } }]
          : [{ type: 'INCOME', _sum: { amount: decimal(500) } }],
      ),
    );

    const result = await getBranchCashPosition('branch-1');

    expect(treasuryOpeningFindMany).not.toHaveBeenCalled();
    expect(result.balance).toBe(500);
    expect(result.byMethod).toEqual([{ method: 'CASH', balance: 500 }]);
    // Identical to calling getTreasuryBalance directly for a no-cutover branch.
    const direct = await getTreasuryBalance('branch-1');
    expect(direct).toEqual(result);
  });

  it('an ACTIVE cutover includes every TreasuryOpening method (CASH, BANK_ACCOUNT, VODAFONE_CASH, INSTAPAY) in balance and byMethod', async () => {
    cutoverRecordFindFirst.mockResolvedValue({ id: 'cutover-1', goLiveDate: new Date('2026-09-01') });
    treasuryOpeningFindMany.mockResolvedValue([
      { method: 'CASH', amount: decimal(1000) },
      { method: 'BANK_ACCOUNT', amount: decimal(2000) },
      { method: 'VODAFONE_CASH', amount: decimal(300) },
      { method: 'INSTAPAY', amount: decimal(150) },
    ]);

    const result = await getBranchCashPosition('branch-1');

    expect(result.balance).toBe(1000 + 2000 + 300 + 150);
    const byMethod = Object.fromEntries(result.byMethod.map((m) => [m.method, m.balance]));
    expect(byMethod).toEqual({ CASH: 1000, BANK_ACCOUNT: 2000, VODAFONE_CASH: 300, INSTAPAY: 150 });
    // The opening seed must never be reported as income/expense/transfer —
    // it is a balance-only figure (Cash Position), not Treasury Income.
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpense).toBe(0);
  });

  it('adds post-Go-Live TreasuryEntry income/expense on top of the TreasuryOpening seed, scoped to the goLiveDate boundary', async () => {
    cutoverRecordFindFirst.mockResolvedValue({ id: 'cutover-1', goLiveDate: new Date('2026-09-01') });
    treasuryOpeningFindMany.mockResolvedValue([{ method: 'CASH', amount: decimal(1000) }]);
    groupBy.mockImplementation((args: { by: string[]; where: Record<string, unknown> }) =>
      Promise.resolve(
        args.by.includes('method')
          ? [{ method: 'CASH', type: 'INCOME', _sum: { amount: decimal(400) } }]
          : [
              { type: 'INCOME', _sum: { amount: decimal(400) } },
              { type: 'EXPENSE', _sum: { amount: decimal(100) } },
            ],
      ),
    );

    const result = await getBranchCashPosition('branch-1');

    // 1000 (opening seed) + 400 (income since go-live) - 100 (expense since go-live)
    expect(result.balance).toBe(1300);
    expect(result.totalIncome).toBe(400);
    expect(result.totalExpense).toBe(100);
    for (const call of groupBy.mock.calls) {
      const where = (call[0] as { where: { date?: { gte: Date } } }).where;
      expect(where.date).toEqual({ gte: expect.any(Date) });
    }
  });

  it('a branch with no TreasuryOpening rows at all under an ACTIVE cutover contributes zero opening seed, not an error', async () => {
    cutoverRecordFindFirst.mockResolvedValue({ id: 'cutover-1', goLiveDate: new Date('2026-09-01') });
    treasuryOpeningFindMany.mockResolvedValue([]);

    const result = await getBranchCashPosition('branch-1');

    expect(result.balance).toBe(0);
    expect(result.byMethod).toEqual([]);
  });

  it('never reads the Payment table — Opening Credit Application payments cannot increase Cash Position or appear here', async () => {
    // The mocked prisma client in this file exposes no `payment` model at
    // all. If getBranchCashPosition ever started reading Payment (e.g. to
    // "double count" an Opening Credit Application as cash), this test
    // would throw "tx.payment is undefined" rather than silently passing —
    // structurally proving the invariant, not just asserting a number.
    cutoverRecordFindFirst.mockResolvedValue({ id: 'cutover-1', goLiveDate: new Date('2026-09-01') });
    treasuryOpeningFindMany.mockResolvedValue([{ method: 'CASH', amount: decimal(1000) }]);

    const result = await getBranchCashPosition('branch-1');

    expect(result.balance).toBe(1000);
  });

  describe('getCashPosition — multi/all-branch aggregation', () => {
    it('sums getBranchCashPosition across an explicit set of branches (array input)', async () => {
      cutoverRecordFindFirst.mockImplementation((args: { where: { branchId: string } }) =>
        Promise.resolve(args.where.branchId === 'branch-1' ? { id: 'cutover-1', goLiveDate: new Date('2026-09-01') } : null),
      );
      treasuryOpeningFindMany.mockResolvedValue([{ method: 'CASH', amount: decimal(1000) }]);

      const result = await getCashPosition(['branch-1', 'branch-2']);

      expect(branchFindMany).not.toHaveBeenCalled();
      // Only branch-1 has a cutover/opening seed; branch-2 has neither TreasuryOpening nor TreasuryEntry activity.
      expect(result.balance).toBe(1000);
      expect(result.byMethod).toEqual([{ method: 'CASH', balance: 1000 }]);
    });

    it('queries every non-deleted branch when called with no branchId (Super Admin / org-wide view)', async () => {
      branchFindMany.mockResolvedValue([{ id: 'branch-1' }, { id: 'branch-2' }]);

      await getCashPosition(undefined);

      expect(branchFindMany).toHaveBeenCalledWith({ where: { isDeleted: false }, select: { id: true } });
      expect(cutoverRecordFindFirst).toHaveBeenCalledTimes(2);
    });

    it('a single branchId string delegates to the same per-branch calculation as getBranchCashPosition directly', async () => {
      groupBy.mockImplementation((args: { by: string[] }) =>
        Promise.resolve(args.by.includes('method') ? [{ method: 'CASH', type: 'INCOME', _sum: { amount: decimal(75) } }] : [{ type: 'INCOME', _sum: { amount: decimal(75) } }]),
      );

      const result = await getCashPosition('branch-1');

      expect(result.balance).toBe(75);
    });
  });
});
