import { z } from 'zod';
import { productionTrackSchema } from './order.js';

export const extraServiceOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Owner ("عايز الخدمات الإضافية دي على حسب القسم") — empty means "every track", never restricted. */
  applicableTracks: z.array(productionTrackSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createExtraServiceOptionSchema = z.object({
  label: z.string().min(1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  applicableTracks: z.array(productionTrackSchema).optional(),
});

export const updateExtraServiceOptionSchema = z.object({
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  applicableTracks: z.array(productionTrackSchema).optional(),
});

export type ExtraServiceOption = z.infer<typeof extraServiceOptionSchema>;
export type CreateExtraServiceOptionInput = z.infer<typeof createExtraServiceOptionSchema>;
export type UpdateExtraServiceOptionInput = z.infer<typeof updateExtraServiceOptionSchema>;
