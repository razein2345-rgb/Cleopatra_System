import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * FEATURE-008 (2026-08-13, owner: "هل هيطلعلي تقرير بالسلف بتاعت كل موظف
 * ومتبقيله كام من المرتب"). Giving an advance is real cash leaving the
 * drawer — recorded atomically with a TreasuryEntry, same pattern as an
 * order payment. A repayment either returns cash (also atomic with a
 * TreasuryEntry, INCOME) or is a salary deduction (recorded only — this
 * system has no payroll run to pay out against).
 */
export const advanceRepaymentMethodSchema = z.enum(['CASH', 'SALARY_DEDUCTION']);

export const employeeAdvanceRepaymentSchema = z.object({
  id: z.string().uuid(),
  advanceId: z.string().uuid(),
  amount: z.number(),
  date: z.string(),
  method: advanceRepaymentMethodSchema,
  note: z.string().nullable(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
});

export const employeeAdvanceSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  amount: z.number(),
  date: z.string(),
  reason: z.string().nullable(),
  recordedById: z.string().uuid(),
  repayments: z.array(employeeAdvanceRepaymentSchema),
  // Computed at read time (amount - sum(repayments.amount)), never stored —
  // mirrors Order.remainingBalance.
  repaidAmount: z.number(),
  remainingBalance: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createEmployeeAdvanceSchema = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  amount: z.number().positive(),
  date: z.string(),
  reason: z.string().trim().min(1).max(500).optional(),
  /** Which wallet the cash actually left through — required, same as recording any other treasury outflow. */
  walletMethod: paymentMethodSchema,
});

export const createAdvanceRepaymentSchema = z.object({
  amount: z.number().positive(),
  date: z.string(),
  method: advanceRepaymentMethodSchema,
  note: z.string().trim().min(1).max(500).optional(),
  /** Required only when `method: 'CASH'` — which wallet received the returned cash. Ignored for `SALARY_DEDUCTION`. */
  walletMethod: paymentMethodSchema.optional(),
});

/**
 * Per-employee summary row for the "السلف ومتبقي المرتب" report.
 * FEATURE-008 (2026-08-13, owner: "يحسب مرتب الناس عن طريق الحضور
 * والإنصراف عن طريق الساعات") — `attendanceAdjustment` folds in
 * lateness/early-leave deductions and overtime additions for the
 * employee's current pay period (see employeePayroll.ts); positive means
 * the employee is owed extra, negative means a deduction.
 * `netDue = baseSalary - totalOutstanding + attendanceAdjustment`.
 */
/**
 * Owner (2026-08-20, "لو لا طب هنعمل ده ازاي") — `periodStart`/`periodEnd`
 * mirror `computeEmployeePayroll`'s current-period resolution (null for
 * anyone with no payroll configured, same as `netDue`); `paidThisPeriod` is
 * the sum of any `SalaryPayment` rows already recorded for that exact
 * period, so the "صرف مرتب" screen can warn before a possible double-pay
 * without hard-blocking it (the owner may legitimately need a correction).
 */
export const employeeAdvanceSummarySchema = z.object({
  staffId: z.string().uuid(),
  staffName: z.string(),
  /** The employee's home branch — pre-fills `createSalaryPaymentSchema.branchId` for the "صرف مرتب" action. */
  branchId: z.string().uuid(),
  payFrequency: z.enum(['WEEKLY', 'MONTHLY']).nullable(),
  baseSalary: z.number().nullable(),
  totalOutstanding: z.number(),
  attendanceAdjustment: z.number(),
  netDue: z.number().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  paidThisPeriod: z.number(),
  /**
   * Owner (2026-09-02, "لما الشهر يخلص يتحسب المرتب بالظبط ويتحفظ لحد ما
   * يتصرف للموظف") — the oldest closed-but-unpaid `PayrollPeriod` for this
   * employee, if one exists. When present, `periodStart`/`periodEnd`/
   * `attendanceAdjustment`/`netDue` above are resolved FROM that frozen
   * row instead of a live `computeEmployeePayroll` call, and "صرف مرتب"
   * settles it specifically (`createSalaryPaymentSchema.payrollPeriodId`).
   * Null means either no payroll is configured yet, or the current period
   * simply hasn't closed yet — the existing live-computation behavior
   * still applies, unchanged.
   */
  pendingPayrollPeriodId: z.string().uuid().nullable(),
  /**
   * Owner (2026-09-02, "ليه مش ظاهرلي إجمالي الشهر الجديد لحد دلوقتي") —
   * once a `pendingPayrollPeriodId` exists, everything above (`netDue`,
   * `periodStart`/`periodEnd`, `attendanceAdjustment`) describes the OLD
   * closed-but-unpaid month specifically (what "صرف مرتب" would settle) —
   * the still-ongoing current month's own running total was previously
   * nowhere on this screen at all. These three always describe the LIVE
   * current period (same source as `computeEmployeePayroll`), independent
   * of whichever period the fields above are pointing at — purely
   * informational, never used by the payment flow itself. Null only when
   * no payroll is configured yet.
   */
  currentPeriodAdjustment: z.number().nullable(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
});

export type AdvanceRepaymentMethod = z.infer<typeof advanceRepaymentMethodSchema>;
export type EmployeeAdvanceRepayment = z.infer<typeof employeeAdvanceRepaymentSchema>;
export type EmployeeAdvance = z.infer<typeof employeeAdvanceSchema>;
export type CreateEmployeeAdvanceInput = z.infer<typeof createEmployeeAdvanceSchema>;
export type CreateAdvanceRepaymentInput = z.infer<typeof createAdvanceRepaymentSchema>;
export type EmployeeAdvanceSummary = z.infer<typeof employeeAdvanceSummarySchema>;
