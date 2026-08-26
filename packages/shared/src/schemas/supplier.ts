import { z } from 'zod';

/**
 * الموردين — جزء 3 من مبادرة "فصل الخزينة/الربح بالفرع + الموردين +
 * التقارير" (docs/AI/PROJECT_STATUS.md § 6). A Supplier is just a
 * BusinessPartner holding the SUPPLIER role (no parallel Supplier model,
 * per Reuse Before Create — see schema.prisma's SupplierPurchase/
 * SupplierPayment comment) — this file only adds the ledger-specific
 * shapes: a purchase (what a supplier charges us) and a payment (what we
 * pay them), plus the aggregated summary/statement views the Suppliers
 * page and printable statement need. `paymentTermsDays` itself lives on
 * the existing `PartnerCommercialProfile` (shared with customers) — not
 * duplicated here.
 */

export const supplierPurchaseSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  amount: z.number(),
  description: z.string().nullable(),
  date: z.string(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
});
export type SupplierPurchase = z.infer<typeof supplierPurchaseSchema>;

export const createSupplierPurchaseSchema = z.object({
  amount: z.number().positive(),
  description: z.string().trim().min(1).nullable().optional(),
  date: z.string(),
});
export type CreateSupplierPurchaseInput = z.infer<typeof createSupplierPurchaseSchema>;

export const updateSupplierPurchaseSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().trim().min(1).nullable().optional(),
  date: z.string().optional(),
});
export type UpdateSupplierPurchaseInput = z.infer<typeof updateSupplierPurchaseSchema>;

export const supplierPaymentSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  amount: z.number(),
  note: z.string().nullable(),
  date: z.string(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
});
export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;

export const createSupplierPaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().trim().min(1).nullable().optional(),
  date: z.string(),
});
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;

export const updateSupplierPaymentSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().trim().min(1).nullable().optional(),
  date: z.string().optional(),
});
export type UpdateSupplierPaymentInput = z.infer<typeof updateSupplierPaymentSchema>;

/** One row of the Suppliers list page — every SUPPLIER-role partner + its running balance. */
export const supplierSummarySchema = z.object({
  partnerId: z.string().uuid(),
  nameAr: z.string(),
  phone: z.string().nullable(),
  branchId: z.string().uuid(),
  paymentTermsDays: z.number().nullable(),
  totalPurchases: z.number(),
  totalPayments: z.number(),
  /** totalPurchases - totalPayments — "كام عندي بالظبط" (owed to this supplier). */
  balance: z.number(),
});
export type SupplierSummary = z.infer<typeof supplierSummarySchema>;

/** One merged, running-balance row of a printable supplier statement. */
export const supplierStatementEntrySchema = z.object({
  kind: z.enum(['PURCHASE', 'PAYMENT']),
  id: z.string().uuid(),
  date: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
  runningBalance: z.number(),
});
export type SupplierStatementEntry = z.infer<typeof supplierStatementEntrySchema>;

export const supplierStatementSchema = z.object({
  partnerId: z.string().uuid(),
  nameAr: z.string(),
  /** Balance carried in from before the requested period (0 if no `from` filter was given). */
  openingBalance: z.number(),
  entries: z.array(supplierStatementEntrySchema),
  closingBalance: z.number(),
});
export type SupplierStatement = z.infer<typeof supplierStatementSchema>;

/** Company-wide total across every supplier — "إجمالي الديون عليك للموردين". */
export const supplierDebtOverviewSchema = z.object({
  totalOwedToSuppliers: z.number(),
  supplierCount: z.number(),
});
export type SupplierDebtOverview = z.infer<typeof supplierDebtOverviewSchema>;
