import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17) — `getTreasuryCategoryTotals` was the
 * one aggregate in `treasuryService.ts` the 2026-09-07 branch-isolation
 * pass missed: it always summed across every branch, so a branch-scoped
 * `treasury.view` holder (e.g. CASHIER) could see company-wide category
 * totals via `GET /treasury-categories/totals`. This locks the fix: the
 * function now accepts an optional `branchId` (single or array, same
 * convention as its sibling `getTreasuryBalance`) and threads it into both
 * underlying `groupBy` queries.
 *
 * Accounting audit fix (2026-09-17, Phase F — Treasury concurrency) — a
 * second block below covers the new `pg_advisory_xact_lock` wrapping added
 * to `createManualTreasuryEntry`/`closeTreasuryDay`/`reopenTreasuryDay`.
 * These were classic check-then-act races (read whether the branch+date is
 * closed, then write based on that read) with no serialization at all.
 */

const groupBy = vi.fn();
const treasuryEntryCreate = vi.fn();
const treasuryEntryFindUnique = vi.fn();
const treasuryEntryUpdate = vi.fn();
const treasuryDayClosureFindUnique = vi.fn();
const treasuryDayClosureFindFirst = vi.fn();
const treasuryDayClosureCreate = vi.fn();
const treasuryDayClosureUpdate = vi.fn();
const executeRawLockKeys: string[] = [];
// Opening State / Cutover (Phase 3C.2) — getCarryForwardOpeningBalance's
// new fallback (getCutoverCashSeed) queries these two models when no prior
// closed day exists, exactly the scenario every "first close" test below
// exercises. Defaulting to "no cutover for this branch" (undefined/null)
// is the correct, backward-compatible answer for every one of these
// pre-existing Treasury-only tests, none of which involve Opening State.
const cutoverRecordFindFirst = vi.fn().mockResolvedValue(null);
const treasuryOpeningFindUnique = vi.fn().mockResolvedValue(null);
// 3C.2 correction — getBranchCashPosition's own reads (all TreasuryOpening
// rows for a cutover) and getCashPosition's all-branch fallback (every
// non-deleted Branch, when called with no branchId at all).
const treasuryOpeningFindMany = vi.fn().mockResolvedValue([]);
const branchFindMany = vi.fn().mockResolvedValue([]);

function makeTx() {
  return {
    treasuryEntry: {
      create: (...args: unknown[]) => treasuryEntryCreate(...args),
      update: (...args: unknown[]) => treasuryEntryUpdate(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
    },
    treasuryDayClosure: {
      findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
      findFirst: (...args: unknown[]) => treasuryDayClosureFindFirst(...args),
      create: (...args: unknown[]) => treasuryDayClosureCreate(...args),
      update: (...args: unknown[]) => treasuryDayClosureUpdate(...args),
    },
    cutoverRecord: {
      findFirst: (...args: unknown[]) => cutoverRecordFindFirst(...args),
    },
    treasuryOpening: {
      findUnique: (...args: unknown[]) => treasuryOpeningFindUnique(...args),
    },
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      executeRawLockKeys.push(String(values[0]));
      return Promise.resolve(undefined);
    },
  };
}

/**
 * Chains every `$transaction` call onto the previous one's completion —
 * this is what lets the concurrency tests below actually prove something:
 * `pg_advisory_xact_lock` makes Postgres itself block the second
 * transaction's first query until the first transaction commits or rolls
 * back, so from the application code's point of view two "concurrent"
 * calls that both take the same branch+date lock are effectively run one
 * after the other. This mock reproduces exactly that ordering (never
 * overlapping two callbacks for the same mocked "connection") without
 * needing a real Postgres instance.
 */
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
    treasuryEntry: {
      groupBy: (...args: unknown[]) => groupBy(...args),
      findUnique: (...args: unknown[]) => treasuryEntryFindUnique(...args),
    },
    treasuryDayClosure: {
      findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
      findFirst: (...args: unknown[]) => treasuryDayClosureFindFirst(...args),
    },
    cutoverRecord: {
      findFirst: (...args: unknown[]) => cutoverRecordFindFirst(...args),
    },
    treasuryOpening: {
      findUnique: (...args: unknown[]) => treasuryOpeningFindUnique(...args),
      findMany: (...args: unknown[]) => treasuryOpeningFindMany(...args),
    },
    branch: {
      findMany: (...args: unknown[]) => branchFindMany(...args),
    },
    $transaction: (...args: [(tx: unknown) => Promise<unknown>]) => transactionMock(...args),
  },
}));

