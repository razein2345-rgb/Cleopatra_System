import { z } from 'zod';

/** Reuses the same payment methods already used elsewhere in the system (Treasury). */
export const paymentMethodSchema = z.enum(['CASH', 'VODAFONE_CASH', 'INSTAPAY', 'BANK_ACCOUNT']);

/** Credit/account standing — distinct from PartnerStatus (overall partner lifecycle). */
export const partnerCommercialStatusSchema = z.enum(['ACTIVE', 'ON_HOLD', 'UNDER_REVIEW']);

export const partnerRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const partnerCommercialProfileSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  creditLimit: z.number().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  preferredPaymentMethod: paymentMethodSchema.nullable(),
  priceTier: z.string().nullable(),
  status: partnerCommercialStatusSchema,
  riskLevel: partnerRiskLevelSchema.nullable(),
  preferredCurrency: z.string().nullable(),
  internalNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * A single upsert schema, not separate create/update schemas — unlike
 * ContactPerson/PartnerAddress/PartnerNote, this profile is a 1:1 "detail
 * record," not a list of many; `PUT .../commercial-profile` creates it on
 * first write and updates it on every write after, so one input shape
 * covers both paths (see partnerCommercialProfileService.ts).
 */
export const upsertPartnerCommercialProfileSchema = z.object({
  creditLimit: z.number().nonnegative().nullable().optional(),
  paymentTermsDays: z.number().int().nonnegative().max(365).nullable().optional(),
  preferredPaymentMethod: paymentMethodSchema.nullable().optional(),
  priceTier: z.string().trim().min(1).max(100).nullable().optional(),
  status: partnerCommercialStatusSchema.optional(),
  riskLevel: partnerRiskLevelSchema.nullable().optional(),
  preferredCurrency: z.string().trim().min(2).max(10).nullable().optional(),
  internalNotes: z.string().trim().min(1).max(2000).nullable().optional(),
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PartnerCommercialStatus = z.infer<typeof partnerCommercialStatusSchema>;
export type PartnerRiskLevel = z.infer<typeof partnerRiskLevelSchema>;
export type PartnerCommercialProfile = z.infer<typeof partnerCommercialProfileSchema>;
export type UpsertPartnerCommercialProfileInput = z.infer<
  typeof upsertPartnerCommercialProfileSchema
>;
