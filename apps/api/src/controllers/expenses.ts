import type { Request, Response } from 'express';
import { createExpenseSchema, markExpensePaidSchema, updateExpenseSchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import {
  createExpense,
  ExpenseAlreadyPaidError,
  ExpenseNotFoundError,
  getExpense,
  listExpenses,
  markExpensePaid,
  softDeleteExpense,
  updateExpense,
} from '../services/expenseService.js';
import { recordAudit } from '../services/auditService.js';
import { resolveBranchScope } from './treasuryEntries.js';
import { DayClosedError } from '../services/treasuryService.js';
import { idempotencyKeyFromHeader, runIdempotent, sendIdempotencyError } from '../services/idempotencyService.js';

/** A `null` `branchId` (company-wide) is always accessible — everything else defers to the normal per-branch check. */
function canAccessExpenseBranch(auth: Parameters<typeof canAccessBranch>[0], branchId: string | null): boolean {
  return branchId === null || canAccessBranch(auth, branchId);
}

export async function listExpensesHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const status = req.query.status === 'DUE' || req.query.status === 'PAID' ? req.query.status : undefined;
  const items = await listExpenses({ branchId: resolveBranchScope(auth, true, requestedBranchId), status });
  res.json({ success: true, data: items });
}

export async function getExpenseHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const expense = await getExpense(req.params.id);
  if (!expense) {
    res.status(404).json({ success: false, error: { message: 'Expense not found' } });
    return;
  }
  if (!canAccessExpenseBranch(auth, expense.branchId)) {
    forbidBranch(res);
    return;
  }
  res.json({ success: true, data: expense });
}

export async function createExpenseHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createExpenseSchema.parse(req.body);
  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }
  const created = await createExpense(input, auth.staffId);

  await recordAudit({
    entityType: 'Expense',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: created });
}

export async function updateExpenseHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await getExpense(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: { message: 'Expense not found' } });
    return;
  }
  if (!canAccessExpenseBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  const input = updateExpenseSchema.parse(req.body);
  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const updated = await updateExpense(req.params.id, input);

  await recordAudit({
    entityType: 'Expense',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    previousValue: { amount: existing.amount, description: existing.description, incurredDate: existing.incurredDate },
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

/**
 * Accounting audit fix (2026-09-17, Phase I) — same `runIdempotent`
 * infrastructure already wired into the other Treasury-mutating endpoints
 * (order/payment/quick-sale/supplier-payment creation), per the owner's own
 * "retrying the payment action must never create a second TreasuryEntry"
 * requirement. `TreasuryEntry.expenseId`'s unique constraint is the actual
 * guarantee; the idempotency key just makes a client's blind retry (a
 * double-click, a dropped response) replay the original result instead of
 * hitting that constraint as a raw error.
 */
export async function markExpensePaidHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await getExpense(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: { message: 'Expense not found' } });
    return;
  }
  if (!canAccessExpenseBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  const input = markExpensePaidSchema.parse(req.body);
  const idempotencyKey = idempotencyKeyFromHeader(req.headers['idempotency-key']);

  let outcome;
  try {
    outcome = await runIdempotent(
      idempotencyKey,
      auth.staffId,
      'POST /api/expenses/:id/mark-paid',
      { expenseId: req.params.id, ...input },
      async () => {
        const paid = await markExpensePaid(req.params.id, input, auth.staffId, auth.branchId);

        await recordAudit({
          entityType: 'Expense',
          entityId: paid.id,
          action: 'UPDATE',
          performedById: auth.staffId,
          branchId: paid.branchId,
          newValue: { status: 'PAID', method: input.method, paidDate: paid.paidDate },
        });

        return { statusCode: 200, body: { success: true, data: paid } };
      },
    );
  } catch (err) {
    if (sendIdempotencyError(err, res)) return;
    if (err instanceof ExpenseAlreadyPaidError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'EXPENSE_ALREADY_PAID' } });
      return;
    }
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
      return;
    }
    throw err;
  }

  res.status(outcome.statusCode).json(outcome.body);
}

export async function deleteExpenseHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await getExpense(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: { message: 'Expense not found' } });
    return;
  }
  if (!canAccessExpenseBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }

  try {
    await softDeleteExpense(req.params.id, auth.staffId);
  } catch (err) {
    if (err instanceof ExpenseNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'Expense',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: existing.branchId,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
