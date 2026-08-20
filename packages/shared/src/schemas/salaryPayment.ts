import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * Owner (2026-08-20, "هل بيطلعلي عملية مباشرة آخر الاسبوع بمرتبات الناس
 * جاهزة تتخصم من الخزينة؟... لو لا طب هنعمل ده ازاي") — confirmed there is
 * no automatic weekly/monthly run; a manual "صرف مرتب" action per employee
 * instead. Paying a salary is real cash leaving the drawer — recorded
 * atomically with a TreasuryEntry, same pattern `EmployeeAdvance` already
 * uses. `periodStart`/`periodEnd` are always resolved server-side (from
 * `computeEmployeePayroll`), never caller-supplied — this action must
 * reflect the real pay period being settled, not whatever a client claims.
 * Deliberately does not touch `EmployeeAdvance` balances — those still go
 * through their own explicit repayment flow.
 */
export const salaryPaymentSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  amount: z.number(),
  method: paymentMethodSchema,
  note: z.string().nullable(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
});

export const createSalaryPaymentSchema = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  amount: z.number().positive(),
  method: paymentMethodSchema,
  note: z.string().trim().min(1).max(500).optional(),
});

export type SalaryPayment = z.infer<typeof salaryPaymentSchema>;
export type CreateSalaryPaymentInput = z.infer<typeof createSalaryPaymentSchema>;
