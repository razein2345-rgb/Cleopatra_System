import { z } from 'zod';

export const preferredContactMethodSchema = z.enum(['PHONE', 'MOBILE', 'WHATSAPP', 'EMAIL']);

/** Loose phone-shaped validator — digits, spaces, +, -, parentheses; 6-20 chars. */
const phoneLike = z
  .string()
  .trim()
  .min(1)
  .regex(/^[0-9+\-\s()]{6,20}$/, 'Must look like a phone number');

export const contactPersonSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  fullName: z.string().min(1),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  mobile: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().email().nullable(),
  preferredContactMethod: preferredContactMethodSchema.nullable(),
  isPrimary: z.boolean(),
  canApproveQuotations: z.boolean(),
  canApproveWorkOrders: z.boolean(),
  canApproveFinancialDocuments: z.boolean(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `isPrimary` is deliberately absent from create/update — a contact is
 * never created as primary, and primary status only ever changes through
 * the dedicated set-primary action, which atomically unsets the previous
 * primary contact (see 03_IMPLEMENT.md M2).
 */
export const createContactPersonSchema = z.object({
  fullName: z.string().min(1),
  jobTitle: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  mobile: phoneLike.optional(),
  phone: phoneLike.optional(),
  whatsapp: phoneLike.optional(),
  email: z.string().email().optional(),
  preferredContactMethod: preferredContactMethodSchema.optional(),
  canApproveQuotations: z.boolean().optional(),
  canApproveWorkOrders: z.boolean().optional(),
  canApproveFinancialDocuments: z.boolean().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateContactPersonSchema = z.object({
  fullName: z.string().min(1).optional(),
  jobTitle: z.string().min(1).nullable().optional(),
  department: z.string().min(1).nullable().optional(),
  mobile: phoneLike.nullable().optional(),
  phone: phoneLike.nullable().optional(),
  whatsapp: phoneLike.nullable().optional(),
  email: z.string().email().nullable().optional(),
  preferredContactMethod: preferredContactMethodSchema.nullable().optional(),
  canApproveQuotations: z.boolean().optional(),
  canApproveWorkOrders: z.boolean().optional(),
  canApproveFinancialDocuments: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type PreferredContactMethod = z.infer<typeof preferredContactMethodSchema>;
export type ContactPerson = z.infer<typeof contactPersonSchema>;
export type CreateContactPersonInput = z.infer<typeof createContactPersonSchema>;
export type UpdateContactPersonInput = z.infer<typeof updateContactPersonSchema>;
