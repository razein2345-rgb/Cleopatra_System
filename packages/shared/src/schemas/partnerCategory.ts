import { z } from 'zod';

export const partnerCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPartnerCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updatePartnerCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

/** `categoryId: null` clears the partner's category — zero-or-one, per M4. */
export const setPartnerCategorySchema = z.object({
  categoryId: z.string().uuid().nullable(),
});

export type PartnerCategory = z.infer<typeof partnerCategorySchema>;
export type CreatePartnerCategoryInput = z.infer<typeof createPartnerCategorySchema>;
export type UpdatePartnerCategoryInput = z.infer<typeof updatePartnerCategorySchema>;
export type SetPartnerCategoryInput = z.infer<typeof setPartnerCategorySchema>;
