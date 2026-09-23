import type { Request, Response } from 'express';
import {
  createAdvanceRepaymentSchema,
  createEmployeeAdvanceSchema,
  createSalaryPaymentSchema,
  reopenPayrollPeriodSchema,
  voidEmployeeAdvanceSchema,
} from '@cleopatra/shared';
import { canAccessBranch } from '../services/authContext.js';
import { prisma } from '../lib/prisma.js';
import { recordAudit } from '../services/auditService.js';
import {
  AdvanceAlreadyVoidedError,
  AdvanceHasRepaymentsError,
  AdvanceRepaymentExceedsBalanceError,
  createAdvance,
  createRepayment,
  EmployeeAdvanceNotFoundError,
  getEmployeeAdvanceSummaries,
  listAdvancesForStaff,
  MissingWalletMethodError,
  voidAdvance,
} from '../services/employeeAdvanceService.js';
import { computeEmployeePayroll } from '../services/employeePayrollService.js';
import {
  listPayrollPeriodsForStaff,
  PayrollPeriodAlreadyOpenError,
  PayrollPeriodAlreadyPaidError,
  PayrollPeriodNotFoundError,
  reopenPayrollPeriod,
} from '../services/payrollPeriodService.js';
import { createSalaryPayment, InvalidPayrollPeriodError, listSalaryPaymentsForStaff, NoPayrollConfiguredError } from '../services/salaryPaymentService.js';
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

  // Accounting audit fix (2026-09-17) — this handler previously had no
  // branch-access check at all, unlike `createAdvanceHandler` right above
  // it: a user with `employees.edit` could record a repayment against
  // another branch's employee's advance. `createRepayment` doesn't know
  // the advance's branch until after loading it internally, so it's
  // peeked here first (same "load, then check" pattern as `orders.ts`'s
  // payment edit/delete handlers) before any mutation happens.
  const existingAdvance = await prisma.employeeAdvance.findUnique({
    where: { id: req.params.advanceId },
    select: { branchId: true, isDeleted: true },
  });
  if (!existingAdvance || existingAdvance.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Employee advance not found' } });
    return;
  }
  if (!canAccessBranch(auth, existingAdvance.branchId)) {
    res.status(403).json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

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

/**
 * Accounting audit fix (2026-09-17, Decision 7) — the controlled void/
 * cancel mechanism for a genuine data-entry mistake. Gated the same
 * SUPER_ADMIN/ADMIN-only bar as `reopenPayrollPeriodHandler`/
 * `reopenTreasuryDayHandler` right next to it — reversing a recorded
 * financial fact is deliberately not something a regular `employees.edit`
 * holder can do on their own.
 */
export async function voidEmployeeAdvanceHandler(req: Request<{ advanceId: string }>, res: Response) {
  const auth = req.auth!;
  if (!auth.roleNames.includes('SUPER_ADMIN') && !auth.roleNames.includes('ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Voiding an employee advance is restricted to admins' } });
    return;
  }

  const existingAdvance = await prisma.employeeAdvance.findUnique({
    where: { id: req.params.advanceId },
    select: { branchId: true, isDeleted: true, amount: true, staffId: true },
  });
  if (!existingAdvance || existingAdvance.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Employee advance not found' } });
    return;
  }
  if (!canAccessBranch(auth, existingAdvance.branchId)) {
    res.status(403).json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  const input = voidEmployeeAdvanceSchema.parse(req.body);

  try {
    const advance = await voidAdvance(req.params.advanceId, auth.staffId, input.reason);

    await recordAudit({
      entityType: 'EmployeeAdvance',
      entityId: advance.id,
      action: 'DELETE',
      performedById: auth.staffId,
      branchId: advance.branchId,
      previousValue: { amount: existingAdvance.amount.toNumber(), staffId: existingAdvance.staffId },
      newValue: { voidReason: input.reason },
    });

    res.json({ success: true, data: advance });
  } catch (err) {
    if (err instanceof EmployeeAdvanceNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof AdvanceAlreadyVoidedError || err instanceof AdvanceHasRepaymentsError) {
      res.status(409).json({ success: false, error: { message: err.message } });
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
    if (err instanceof InvalidPayrollPeriodError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'INVALID_PAYROLL_PERIOD' } });
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

/**
 * Owner (2026-09-02, "لما الشهر يخلص يتحسب المرتب بالظبط ويتحفظ لحد ما
 * يتصرف للموظف") — frozen closed periods carry the exact same kind of
 * per-day attendance breakdown `getEmployeePayrollHandler` above already
 * restricts to Super Admin, so this stays behind the same gate.
 */
export async function listPayrollPeriodsForStaffHandler(req: Request<{ staffId: string }>, res: Response) {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Payroll data is restricted to Super Admin' } });
    return;
  }
  const periods = await listPayrollPeriodsForStaff(req.params.staffId);
  res.json({ success: true, data: periods });
}

/**
 * Owner (2026-09-02, "يسمح بإعادة فتح الشهر وإعادة الحساب") — same
 * elevated bar as `reopenTreasuryDayHandler` (SUPER_ADMIN/ADMIN only,
 * stricter than the `employees.edit` route-level gate on every other
 * mutation in this controller) since it discards a frozen salary figure.
 */
export async function reopenPayrollPeriodHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  if (!auth.roleNames.includes('SUPER_ADMIN') && !auth.roleNames.includes('ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Reopening a closed payroll period is restricted to admins' } });
    return;
  }

  const input = reopenPayrollPeriodSchema.parse(req.body);

  let period;
  try {
    period = await reopenPayrollPeriod(req.params.id, auth.staffId, input.reason);
  } catch (err) {
    if (err instanceof PayrollPeriodNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof PayrollPeriodAlreadyOpenError || err instanceof PayrollPeriodAlreadyPaidError) {
      res.status(409).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'PayrollPeriod',
    entityId: period.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    branchId: period.branchId,
    newValue: { staffId: period.staffId, periodStart: period.periodStart, periodEnd: period.periodEnd, reopenReason: period.reopenReason },
  });

  res.json({ success: true, data: period });
}
