import { z } from 'zod';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

/**
 * Opening State / Cutover (Phase 3A → 3C.2). Matches the Prisma
 * `CutoverStatus`/`VerificationStatus`/`PaymentSourceType` enums exactly.
 * Lets a branch start operating in Cleopatra after a period of manual/
 * off-system operation without fabricating historical transactions — see
 * `docs/AI/` design history (Phase 3A-3C) for the full rationale. Opening
 * State never becomes a TreasuryEntry/Order/OrderItem/SupplierPurchase/
 * SupplierPayment; the one explicit exception is `Payment.sourceType =
 * OPENING_CREDIT_APPLICATION` for applying already-held customer opening
 * credit to a real order.
 */
export const cutoverStatusSchema = z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE']);
export const verificationStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED']);
export const paymentSourceTypeSchema = z.enum(['NORMAL', 'OPENING_CREDIT_APPLICATION']);

export const createCutoverSchema = z.object({
  branchId: z.string().uuid(),
  lastManualDate: z.string(),
  goLiveDate: z.string(),
  notes: z.string().optional(),
});
export type CreateCutoverInput = z.infer<typeof createCutoverSchema>;

export const reopenCutoverSchema = z.object({
  reason: z.string().min(1),
});
export type ReopenCutoverInput = z.infer<typeof reopenCutoverSchema>;

export const supersedeCutoverSchema = z.object({
  reason: z.string().min(1),
});
export type SupersedeCutoverInput = z.infer<typeof supersedeCutoverSchema>;

export const createTreasuryOpeningSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().min(0),
  notes: z.string().optional(),
});
export type CreateTreasuryOpeningInput = z.infer<typeof createTreasuryOpeningSchema>;

export const verifyOpeningLineSchema = z.object({
  verificationStatus: verificationStatusSchema,
});
export type VerifyOpeningLineInput = z.infer<typeof verifyOpeningLineSchema>;

export const createInventoryOpeningSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().min(0),
  unitCostAtOpening: z.number().min(0).optional(),
  notes: z.string().optional(),
});
export type CreateInventoryOpeningInput = z.infer<typeof createInventoryOpeningSchema>;

export interface CutoverRecord {
  id: string;
  branchId: string;
  lastManualDate: string;
  goLiveDate: string;
  status: z.infer<typeof cutoverStatusSchema>;
  isSuperseded: boolean;
  supersededById: string | null;
  supersededAt: string | null;
  supersededReason: string | null;
  createdById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  activatedById: string | null;
  activatedAt: string | null;
  reopenedById: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  notes: string | null;
  selfApprovedException: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryOpening {
  id: string;
  cutoverId: string;
  method: z.infer<typeof paymentMethodSchema>;
  amount: number;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  notes: string | null;
  enteredById: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryOpening {
  id: string;
  cutoverId: string;
  inventoryItemId: string;
  quantity: number;
  unitCostAtOpening: number | null;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  notes: string | null;
  enteredById: string;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
