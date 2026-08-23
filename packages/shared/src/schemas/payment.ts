import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * FEATURE-006 M3 — Deposits/remaining-balance flow. `paymentMethodSchema`
 * is reused from `partnerCommercialProfile.ts` (Reuse Before Create) —
 * the same four-method list (كاش، فودافون كاش، Instapay، حساب بنكي)
 * already used for a partner's preferred payment method.
 */
export const paymentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  method: paymentMethodSchema,
  amount: z.number(),
  createdAt: z.string(),
});

export const createPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().positive(),
});

/**
 * Owner (2026-08-20, "تعديل المدفوع... تعديل أي دفعة سابقة") — a payment
 * was purely additive until now (`recordPayment`, never edited/deleted).
 * Gated on its own dedicated `payments.edit` permission (see
 * `PermissionModules` — deliberately not under `orders.*`) since this
 * corrects money already reconciled in the treasury, not just an order's
 * own fields.
 */
export const updatePaymentSchema = z.object({
  method: paymentMethodSchema.optional(),
  amount: z.number().positive().optional(),
});

export type Payment = z.infer<typeof paymentSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
