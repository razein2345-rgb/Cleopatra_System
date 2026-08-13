import { z } from 'zod';

/**
 * FEATURE-008 (2026-08-13, owner: "يعني كل موظف بيشتغل من 10 ل7 بياخد في
 * الإسبوع مثلاً 2000ج وهو بيشتغل 6 أيام في الإسبوع فا يحسب المرتب ÷ عدد
 * الأيام فيطلعلة اليوم عامل كام فيقسم المرتب في اليوم ÷ عدد الساعات
 * فيطلعلة الموظف بيقبض كام في الساعه فا لو الموظف اتأخر يتخصم منه الساعه
 * اللي اتأخرها"). One row per scheduled work day in the pay period —
 * `dailyRate`/`hourlyRate` are derived once for the whole period
 * (baseSalary ÷ scheduled work days in the period ÷ shift hours), then
 * applied per day against real AttendanceEntry data. A day with no
 * AttendanceEntry at all is an absence — flagged (`isAbsent`), never
 * auto-deducted (owner, 2026-08-13: "يتسجل كتنبيه بس من غير خصم تلقائي").
 */
export const employeePayrollDaySchema = z.object({
  date: z.string(),
  isAbsent: z.boolean(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  lateMinutes: z.number(),
  earlyLeaveMinutes: z.number(),
  overtimeMinutes: z.number(),
  /** (overtimeMinutes - lateMinutes - earlyLeaveMinutes) / 60 * hourlyRate — positive is owed extra, negative is a deduction. */
  adjustment: z.number(),
});

export const employeePayrollSchema = z.object({
  staffId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Number of this employee's scheduled work days (per `StaffProfile.workingDays`) that fall inside the period — the divisor behind `dailyRate`. */
  scheduledDaysInPeriod: z.number().int(),
  dailyRate: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  days: z.array(employeePayrollDaySchema),
  /** Sum of every day's `adjustment` — what employeeAdvanceSummarySchema.attendanceAdjustment reports for this employee. */
  totalAdjustment: z.number(),
});

export type EmployeePayrollDay = z.infer<typeof employeePayrollDaySchema>;
export type EmployeePayroll = z.infer<typeof employeePayrollSchema>;
