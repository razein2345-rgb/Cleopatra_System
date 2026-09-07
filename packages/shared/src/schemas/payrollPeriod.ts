import { z } from 'zod';
import { employeePayrollDaySchema } from './employeePayroll.js';

/**
 * Owner (2026-09-02, "بالنسبة للمرتبات عايز لما الشهر يخلص يتحسب المرتب
 * بالظبط ويتحفظ لحد ما يتصرف للموظف والشهر الجديد يكون منفصل عن القديم
 * علشان منخلطش بين الشهور") — a frozen snapshot of one employee's payroll
 * for one already-ended pay period, created automatically the moment that
 * period closes (see `payrollPeriodCloseJob.ts`). Distinct from
 * `EmployeePayroll` (the always-live, current-period-only computation) —
 * once closed, editing attendance afterward does NOT change these numbers
 * unless the period is explicitly reopened first.
 */
export const payrollPeriodSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  baseSalary: z.number(),
  dailyRate: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  totalAdjustment: z.number(),
  grossDue: z.number(),
  days: z.array(employeePayrollDaySchema),
  closedAt: z.string(),
  isOpen: z.boolean(),
  reopenedById: z.string().uuid().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),
  /** Sum of every non-deleted `SalaryPayment` recorded against this period — 0 until "صرف مرتب" happens. */
  paidAmount: z.number(),
});

/**
 * Owner (2026-09-02, "يسمح بإعادة فتح الشهر وإعادة الحساب") — reopening is
 * restricted to SUPER_ADMIN/ADMIN (same elevated bar as
 * `reopenTreasuryDaySchema`) and only possible while `paidAmount` is still
 * 0 — once any real cash has moved against a period's frozen numbers,
 * discarding them would desync from that payment instead of correcting it.
 */
export const reopenPayrollPeriodSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type PayrollPeriod = z.infer<typeof payrollPeriodSchema>;
export type ReopenPayrollPeriodInput = z.infer<typeof reopenPayrollPeriodSchema>;
