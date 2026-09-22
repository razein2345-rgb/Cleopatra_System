import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

export const expenseStatusSchema = z.enum(['DUE', 'PAID']);

/**
 * Accounting audit fix (2026-09-17, Decision 6 / Phase I) — a dedicated,
 * individually-tracked business expense (a vendor invoice, a one-off
 * purchase, a bill), distinct from `FixedMonthlyExpense` (a pure
 * profitability-report amortization input with no payment lifecycle and no
 * Treasury linkage at all — see that schema's own doc comment). Minimal v1
 * scope per the owner's own Decision 6: no approval workflow, no
 * scheduling/recurrence engine — record it, then mark it paid once it
 * actually is. `category` is free text reusing the same `TreasuryCategory`
 * catalog `TreasuryEntry.category` already draws suggestions from (rule 5
 * — no duplicate lookup table), never a hard foreign key. `branchId: null`
 * means company-wide, same convention `FixedMonthlyExpense` already uses.
 */
export const expenseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  amount: z.number(),
  category: z.string().nullable(),
  payee: z.string().nullable(),
  reference: z.string().nullable(),
  incurredDate: z.string(),
  /** Only set once `status` is PAID. */
  paidDate: z.string().nullable(),
  /** Only meaningful once PAID — the wallet the money actually left through. */
  method: paymentMethodSchema.nullable(),
  status: expenseStatusSchema,
  branchId: z.string().uuid().nullable(),
  /** `sourceType: 'EXPENSE_PAYMENT'` TreasuryEntry this expense is paired with — null while still DUE. */
  treasuryEntryId: z.string().uuid().nullable(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createExpenseSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive(),
  category: z.string().trim().min(1).max(100).optional(),
  payee: z.string().trim().min(1).max(200).optional(),
  reference: z.string().trim().min(1).max(200).optional(),
  incurredDate: z.string(),
  /** Omitted or explicit `null` = company-wide, same as `FixedMonthlyExpense`. */
  branchId: z.string().uuid().nullable().optional(),
});

/**
 * Editing an already-PAID expense (a correction, e.g. the wrong amount was
 * typed) keeps its linked `TreasuryEntry` in sync rather than blocking the
 * edit outright — same established pattern as
 * `supplierLedgerService.updatePayment`, which does the same for an
 * already-posted `SupplierPayment`.
 */
export const updateExpenseSchema = z.object({
  description: z.string().trim().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  payee: z.string().trim().min(1).max(200).nullable().optional(),
  reference: z.string().trim().min(1).max(200).nullable().optional(),
  incurredDate: z.string().optional(),
  method: paymentMethodSchema.optional(),
  branchId: z.string().uuid().nullable().optional(),
});

/** Marks a DUE expense PAID — the one action that atomically posts the paired `TreasuryEntry`. */
export const markExpensePaidSchema = z.object({
  method: paymentMethodSchema,
  /** Defaults to now server-side when omitted. */
  paidDate: z.string().optional(),
});

export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type MarkExpensePaidInput = z.infer<typeof markExpensePaidSchema>;
