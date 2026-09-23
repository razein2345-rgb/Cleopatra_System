import type { CreateExpenseInput, Expense, MarkExpensePaidInput, UpdateExpenseInput } from '@cleopatra/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { assertBranchDayNotClosed, reopenDayIfClosed } from './treasuryService.js';

/**
 * Accounting audit fix (2026-09-17, Decision 6 / Phase I) — a dedicated,
 * individually-tracked business expense with a DUE -> PAID lifecycle.
 * DUE never touches Treasury (nothing has actually left the business yet);
 * PAID atomically creates exactly one `TreasuryEntry` (sourceType
 * `EXPENSE_PAYMENT`), enforced by the `TreasuryEntry.expenseId` unique
 * constraint — a second attempt to pay the same expense can never create a
 * second entry. No approval workflow, no scheduling/recurrence engine —
 * deliberately minimal per the owner's own scope for v1.
 *
 * Mirrors `supplierLedgerService.ts`'s exact conventions throughout (rule
 * 5 — one established "external cash obligation" pattern, not two):
 * `assertBranchDayNotClosed` before creating the Treasury side effect,
 * `updateExpense` keeps an already-PAID expense's linked entry in sync the
 * same way `updatePayment` does, and `softDeleteExpense` reverses the
 * linked entry the same way `softDeletePayment` does.
 */

type ExpenseRecord = Prisma.ExpenseGetPayload<object>;

export function mapExpenseToDto(row: ExpenseRecord): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount.toNumber(),
    category: row.category,
    payee: row.payee,
    reference: row.reference,
    incurredDate: row.incurredDate.toISOString(),
    paidDate: row.paidDate?.toISOString() ?? null,
    method: row.method,
    status: row.status,
    branchId: row.branchId,
    treasuryEntryId: null, // populated by callers that need it (see getExpense) — avoids a join on every list row.
    recordedById: row.recordedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ExpenseNotFoundError extends Error {
  constructor() {
    super('Expense not found');
    this.name = 'ExpenseNotFoundError';
  }
}

export class ExpenseAlreadyPaidError extends Error {
  constructor() {
    super('This expense has already been marked as paid');
    this.name = 'ExpenseAlreadyPaidError';
  }
}

export async function listExpenses(filters: { branchId?: string | string[]; status?: 'DUE' | 'PAID' }): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({
    where: {
      isDeleted: false,
      // A company-wide expense (branchId: null) isn't tied to any one
      // branch, so it stays visible regardless of the caller's branch
      // scope — same "always included" treatment `FixedMonthlyExpense`'s
      // own company-wide rows get in the profitability report.
      ...(filters.branchId
        ? { OR: [{ branchId: null }, { branchId: Array.isArray(filters.branchId) ? { in: filters.branchId } : filters.branchId }] }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { incurredDate: 'desc' },
  });
  return rows.map(mapExpenseToDto);
}

export async function getExpense(id: string): Promise<Expense | null> {
  const row = await prisma.expense.findUnique({ where: { id }, include: { treasuryEntry: { select: { id: true } } } });
  if (!row || row.isDeleted) return null;
  return { ...mapExpenseToDto(row), treasuryEntryId: row.treasuryEntry?.id ?? null };
}

export async function createExpense(input: CreateExpenseInput, recordedById: string): Promise<Expense> {
  const row = await prisma.expense.create({
    data: {
      description: input.description,
      amount: input.amount,
      category: input.category ?? null,
      payee: input.payee ?? null,
      reference: input.reference ?? null,
      incurredDate: new Date(input.incurredDate),
      branchId: input.branchId ?? null,
      recordedById,
    },
  });
  return mapExpenseToDto(row);
}

/** Keeps an already-PAID expense's linked `TreasuryEntry` in sync — same pattern as `supplierLedgerService.updatePayment`. Never touches `status`/`paidDate` (see `markExpensePaid` for that transition). */
export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<Expense> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new ExpenseNotFoundError();

    const newAmount = input.amount ?? existing.amount;
    const newMethod = input.method ?? existing.method;
    const newIncurredDate = input.incurredDate !== undefined ? new Date(input.incurredDate) : existing.incurredDate;

    const row = await tx.expense.update({
      where: { id },
      data: {
        description: input.description,
        amount: input.amount,
        category: input.category,
        payee: input.payee,
        reference: input.reference,
        incurredDate: input.incurredDate === undefined ? undefined : newIncurredDate,
        method: input.method,
        branchId: input.branchId,
      },
    });

    if (existing.status === 'PAID') {
      await tx.treasuryEntry.updateMany({
        where: { expenseId: id },
        data: {
          amount: newAmount,
          method: newMethod,
          note: input.description,
          // TreasuryEntry.branchId is NOT NULL — a change back to
          // company-wide (`branchId: null`) can't be mirrored onto the
          // already-posted entry, so it simply keeps its original branch.
          branchId: input.branchId ?? undefined,
        },
      });
      if (existing.branchId && existing.paidDate) {
        await reopenDayIfClosed(existing.branchId, existing.paidDate, existing.recordedById, 'تعديل مصروف مدفوع', tx);
      }
    }

    return mapExpenseToDto(row);
  });
}

