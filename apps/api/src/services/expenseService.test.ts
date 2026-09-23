import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17, Decision 6 / Phase I) — regression
 * coverage for the new Expense system: DUE never touches Treasury, PAID
 * atomically creates exactly one paired TreasuryEntry (never twice, even on
 * a repeated attempt — the same guarantee `supplierLedgerService.createPayment`
 * already has for SupplierPayment), and editing/deleting an already-PAID
 * expense keeps its linked TreasuryEntry in sync (same pattern as
 * `updatePayment`/`softDeletePayment`). Mocks `../lib/prisma.js` following
 * the exact same pattern already established in `supplierLedgerService.test.ts`.
 */

const expenseCreate = vi.fn();
const expenseUpdate = vi.fn();
const expenseFindUnique = vi.fn();
const treasuryEntryCreate = vi.fn();
const treasuryEntryUpdateMany = vi.fn();
const treasuryDayClosureFindUnique = vi.fn();
const treasuryDayClosureUpdate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        expense: {
          create: (...args: unknown[]) => expenseCreate(...args),
          update: (...args: unknown[]) => expenseUpdate(...args),
          findUnique: (...args: unknown[]) => expenseFindUnique(...args),
        },
        treasuryEntry: {
          create: (...args: unknown[]) => treasuryEntryCreate(...args),
          updateMany: (...args: unknown[]) => treasuryEntryUpdateMany(...args),
        },
        treasuryDayClosure: {
          findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
          update: (...args: unknown[]) => treasuryDayClosureUpdate(...args),
        },
      }),
    expense: {
      findUnique: (...args: unknown[]) => expenseFindUnique(...args),
    },
    treasuryDayClosure: {
      findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
      update: (...args: unknown[]) => treasuryDayClosureUpdate(...args),
    },
  },
}));

const { markExpensePaid, updateExpense, softDeleteExpense, ExpenseAlreadyPaidError, ExpenseNotFoundError } = await import(
  './expenseService.js'
);

const BRANCH_ID = 'branch-1';
const STAFF_ID = 'staff-1';

function expenseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'expense-1',
    description: 'فاتورة كهرباء',
    amount: { toNumber: () => 300 },
    category: 'مرافق',
    payee: 'شركة الكهرباء',
    reference: null,
    incurredDate: new Date('2026-09-17T00:00:00.000Z'),
    paidDate: null,
    method: null,
    status: 'DUE',
    branchId: BRANCH_ID,
    recordedById: STAFF_ID,
    isDeleted: false,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    updatedAt: new Date('2026-09-17T00:00:00.000Z'),
    ...overrides,
  };
}