const {
  getTreasuryCategoryTotals,
  getTreasuryBalance,
  getBranchCashPosition,
  getCashPosition,
  createManualTreasuryEntry,
  closeTreasuryDay,
  reopenTreasuryDay,
  updateManualTreasuryEntry,
  deleteManualTreasuryEntry,
  DayAlreadyClosedError,
  DayClosedError,
  DayNotClosedError,
} = await import('./treasuryService.js');

describe('getTreasuryCategoryTotals', () => {
  beforeEach(() => {
    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
  });

  it('queries with no branch filter when called with no branchId (Super Admin / org-wide view)', async () => {
    await getTreasuryCategoryTotals();

    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const call of groupBy.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      expect(where).not.toHaveProperty('branchId');
    }
  });

  it('scopes both underlying queries to a single branch when given one branchId', async () => {
    await getTreasuryCategoryTotals('branch-1');

    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const call of groupBy.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      expect(where.branchId).toBe('branch-1');
    }
  });

  it('scopes to a set of accessible branches when given an array (non-Super-Admin, multi-branch access)', async () => {
    await getTreasuryCategoryTotals(['branch-1', 'branch-2']);

    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const call of groupBy.mock.calls) {
      const where = (call[0] as { where: { branchId: { in: string[] } } }).where;
      expect(where.branchId).toEqual({ in: ['branch-1', 'branch-2'] });
    }
  });

  it('never widens to every branch when a specific branchId is requested — a CASHIER cannot see the other branch this way', async () => {
    await getTreasuryCategoryTotals('branch-1');

    const allTimeWhere = (groupBy.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(allTimeWhere.branchId).toBe('branch-1');
    expect(allTimeWhere.branchId).not.toBeUndefined();
  });
});

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
    treasuryOpeningFindUnique.mockReset().mockResolvedValue(null);
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

/** In-memory stand-in for the `TreasuryDayClosure` table, keyed the same way the real `@@unique([branchId, date])` constraint is. */
function closureKey(branchId: string, date: Date): string {
  return `${branchId}|${date.toISOString()}`;
}

/** Mimics a Prisma `Decimal` field just enough for `mapDayClosureToDto`'s/`mapTreasuryEntryToDto`'s `.toNumber()` calls. */
function decimal(n: number) {
  return { toNumber: () => n };
}

