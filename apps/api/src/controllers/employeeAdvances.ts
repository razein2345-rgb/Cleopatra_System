import type { Request, Response } from 'express';
import { createAdvanceRepaymentSchema, createEmployeeAdvanceSchema, createSalaryPaymentSchema } from '@cleopatra/shared';
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
import { createSalaryPayment, listSalaryPaymentsForStaff, NoPayrollConfiguredError } from '../services/salaryPaymentService.js';
import { DayClosedError } from '../services/treasuryService.js';

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

  let advance;
  try {
    advance = await createAdvance(input, auth.staffId);
  } catch (err) {
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
      return;
    }
    throw err;
  }

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
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
      return;
    }
    throw err;
  }
}

export async function getEmployeeAdvanceSummariesHandler(_req: Request, res: Response) {
  const summaries = await getEmployeeAdvanceSummaries();
  res.json({ success: true, data: summaries });
}

/**
 * Owner (2026-08-20, "لو لا طب هنعمل ده ازاي") — the manual "صرف مرتب"
 * action. Same branch-access + day-closed guards `createAdvanceHandler`
 * above already uses.
 */
export async function createSalaryPaymentHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createSalaryPaymentSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    res.status(403).json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  let payment;
  try {
    payment = await createSalaryPayment(input, auth.staffId);
  } catch (err) {
    if (err instanceof NoPayrollConfiguredError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'NO_PAYROLL_CONFIGURED' } });
      return;
    }
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'SalaryPayment',
    entityId: payment.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: payment.branchId,
    newValue: { staffId: payment.staffId, amount: payment.amount, periodStart: payment.periodStart, periodEnd: payment.periodEnd },
  });

  res.status(201).json({ success: true, data: payment });
}

export async function listSalaryPaymentsForStaffHandler(req: Request<{ staffId: string }>, res: Response) {
  const payments = await listSalaryPaymentsForStaff(req.params.staffId);
  res.json({ success: true, data: payments });
}

/** FEATURE-008 — the day-by-day breakdown behind a summary row's `attendanceAdjustment`, for the employee profile page. Null when the employee has no shift schedule configured yet. */
/** system_specifications_v2.md §3.1.1 (2026-08-16) — payroll (including the attendance-based adjustment) restricted to Super Admin, same reasoning/enforcement point as `listAttendanceForStaffHandler` in attendance.ts. */
export async function getEmployeePayrollHandler(req: Request<{ staffId: string }>, res: Response) {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Payroll data is restricted to Super Admin' } });
    return;
  }
  const payroll = await computeEmployeePayroll(req.params.staffId);
  res.json({ success: true, data: payroll });
}
