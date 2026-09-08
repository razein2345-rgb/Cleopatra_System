import type { Request, Response } from 'express';
import { createFixedMonthlyExpenseSchema, updateFixedMonthlyExpenseSchema } from '@cleopatra/shared';
import {
  createFixedMonthlyExpense,
  deleteFixedMonthlyExpense,
  FixedMonthlyExpenseNotFoundError,
  listFixedMonthlyExpenses,
  updateFixedMonthlyExpense,
} from '../services/fixedExpensesService.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Owner (2026-09-08, "محتاج قسم خاص بالخزينة يكون فيه المصروفات الشهرية
 * الدائمة... وأقدر أضيف انا بقى مصاريف شهرية ثابته براحتي") — restricted
 * to Super Admin only, same restriction shape as Attendance
 * (`attendance.ts`'s own inline check) — company overhead figures (rent,
 * real payroll totals) the owner explicitly framed as "أنا بس اللي اقدر
 * اشوف", not a `reports.view`/`treasury.*`-gated permission like the rest
 * of this module (both are far too broadly granted — SALES and CASHIER
 * both hold one or the other).
 */
function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Fixed monthly expenses are restricted to Super Admin' } });
    return false;
  }
  return true;
}

export async function listFixedMonthlyExpensesHandler(req: Request, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const items = await listFixedMonthlyExpenses();
  res.json({ success: true, data: items });
}

export async function createFixedMonthlyExpenseHandler(req: Request, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const auth = req.auth!;
  const input = createFixedMonthlyExpenseSchema.parse(req.body);
  const created = await createFixedMonthlyExpense(input);
  await recordAudit({
    entityType: 'FixedMonthlyExpense',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    newValue: { name: created.name, amount: created.amount, branchId: created.branchId },
  });
  res.status(201).json({ success: true, data: created });
}

export async function updateFixedMonthlyExpenseHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const auth = req.auth!;
  const input = updateFixedMonthlyExpenseSchema.parse(req.body);
  try {
    const updated = await updateFixedMonthlyExpense(req.params.id, input);
    await recordAudit({
      entityType: 'FixedMonthlyExpense',
      entityId: updated.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: updated.branchId,
      newValue: input,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof FixedMonthlyExpenseNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

export async function deleteFixedMonthlyExpenseHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const auth = req.auth!;
  try {
    await deleteFixedMonthlyExpense(req.params.id, auth.staffId);
    await recordAudit({
      entityType: 'FixedMonthlyExpense',
      entityId: req.params.id,
      action: 'DELETE',
      performedById: auth.staffId,
    });
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    if (err instanceof FixedMonthlyExpenseNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}
