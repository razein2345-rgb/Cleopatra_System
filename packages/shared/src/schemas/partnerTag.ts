import { z } from 'zod';

export const partnerTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPartnerTagSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const updatePartnerTagSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

/** Replaces the partner's full Tag set in one call — unlimited, per M4. */
export const setPartnerTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

export type PartnerTag = z.infer<typeof partnerTagSchema>;
export type CreatePartnerTagInput = z.infer<typeof createPartnerTagSchema>;
export type UpdatePartnerTagInput = z.infer<typeof updatePartnerTagSchema>;
export type SetPartnerTagsInput = z.infer<typeof setPartnerTagsSchema>;
