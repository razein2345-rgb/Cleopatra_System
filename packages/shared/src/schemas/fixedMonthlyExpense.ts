import { z } from 'zod';

/**
 * Owner (2026-09-08, "محتاج قسم خاص بالخزينة يكون فيه المصروفات الشهرية
 * الدائمة... مثلا إيجار مكان 2800ج خاص بفرع برينتنج... وأقدر أضيف انا
 * بقى مصاريف شهرية ثابته براحتي") — a recurring monthly overhead line
 * (rent, subscriptions, ...), owner-managed. `branchId: null` means a
 * company-wide expense, not tied to one branch — owner confirmed both
 * shapes are needed ("الاتنين - فرع أو عام حسب المصروف"). See
 * `FixedMonthlyExpense`'s own schema.prisma doc comment for how this feeds
 * the daily-prorated deduction against net profit.
 */
export const fixedMonthlyExpenseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  amount: z.number(),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createFixedMonthlyExpenseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  /** Omitted or explicit `null` = company-wide. */
  branchId: z.string().uuid().nullable().optional(),
});

export const updateFixedMonthlyExpenseSchema = createFixedMonthlyExpenseSchema.partial();

export type FixedMonthlyExpense = z.infer<typeof fixedMonthlyExpenseSchema>;
export type CreateFixedMonthlyExpenseInput = z.infer<typeof createFixedMonthlyExpenseSchema>;
export type UpdateFixedMonthlyExpenseInput = z.infer<typeof updateFixedMonthlyExpenseSchema>;
