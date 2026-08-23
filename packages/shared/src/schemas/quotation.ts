import { z } from 'zod';
import { createQuotationItemSchema, quotationItemSchema } from './quotationItem.js';

export const quotationStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
]);

/** Independent of quotationStatusSchema — see schema.prisma's QuotationApprovalState doc comment. */
export const quotationApprovalStateSchema = z.enum(['PENDING', 'APPROVED', 'NEEDS_REVISION']);

export const quotationSchema = z.object({
  id: z.string().uuid(),
  quotationNumber: z.string(),
  branchId: z.string().uuid(),
  // Owner (2026-08-20, "فاتورة بدون إسم العميل") — nullable for walk-in/cash
  // quotations (INVENTORY_RETAIL/MANUAL items only); see createQuotationSchema.
  partnerId: z.string().uuid().nullable(),
  staffId: z.string().uuid(),
  date: z.string(),
  validUntil: z.string().nullable(),
  subtotal: z.number(),
  discountPercent: z.number(),
  vatOn: z.boolean(),
  vatAmount: z.number(),
  finalTotal: z.number(),
  status: quotationStatusSchema,
  customerNotes: z.string().nullable(),
  /**
   * Always present in the shared shape, but the API forces this to `null`
   * for a caller without Internal View access (rather than omitting the
   * key) — a single, always-the-same-shape DTO, permission-shaped by
   * value, not by two different response types. See 01_ANALYSIS.md's
   * Business Object Architecture note.
   */
  internalNotes: z.string().nullable(),
  approvalState: quotationApprovalStateSchema,
  version: z.number().int(),
  previousVersionId: z.string().uuid().nullable(),
  nextVersionExists: z.boolean(),
  /** Set by `POST /:id/convert` (FEATURE-003 M2) once this Quotation has become an Order. */
  convertedOrderId: z.string().uuid().nullable(),
  /** Owner (2026-08-17) — tracked for visibility only, never enforced as a limit. Incremented by `POST /:id/record-print`. */
  printCount: z.number().int(),
  items: z.array(quotationItemSchema),
  // Owner (2026-08-23, "تخفيض على صنف محدد") — sum of every item's own
  // discountAmount, computed at read time, same as Order.itemDiscountsTotal.
  itemDiscountsTotal: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `status` and `approvalState` are deliberately absent — same exclusion
 * pattern as `isPrimary`/`isDefault` elsewhere in this project. The only
 * way to change either is its own dedicated endpoint
 * (`setQuotationStatusSchema`/`setQuotationApprovalStateSchema` below).
 *
 * FEATURE-007 — `subtotal`/`vatAmount`/`finalTotal` are no longer
 * caller-supplied (owner's explicit clarification, 2026-08-10, that
 * Quotation creation runs through the same Pricing Engine as Order, not a
 * separate caller-priced flow): the service sums each item's
 * pricing-engine result, applies `discountPercent`, then `vatOn` against
 * `Setting.vatRate` — identical to `createOrderSchema`.
 */
export const createQuotationSchema = z.object({
  // Owner (2026-08-20, "فاتورة بدون إسم العميل") — same walk-in/cash rule as
  // createOrderSchema.partnerId, enforced server-side in quotationService.
  partnerId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid(),
  validUntil: z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  vatOn: z.boolean().optional(),
  customerNotes: z.string().trim().min(1).max(2000).optional(),
  internalNotes: z.string().trim().min(1).max(2000).optional(),
  items: z.array(createQuotationItemSchema).min(1),
});

/** Items, when provided, replace the full set — not a per-item patch (see 02_PLAN.md's API Endpoints section). Same server-computed totals as `createQuotationSchema`. */
export const updateQuotationSchema = z.object({
  validUntil: z.string().nullable().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  vatOn: z.boolean().optional(),
  customerNotes: z.string().trim().min(1).max(2000).nullable().optional(),
  internalNotes: z.string().trim().min(1).max(2000).nullable().optional(),
  items: z.array(createQuotationItemSchema).min(1).optional(),
});

export const setQuotationStatusSchema = z.object({
  status: quotationStatusSchema,
});

export const setQuotationApprovalStateSchema = z.object({
  approvalState: quotationApprovalStateSchema,
});

/** Owner (2026-08-20, "خليها بدون عميل") — see `setOrderPartnerSchema`'s doc comment, identical rule. */
export const setQuotationPartnerSchema = z.object({
  partnerId: z.string().uuid().nullable(),
});

export type QuotationStatus = z.infer<typeof quotationStatusSchema>;
export type QuotationApprovalState = z.infer<typeof quotationApprovalStateSchema>;
export type Quotation = z.infer<typeof quotationSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type SetQuotationStatusInput = z.infer<typeof setQuotationStatusSchema>;
export type SetQuotationApprovalStateInput = z.infer<typeof setQuotationApprovalStateSchema>;
export type SetQuotationPartnerInput = z.infer<typeof setQuotationPartnerSchema>;
