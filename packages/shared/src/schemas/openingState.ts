import { z } from 'zod';
import { cutoverStatusSchema, verificationStatusSchema } from './cutover.js';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * Opening State / Cutover (Phase 3A → 3C.2) — CustomerOpening/
 * SupplierOpening are company-wide, standalone (NOT children of any
 * branch's CutoverRecord — customer/supplier balance is demonstrated,
 * everywhere in this codebase, to be a company-wide figure). Each has its
 * own independent mini-lifecycle reusing `CutoverStatus`'s shape.
 */
export const createCustomerOpeningSchema = z.object({
  partnerId: z.string().uuid(),
  receivableAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
});
export type CreateCustomerOpeningInput = z.infer<typeof createCustomerOpeningSchema>;

export const updateCustomerOpeningSchema = z.object({
  receivableAmount: z.number().min(0).optional(),
  creditAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});
export type UpdateCustomerOpeningInput = z.infer<typeof updateCustomerOpeningSchema>;

export const createSupplierOpeningSchema = z.object({
  partnerId: z.string().uuid(),
  payableAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
});
export type CreateSupplierOpeningInput = z.infer<typeof createSupplierOpeningSchema>;

export const updateSupplierOpeningSchema = z.object({
  payableAmount: z.number().min(0).optional(),
  creditAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});
export type UpdateSupplierOpeningInput = z.infer<typeof updateSupplierOpeningSchema>;

export const reopenOpeningSchema = z.object({
  reason: z.string().min(1),
});
export type ReopenOpeningInput = z.infer<typeof reopenOpeningSchema>;

/**
 * Cutover-revision-round decision (post-3D) — the dedicated correction
 * path (SUPER_ADMIN-only, service-layer-enforced) for a wrongly-recorded
 * creditAmount. `reason` mandatory, same convention as reopen/supersede.
 */
export const correctCustomerOpeningCreditSchema = z.object({
  creditAmount: z.number().min(0),
  reason: z.string().min(1),
});
export type CorrectCustomerOpeningCreditInput = z.infer<typeof correctCustomerOpeningCreditSchema>;

/**
 * orderId comes from the route param, matching recordPayment's existing
 * shape. `method` is required, same as `recordPayment` — the schema's
 * `Payment.method` column is not nullable, and none of the 4 existing
 * PaymentMethod values inherently means "no real cash movement," so the
 * caller (who knows/can ask which original channel the off-system deposit
 * actually came through) supplies it explicitly rather than the service
 * silently defaulting to one (Phase 3C.2 §21 resolution — not a new enum
 * value, just the same required-input pattern every other Payment uses).
 */
export const applyOpeningCreditSchema = z.object({
  amount: z.number().positive(),
  method: paymentMethodSchema,
});
export type ApplyOpeningCreditInput = z.infer<typeof applyOpeningCreditSchema>;

export interface CustomerOpening {
  id: string;
  partnerId: string;
  receivableAmount: number;
  creditAmount: number;
  status: z.infer<typeof cutoverStatusSchema>;
  approvedById: string | null;
  approvedAt: string | null;
  reopenedById: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  notes: string | null;
  enteredById: string;
  creditCorrectedById: string | null;
  creditCorrectedAt: string | null;
  creditCorrectionReason: string | null;
  selfApprovedException: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierOpening {
  id: string;
  partnerId: string;
  payableAmount: number;
  creditAmount: number;
  status: z.infer<typeof cutoverStatusSchema>;
  approvedById: string | null;
  approvedAt: string | null;
  reopenedById: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  notes: string | null;
  enteredById: string;
  selfApprovedException: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The read-time addition described throughout Phase 3A.1/3C — never persisted. */
export interface CustomerOpeningPosition {
  liveRemainingBalance: number;
  openingReceivable: number;
  openingCreditTotal: number;
  consumedOpeningCredit: number;
  remainingOpeningCredit: number;
  position: number;
}