/**
 * DUE -> PAID. Atomically creates the one Treasury OUT this expense will
 * ever have — `TreasuryEntry.expenseId`'s unique constraint is what makes a
 * second `markExpensePaid` on the same expense impossible even under
 * concurrent retries (the domain-level `ExpenseAlreadyPaidError` check
 * below is the friendly error message; the DB constraint is the actual
 * guarantee, same "app check plus a real constraint" discipline used for
 * `IdempotencyKey` records).
 */
export async function markExpensePaid(
  id: string,
  input: MarkExpensePaidInput,
  staffId: string,
  /** Falls back to the staff member's own branch for a company-wide (`branchId: null`) expense — `TreasuryEntry.branchId` is NOT NULL. */
  staffBranchId: string,
): Promise<Expense> {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new ExpenseNotFoundError();
  if (existing.status === 'PAID') throw new ExpenseAlreadyPaidError();

  const paidDate = input.paidDate ? new Date(input.paidDate) : new Date();
  if (existing.branchId) {
    await assertBranchDayNotClosed(existing.branchId, paidDate);
  }

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { status: 'PAID', paidDate, method: input.method },
      });

      await tx.treasuryEntry.create({
        data: {
          type: 'EXPENSE',
          amount: existing.amount.toNumber(),
          method: input.method,
          category: existing.category ?? 'مصروفات',
          note: existing.description,
          date: paidDate,
          sourceType: 'EXPENSE_PAYMENT',
          expenseId: id,
          staffId,
          branchId: existing.branchId ?? staffBranchId,
        },
      });

      return updated;
    });
  } catch (err) {
    // Two genuinely concurrent pay attempts (different idempotency keys, or
    // none) can both pass the `status === 'PAID'` check above before either
    // commits — `TreasuryEntry.expenseId`'s unique constraint is what
    // actually stops the second one; this just turns that raw DB error into
    // the same friendly error the pre-check normally produces.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      throw new ExpenseAlreadyPaidError();
    }
    throw err;
  }

  return mapExpenseToDto(row);
}

/** Reverses an already-PAID expense's linked `TreasuryEntry` before soft-deleting it — same pattern as `supplierLedgerService.softDeletePayment`. A still-DUE expense has no Treasury side effect to reverse. */
export async function softDeleteExpense(id: string, deletedBy: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) throw new ExpenseNotFoundError();

    await tx.expense.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });

    if (existing.status === 'PAID') {
      await tx.treasuryEntry.updateMany({
        where: { expenseId: id },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy },
      });
      if (existing.branchId && existing.paidDate) {
        await reopenDayIfClosed(existing.branchId, existing.paidDate, deletedBy, 'حذف مصروف', tx);
      }
    }
  });
}
