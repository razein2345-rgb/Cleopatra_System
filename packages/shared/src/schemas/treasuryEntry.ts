import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * FEATURE-006 M4 — Treasury as a first-class module ("الخزينة والنقدية").
 * Matches the Prisma `TreasuryType`/`TreasurySourceType` enums exactly.
 * `sourceType: 'INVOICE_PAYMENT'` entries are created only by
 * `orderService.recordPayment` (M3) — never through this module's own
 * create/update/delete, which is for manual entries only (legacy's own
 * Treasury shape: income/expense/transfer, typed directly).
 *
 * FEATURE-007 M3 — `method` (reused from `partnerCommercialProfile.ts`,
 * the same four-wallet list already used for Payment) enables the
 * per-wallet balance breakdown the owner asked for. Nullable on the read
 * shape only for entries recorded before this column existed; required on
 * every new entry going forward.
 */
export const treasuryTypeSchema = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const treasurySourceTypeSchema = z.enum(['MANUAL', 'INVOICE_PAYMENT']);

export const treasuryEntrySchema = z.object({
  id: z.string().uuid(),
  type: treasuryTypeSchema,
  amount: z.number(),
  category: z.string().nullable(),
  note: z.string().nullable(),
  date: z.string(),
  sourceType: treasurySourceTypeSchema,
  method: paymentMethodSchema.nullable(),
  orderId: z.string().uuid().nullable(),
  paymentId: z.string().uuid().nullable(),
  partnerId: z.string().uuid().nullable(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `type: TRANSFER` is a manual entry too — moving cash between wallets this model doesn't separately track. */
export const createTreasuryEntrySchema = z.object({
  type: treasuryTypeSchema,
  amount: z.number().positive(),
  method: paymentMethodSchema,
  category: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
  date: z.string(),
  branchId: z.string().uuid(),
  partnerId: z.string().uuid().optional(),
});

export const updateTreasuryEntrySchema = z.object({
  amount: z.number().positive().optional(),
  method: paymentMethodSchema.optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  note: z.string().trim().min(1).max(1000).nullable().optional(),
  date: z.string().optional(),
});

export const treasuryBalanceSchema = z.object({
  totalIncome: z.number(),
  totalExpense: z.number(),
  totalTransfer: z.number(),
  // Transfers move money between wallets — they never change the overall
  // balance, so balance = totalIncome - totalExpense, not a three-way sum.
  balance: z.number(),
  // FEATURE-007 M3 — per-wallet breakdown of `balance` (income - expense
  // for each method). A method with no entries at all is simply absent,
  // not zero-filled — the caller renders whatever wallets exist.
  byMethod: z.array(z.object({ method: paymentMethodSchema, balance: z.number() })),
});

/** FEATURE-007 M3 — what a caller with `treasury.create` but not `treasury.view` (e.g. reception) may see: their own entries and their own total, never the org-wide balance. */
export const myTreasurySummarySchema = z.object({
  total: z.number(),
  entryCount: z.number().int(),
});

export type TreasuryType = z.infer<typeof treasuryTypeSchema>;
export type TreasurySourceType = z.infer<typeof treasurySourceTypeSchema>;
export type TreasuryEntry = z.infer<typeof treasuryEntrySchema>;
export type CreateTreasuryEntryInput = z.infer<typeof createTreasuryEntrySchema>;
export type UpdateTreasuryEntryInput = z.infer<typeof updateTreasuryEntrySchema>;
export type TreasuryBalance = z.infer<typeof treasuryBalanceSchema>;
export type MyTreasurySummary = z.infer<typeof myTreasurySummarySchema>;
