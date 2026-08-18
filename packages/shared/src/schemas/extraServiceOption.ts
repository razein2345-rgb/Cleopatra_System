import { z } from 'zod';

export const extraServiceOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createExtraServiceOptionSchema = z.object({
  label: z.string().min(1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateExtraServiceOptionSchema = z.object({
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type ExtraServiceOption = z.infer<typeof extraServiceOptionSchema>;
export type CreateExtraServiceOptionInput = z.infer<typeof createExtraServiceOptionSchema>;
export type UpdateExtraServiceOptionInput = z.infer<typeof updateExtraServiceOptionSchema>;
