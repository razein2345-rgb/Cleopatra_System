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
export const treasurySourceTypeSchema = z.enum([
  'MANUAL',
  'INVOICE_PAYMENT',
  // FEATURE-008 — an advance given to an employee (EXPENSE) or a cash
  // repayment of one (INCOME); see employeeAdvance.ts.
  'EMPLOYEE_ADVANCE',
  'EMPLOYEE_ADVANCE_REPAYMENT',
  // Owner (2026-08-20, "مش محتاجه يتعمله فاتورة خالص هو بس بيخصم من المخزون
  // ويتحط في الخزينه على طول") — a same-transaction pairing of a
  // `StockMovement` (OUT) and this income entry, with no Order/invoice at
  // all. See `stockMovementId` below and `inventoryService.quickSaleFromInventory`.
  'QUICK_SALE',
  // Owner (2026-08-20, "لو لا طب هنعمل ده ازاي") — a manual "صرف مرتب"
  // action, paired atomically with a `SalaryPayment`. See
  // `salaryPaymentId` below and `salaryPaymentService.createSalaryPayment`.
  'SALARY_PAYMENT',
  // Owner (2026-08-23, "مرتجعات... إرجاع الصنف الخطأ للمخزون") — a cash
  // refund for a returned INVENTORY_RETAIL item, paired atomically with an
  // `OrderItemReturn`. See `orderItemReturnId` below and
  // `orderService.createReturn`.
  'RETURN',
]);

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
  employeeAdvanceId: z.string().uuid().nullable(),
  employeeAdvanceRepaymentId: z.string().uuid().nullable(),
  /** `sourceType: 'QUICK_SALE'` only — the StockMovement this entry was paired with at creation. */
  stockMovementId: z.string().uuid().nullable(),
  /** `sourceType: 'SALARY_PAYMENT'` only — the SalaryPayment this entry was paired with at creation. */
  salaryPaymentId: z.string().uuid().nullable(),
  /** `sourceType: 'RETURN'` only — the OrderItemReturn this entry was paired with at creation. */
  orderItemReturnId: z.string().uuid().nullable(),
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

/**
 * FEATURE-016, rebuilt 2026-08-18 (owner: "The goal is to have a proper
 * daily cash register closing system... Opening Balance + Total Inflows -
 * Total Outflows = Expected Closing Balance") — a real cash-drawer
 * reconciliation, not just a review marker. Reconciliation is CASH-method
 * only (`actualCountedCash` is physical cash counted by hand — Vodafone
 * Cash/InstaPay/bank entries stay on the normal ledger, just outside this
 * drawer count). `isOpen: true` means the day was reopened after closing
 * (an authorized correction — see `reopenTreasuryDay`) and new entries are
 * allowed again until it is closed once more. One row per (branch, date);
 * closing while already closed (`isOpen: false`) is a 409.
 */
export const treasuryDayClosureSchema = z.object({
  id: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  openingBalance: z.number(),
  totalInflows: z.number(),
  totalOutflows: z.number(),
  expectedClosingBalance: z.number(),
  actualCountedCash: z.number(),
  difference: z.number(),
  entryCountAtClose: z.number().int(),
  notes: z.string().nullable(),
  closedById: z.string().uuid(),
  closedAt: z.string(),
  isOpen: z.boolean(),
  reopenedById: z.string().uuid().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),
});

/** The live numbers for "today" (or a not-yet-closed day) before the employee commits a close — same math `closeTreasuryDay` will persist, minus `actualCountedCash`/`difference` which only exist once counted. */
export const treasuryDayClosurePreviewSchema = z.object({
  branchId: z.string().uuid(),
  date: z.string(),
  openingBalance: z.number(),
  totalInflows: z.number(),
  totalOutflows: z.number(),
  expectedClosingBalance: z.number(),
  entryCount: z.number().int(),
});

/** `branchId` lets a `treasury.view` holder (admin) close a branch other than their own assigned one — everyone else is locked to their own branch server-side regardless of what's sent here. */
export const closeTreasuryDaySchema = z.object({
  actualCountedCash: z.number(),
  notes: z.string().trim().min(1).max(1000).optional(),
  branchId: z.string().uuid().optional(),
});

/** `date` is the closed day being reopened (`YYYY-MM-DD`) — always today's own branch+date in the UI, but explicit so a past day can be corrected too. `branchId` — same admin-only override as `closeTreasuryDaySchema`. */
export const reopenTreasuryDaySchema = z.object({
  date: z.string(),
  reason: z.string().trim().min(1).max(1000),
  branchId: z.string().uuid().optional(),
});

export type TreasuryType = z.infer<typeof treasuryTypeSchema>;
export type TreasurySourceType = z.infer<typeof treasurySourceTypeSchema>;
export type TreasuryEntry = z.infer<typeof treasuryEntrySchema>;
export type CreateTreasuryEntryInput = z.infer<typeof createTreasuryEntrySchema>;
export type UpdateTreasuryEntryInput = z.infer<typeof updateTreasuryEntrySchema>;
export type TreasuryBalance = z.infer<typeof treasuryBalanceSchema>;
export type MyTreasurySummary = z.infer<typeof myTreasurySummarySchema>;
export type TreasuryDayClosure = z.infer<typeof treasuryDayClosureSchema>;
export type TreasuryDayClosurePreview = z.infer<typeof treasuryDayClosurePreviewSchema>;
export type CloseTreasuryDayInput = z.infer<typeof closeTreasuryDaySchema>;
export type ReopenTreasuryDayInput = z.infer<typeof reopenTreasuryDaySchema>;
