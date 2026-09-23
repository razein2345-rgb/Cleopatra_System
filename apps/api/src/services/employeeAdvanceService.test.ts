import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17, Decision 7) — regression coverage for
 * the controlled void/cancel mechanism: a genuine data-entry mistake can
 * be reversed (soft-deleting the advance AND its linked TreasuryEntry
 * atomically, auto-reopening a closed day), but only before any repayment
 * has touched it, and it can never be voided twice.
 */

const employeeAdvanceFindUnique = vi.fn();
const employeeAdvanceUpdate = vi.fn();
const employeeAdvanceFindUniqueOrThrow = vi.fn();
const treasuryEntryUpdateMany = vi.fn();
const treasuryDayClosureFindUnique = vi.fn();
const treasuryDayClosureUpdate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        employeeAdvance: {
          findUnique: (...args: unknown[]) => employeeAdvanceFindUnique(...args),
          update: (...args: unknown[]) => employeeAdvanceUpdate(...args),
          findUniqueOrThrow: (...args: unknown[]) => employeeAdvanceFindUniqueOrThrow(...args),
        },
        treasuryEntry: {
          updateMany: (...args: unknown[]) => treasuryEntryUpdateMany(...args),
        },
        treasuryDayClosure: {
          findUnique: (...args: unknown[]) => treasuryDayClosureFindUnique(...args),
          update: (...args: unknown[]) => treasuryDayClosureUpdate(...args),
        },
      }),
  },
}));

const { voidAdvance, AdvanceHasRepaymentsError, AdvanceAlreadyVoidedError, EmployeeAdvanceNotFoundError } = await import(
  './employeeAdvanceService.js'
);

const ADVANCE_ID = 'advance-1';
const STAFF_ID = 'staff-1';
const BRANCH_ID = 'branch-1';

function advanceRow(overrides: Partial<{ isDeleted: boolean; repayments: unknown[] }> = {}) {
  return {
    id: ADVANCE_ID,
    staffId: 'employee-1',
    branchId: BRANCH_ID,
    amount: { toNumber: () => 500 },
    date: new Date('2026-09-17T00:00:00.000Z'),
    reason: 'سلفة تجريبية',
    recordedById: STAFF_ID,
    isDeleted: false,
    repayments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('voidAdvance — controlled cancellation (Decision 7)', () => {
  beforeEach(() => {
    employeeAdvanceFindUnique.mockReset();
    employeeAdvanceUpdate.mockReset();
    employeeAdvanceFindUniqueOrThrow.mockReset();
    treasuryEntryUpdateMany.mockReset();
    treasuryDayClosureFindUnique.mockReset().mockResolvedValue(null); // day not closed
  });

  it('soft-deletes the advance AND its linked TreasuryEntry atomically', async () => {
    employeeAdvanceFindUnique.mockResolvedValue(advanceRow());
    employeeAdvanceFindUniqueOrThrow.mockResolvedValue(advanceRow({ isDeleted: true }));

    await voidAdvance(ADVANCE_ID, STAFF_ID, 'اتكتب غلط');

    expect(employeeAdvanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADVANCE_ID }, data: expect.objectContaining({ isDeleted: true, deletedBy: STAFF_ID }) }),
    );
    expect(treasuryEntryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeAdvanceId: ADVANCE_ID }, data: expect.objectContaining({ isDeleted: true }) }),
    );
  });

  it('never hard-deletes or rewrites the original amount/reason — only marks it voided', async () => {
    employeeAdvanceFindUnique.mockResolvedValue(advanceRow());
    employeeAdvanceFindUniqueOrThrow.mockResolvedValue(advanceRow({ isDeleted: true }));

    await voidAdvance(ADVANCE_ID, STAFF_ID, 'اتكتب غلط');

    const data = employeeAdvanceUpdate.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('amount');
    expect(data).not.toHaveProperty('reason');
  });

  it('refuses to void an advance that already has repayments recorded', async () => {
    employeeAdvanceFindUnique.mockResolvedValue(advanceRow({ repayments: [{ id: 'r1', amount: { toNumber: () => 100 } }] }));

    await expect(voidAdvance(ADVANCE_ID, STAFF_ID, 'اتكتب غلط')).rejects.toThrow(AdvanceHasRepaymentsError);
    expect(employeeAdvanceUpdate).not.toHaveBeenCalled();
    expect(treasuryEntryUpdateMany).not.toHaveBeenCalled();
  });

  it('cannot void the same advance twice', async () => {
    employeeAdvanceFindUnique.mockResolvedValue(advanceRow({ isDeleted: true }));

    await expect(voidAdvance(ADVANCE_ID, STAFF_ID, 'اتكتب غلط')).rejects.toThrow(AdvanceAlreadyVoidedError);
    expect(employeeAdvanceUpdate).not.toHaveBeenCalled();
  });

  it('throws EmployeeAdvanceNotFoundError for an unknown id', async () => {
    employeeAdvanceFindUnique.mockResolvedValue(null);

    await expect(voidAdvance('nope', STAFF_ID, 'اتكتب غلط')).rejects.toThrow(EmployeeAdvanceNotFoundError);
  });
});
