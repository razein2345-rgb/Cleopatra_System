import type { Request, Response } from 'express';
import { createAdvanceRepaymentSchema, createEmployeeAdvanceSchema } from '@cleopatra/shared';
import { canAccessBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import {
  AdvanceRepaymentExceedsBalanceError,
  createAdvance,
  createRepayment,
  EmployeeAdvanceNotFoundError,
  getEmployeeAdvanceSummaries,
  listAdvancesForStaff,
  MissingWalletMethodError,
} from '../services/employeeAdvanceService.js';
import { computeEmployeePayroll } from '../services/employeePayrollService.js';

export async function listAdvancesForStaffHandler(req: Request<{ staffId: string }>, res: Response) {
  const advances = await listAdvancesForStaff(req.params.staffId);
  res.json({ success: true, data: advances });
}

export async function createAdvanceHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createEmployeeAdvanceSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    res.status(403).json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  const advance = await createAdvance(input, auth.staffId);

  await recordAudit({
    entityType: 'EmployeeAdvance',
    entityId: advance.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: advance.branchId,
    newValue: { staffId: advance.staffId, amount: advance.amount },
  });

  res.status(201).json({ success: true, data: advance });
}

export async function createAdvanceRepaymentHandler(req: Request<{ advanceId: string }>, res: Response) {
  const auth = req.auth!;
  const input = createAdvanceRepaymentSchema.parse(req.body);

  try {
    const advance = await createRepayment(req.params.advanceId, input, auth.staffId);

    await recordAudit({
      entityType: 'EmployeeAdvance',
      entityId: advance.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: advance.branchId,
      newValue: { repaymentAmount: input.amount, method: input.method },
    });

    res.status(201).json({ success: true, data: advance });
  } catch (err) {
    if (err instanceof EmployeeAdvanceNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof AdvanceRepaymentExceedsBalanceError || err instanceof MissingWalletMethodError) {
      res.status(400).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

export async function getEmployeeAdvanceSummariesHandler(_req: Request, res: Response) {
  const summaries = await getEmployeeAdvanceSummaries();
  res.json({ success: true, data: summaries });
}

/** FEATURE-008 — the day-by-day breakdown behind a summary row's `attendanceAdjustment`, for the employee profile page. Null when the employee has no shift schedule configured yet. */
export async function getEmployeePayrollHandler(req: Request<{ staffId: string }>, res: Response) {
  const payroll = await computeEmployeePayroll(req.params.staffId);
  res.json({ success: true, data: payroll });
}