describe('Treasury day-closure concurrency (Phase F)', () => {
  let dayClosures: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    executeRawLockKeys.length = 0;
    transactionChain = Promise.resolve();
    dayClosures = new Map();

    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
    treasuryEntryCreate.mockReset();
    treasuryEntryCreate.mockImplementation((args: { data: Record<string, unknown> }) => ({
      id: 'entry-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...args.data,
      amount: decimal(Number(args.data.amount)),
      date: new Date(args.data.date as string | Date),
    }));

    treasuryDayClosureFindFirst.mockReset();
    treasuryDayClosureFindFirst.mockResolvedValue(null);

    treasuryDayClosureFindUnique.mockReset();
    treasuryDayClosureFindUnique.mockImplementation(
      ({ where: { branchId_date } }: { where: { branchId_date: { branchId: string; date: Date } } }) =>
        Promise.resolve(dayClosures.get(closureKey(branchId_date.branchId, branchId_date.date)) ?? null),
    );

    treasuryDayClosureCreate.mockReset();
    treasuryDayClosureCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: `closure-${dayClosures.size + 1}`,
        ...data,
        openingBalance: decimal(Number(data.openingBalance ?? 0)),
        totalInflows: decimal(Number(data.totalInflows ?? 0)),
        totalOutflows: decimal(Number(data.totalOutflows ?? 0)),
        expectedClosingBalance: decimal(Number(data.expectedClosingBalance ?? 0)),
        actualCountedCash: decimal(Number(data.actualCountedCash ?? 0)),
        difference: decimal(Number(data.difference ?? 0)),
      };
      dayClosures.set(closureKey(data.branchId as string, data.date as Date), record);
      return Promise.resolve(record);
    });

    treasuryDayClosureUpdate.mockReset();
    treasuryDayClosureUpdate.mockImplementation(({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      for (const [key, record] of dayClosures) {
        if (record.id === id) {
          const updated = { ...record, ...data };
          dayClosures.set(key, updated);
          return Promise.resolve(updated);
        }
      }
      throw new Error(`No closure with id ${id}`);
    });
  });

  it('createManualTreasuryEntry takes a branch+date advisory lock before writing, scoped by branchId', async () => {
    await createManualTreasuryEntry(
      { type: 'INCOME', amount: 100, method: 'CASH', category: null, note: null, date: new Date().toISOString(), branchId: 'branch-1' } as never,
      'staff-1',
    );

    expect(executeRawLockKeys).toHaveLength(1);
    expect(executeRawLockKeys[0]).toMatch(/^branch-1:\d{4}-\d{2}-\d{2}$/);
    expect(treasuryEntryCreate).toHaveBeenCalledTimes(1);
  });

  it('createManualTreasuryEntry still rejects a closed day (regression — the lock did not bypass the existing guard)', async () => {
    // Any already-closed row is enough to trigger the guard; the exact
    // stored shape doesn't matter here since only `.isOpen` is read.
    treasuryDayClosureFindUnique.mockResolvedValue({ branchId: 'branch-1', isOpen: false });

    await expect(
      createManualTreasuryEntry(
        { type: 'INCOME', amount: 100, method: 'CASH', category: null, note: null, date: new Date().toISOString(), branchId: 'branch-1' } as never,
        'staff-1',
      ),
    ).rejects.toThrow(DayClosedError);
    expect(treasuryEntryCreate).not.toHaveBeenCalled();
  });

  it('closeTreasuryDay locks on branch+date and rejects a second close for the same branch+date once the first has committed', async () => {
    const closeA = closeTreasuryDay('branch-1', 'staff-1', 500);
    const closeB = closeTreasuryDay('branch-1', 'staff-2', 999);

    const resultA = await closeA;
    await expect(closeB).rejects.toThrow(DayAlreadyClosedError);

    expect(resultA.actualCountedCash).toBe(500);
    expect(dayClosures.size).toBe(1);
    // Both calls contended for the SAME lock key (same branch, same business day).
    expect(executeRawLockKeys).toHaveLength(2);
    expect(executeRawLockKeys[0]).toBe(executeRawLockKeys[1]);
  });

  it('closeTreasuryDay for two DIFFERENT branches never contends on the same lock key', async () => {
    await Promise.all([closeTreasuryDay('branch-1', 'staff-1', 500), closeTreasuryDay('branch-2', 'staff-1', 700)]);

    expect(dayClosures.size).toBe(2);
    expect(executeRawLockKeys[0]).not.toBe(executeRawLockKeys[1]);
    expect(executeRawLockKeys[0]).toMatch(/^branch-1:/);
    expect(executeRawLockKeys[1]).toMatch(/^branch-2:/);
  });

  it('reopenTreasuryDay locks on branch+date and still requires an actually-closed day (regression)', async () => {
    await expect(reopenTreasuryDay('branch-1', new Date().toISOString().slice(0, 10), 'staff-1', 'صحح غلطة')).rejects.toThrow(
      DayNotClosedError,
    );
    expect(executeRawLockKeys).toHaveLength(1);
    expect(executeRawLockKeys[0]).toMatch(/^branch-1:\d{4}-\d{2}-\d{2}$/);
  });

  it('a close immediately followed by a reopen for the same branch+date serializes through the same lock and succeeds', async () => {
    const closed = await closeTreasuryDay('branch-1', 'staff-1', 500);
    expect(closed.isOpen).toBe(false);

    const reopened = await reopenTreasuryDay('branch-1', closed.date, 'staff-2', 'خطأ في العد');
    expect(reopened.isOpen).toBe(true);
    expect(executeRawLockKeys[0]).toBe(executeRawLockKeys[1]);
  });
});

/**
 * Final accounting audit (2026-09-17) — `updateManualTreasuryEntry`/
 * `deleteManualTreasuryEntry` were the one write path in this file with NO
 * closed-day protection at all: editing/deleting a MANUAL entry after its
 * branch+day was already closed silently drifted the committed
 * `TreasuryDayClosure` snapshot away from the live ledger. Fixed by reusing
 * `reopenDayIfClosed` — the exact same "correction to already-closed money
 * reopens the day" rule `supplierLedgerService.updatePayment`/
 * `expenseService.updateExpense` already apply — rather than inventing a
 * second rule, plus the same `withBranchDayLock` advisory lock used
 * elsewhere in this file for day-closure-state mutations.
 */