describe('markExpensePaid — DUE -> PAID atomically posts exactly one Treasury OUT', () => {
  beforeEach(() => {
    expenseFindUnique.mockReset();
    expenseUpdate.mockReset();
    treasuryEntryCreate.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null); // day not closed
  });

  it('creates exactly one TreasuryEntry with sourceType EXPENSE_PAYMENT, linked via expenseId', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow());
    expenseUpdate.mockResolvedValue(expenseRow({ status: 'PAID', method: 'CASH', paidDate: new Date('2026-09-17') }));

    await markExpensePaid('expense-1', { method: 'CASH' }, STAFF_ID, BRANCH_ID);

    expect(treasuryEntryCreate).toHaveBeenCalledTimes(1);
    const data = treasuryEntryCreate.mock.calls[0]![0].data;
    expect(data.type).toBe('EXPENSE');
    expect(data.sourceType).toBe('EXPENSE_PAYMENT');
    expect(data.expenseId).toBe('expense-1');
    expect(data.method).toBe('CASH');
    expect(data.amount).toBe(300);
    expect(data.branchId).toBe(BRANCH_ID);
  });

  it('a company-wide expense (branchId: null) posts its Treasury entry under the paying staff member\'s own branch', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ branchId: null }));
    expenseUpdate.mockResolvedValue(expenseRow({ branchId: null, status: 'PAID' }));

    await markExpensePaid('expense-1', { method: 'CASH' }, STAFF_ID, 'staff-own-branch');

    const data = treasuryEntryCreate.mock.calls[0]![0].data;
    expect(data.branchId).toBe('staff-own-branch');
  });

  it('rejects an expense that is already PAID — never creates a second TreasuryEntry', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ status: 'PAID' }));

    await expect(markExpensePaid('expense-1', { method: 'CASH' }, STAFF_ID, BRANCH_ID)).rejects.toThrow(ExpenseAlreadyPaidError);
    expect(treasuryEntryCreate).not.toHaveBeenCalled();
  });

  it('turns a raw unique-constraint race (two genuinely concurrent pay attempts) into the same friendly ExpenseAlreadyPaidError', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow()); // both callers see DUE before either commits
    const p2002 = Object.assign(new Error('Unique constraint failed on the fields: (`expenseId`)'), { code: 'P2002' });
    treasuryEntryCreate.mockRejectedValue(p2002);

    await expect(markExpensePaid('expense-1', { method: 'CASH' }, STAFF_ID, BRANCH_ID)).rejects.toThrow(ExpenseAlreadyPaidError);
  });

  it('blocks payment when the branch day is already closed — never creates a partial record', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow());
    treasuryDayClosureFindUnique.mockResolvedValue({ isOpen: false });

    await expect(markExpensePaid('expense-1', { method: 'CASH' }, STAFF_ID, BRANCH_ID)).rejects.toThrow();
    expect(treasuryEntryCreate).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent expense', async () => {
    expenseFindUnique.mockResolvedValue(null);

    await expect(markExpensePaid('missing', { method: 'CASH' }, STAFF_ID, BRANCH_ID)).rejects.toThrow(ExpenseNotFoundError);
  });
});

describe('updateExpense — keeps an already-PAID expense\'s linked TreasuryEntry in sync', () => {
  beforeEach(() => {
    expenseFindUnique.mockReset();
    expenseUpdate.mockReset();
    treasuryEntryUpdateMany.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null);
    treasuryDayClosureUpdate.mockReset();
  });

  it('editing the amount of a DUE expense never touches Treasury at all', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ status: 'DUE' }));
    expenseUpdate.mockResolvedValue(expenseRow({ amount: { toNumber: () => 450 } }));

    await updateExpense('expense-1', { amount: 450 });

    expect(treasuryEntryUpdateMany).not.toHaveBeenCalled();
  });

  it('editing the amount of a PAID expense updates its linked TreasuryEntry to the same new amount', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ status: 'PAID', method: 'CASH', paidDate: new Date('2026-09-17') }));
    expenseUpdate.mockResolvedValue(expenseRow({ status: 'PAID', amount: { toNumber: () => 450 } }));

    await updateExpense('expense-1', { amount: 450 });

    expect(treasuryEntryUpdateMany).toHaveBeenCalledTimes(1);
    const call = treasuryEntryUpdateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ expenseId: 'expense-1' });
    expect(call.data.amount).toBe(450);
  });
});

describe('softDeleteExpense — reverses an already-PAID expense\'s linked TreasuryEntry', () => {
  beforeEach(() => {
    expenseFindUnique.mockReset();
    expenseUpdate.mockReset();
    treasuryEntryUpdateMany.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null);
    treasuryDayClosureUpdate.mockReset();
  });

  it('deleting a still-DUE expense never touches Treasury at all', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ status: 'DUE' }));

    await softDeleteExpense('expense-1', STAFF_ID);

    expect(treasuryEntryUpdateMany).not.toHaveBeenCalled();
  });

  it('deleting a PAID expense soft-deletes its linked TreasuryEntry in the same transaction — never a dangling entry', async () => {
    expenseFindUnique.mockResolvedValue(expenseRow({ status: 'PAID', paidDate: new Date('2026-09-17') }));

    await softDeleteExpense('expense-1', STAFF_ID);

    expect(expenseUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'expense-1' }, data: expect.objectContaining({ isDeleted: true }) }));
    expect(treasuryEntryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { expenseId: 'expense-1' }, data: expect.objectContaining({ isDeleted: true }) }),
    );
  });
});