describe('updateManualTreasuryEntry / deleteManualTreasuryEntry — closed-day correction (final audit fix)', () => {
  function manualEntryRecord(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'entry-1',
      type: 'EXPENSE',
      amount: { toNumber: () => 200 },
      category: 'مصروفات',
      note: 'إصلاح جهاز',
      date: new Date('2026-09-15T00:00:00.000Z'),
      sourceType: 'MANUAL',
      method: 'CASH',
      orderId: null,
      paymentId: null,
      employeeAdvanceId: null,
      employeeAdvanceRepaymentId: null,
      stockMovementId: null,
      salaryPaymentId: null,
      orderItemReturnId: null,
      supplierPaymentId: null,
      expenseId: null,
      partnerId: null,
      staffId: 'staff-1',
      branchId: 'branch-1',
      isDeleted: false,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    executeRawLockKeys.length = 0;
    transactionChain = Promise.resolve();
    treasuryEntryFindUnique.mockReset();
    treasuryEntryUpdate.mockReset();
    treasuryDayClosureFindUnique.mockReset();
    treasuryDayClosureUpdate.mockReset();
  });

  it('editing a MANUAL entry whose day is already closed reopens that branch+day (the vulnerability this fix closes)', async () => {
    treasuryEntryFindUnique.mockResolvedValue(manualEntryRecord());
    treasuryEntryUpdate.mockResolvedValue(manualEntryRecord({ amount: { toNumber: () => 500 } }));
    treasuryDayClosureFindUnique.mockResolvedValue({ id: 'closure-1', isOpen: false });
    treasuryDayClosureUpdate.mockResolvedValue({});

    await updateManualTreasuryEntry('entry-1', { amount: 500 }, 'staff-2');

    expect(treasuryDayClosureUpdate).toHaveBeenCalledTimes(1);
    const data = treasuryDayClosureUpdate.mock.calls[0]![0].data;
    expect(data.isOpen).toBe(true);
    expect(data.reopenedById).toBe('staff-2');
  });

  it('editing a MANUAL entry whose day is still open never touches TreasuryDayClosure at all', async () => {
    treasuryEntryFindUnique.mockResolvedValue(manualEntryRecord());
    treasuryEntryUpdate.mockResolvedValue(manualEntryRecord());
    treasuryDayClosureFindUnique.mockResolvedValue(null); // never closed

    await updateManualTreasuryEntry('entry-1', { amount: 500 }, 'staff-2');

    expect(treasuryDayClosureUpdate).not.toHaveBeenCalled();
  });

  it('deleting a MANUAL entry whose day is already closed reopens that branch+day', async () => {
    treasuryEntryFindUnique.mockResolvedValue(manualEntryRecord());
    treasuryEntryUpdate.mockResolvedValue(manualEntryRecord({ isDeleted: true }));
    treasuryDayClosureFindUnique.mockResolvedValue({ id: 'closure-1', isOpen: false });
    treasuryDayClosureUpdate.mockResolvedValue({});

    await deleteManualTreasuryEntry('entry-1', 'staff-2');

    expect(treasuryDayClosureUpdate).toHaveBeenCalledTimes(1);
    expect(treasuryDayClosureUpdate.mock.calls[0]![0].data.isOpen).toBe(true);
  });

  it('locks on the ENTRY\'s own branch+date (not today\'s date) — a correction to an old entry reopens the right day', async () => {
    treasuryEntryFindUnique.mockResolvedValue(manualEntryRecord({ branchId: 'branch-9', date: new Date('2026-01-05T00:00:00.000Z') }));
    treasuryEntryUpdate.mockResolvedValue(manualEntryRecord());
    treasuryDayClosureFindUnique.mockResolvedValue(null);

    await updateManualTreasuryEntry('entry-1', { amount: 500 }, 'staff-2');

    expect(executeRawLockKeys[0]).toBe('branch-9:2026-01-05');
  });

  it('regression: still rejects a non-MANUAL entry (ManualEntryOnlyError) without touching TreasuryDayClosure', async () => {
    const { ManualEntryOnlyError } = await import('./treasuryService.js');
    treasuryEntryFindUnique.mockResolvedValue(manualEntryRecord({ sourceType: 'INVOICE_PAYMENT' }));

    await expect(updateManualTreasuryEntry('entry-1', { amount: 500 }, 'staff-2')).rejects.toThrow(ManualEntryOnlyError);
    expect(treasuryEntryUpdate).not.toHaveBeenCalled();
    expect(treasuryDayClosureUpdate).not.toHaveBeenCalled();
  });
});
