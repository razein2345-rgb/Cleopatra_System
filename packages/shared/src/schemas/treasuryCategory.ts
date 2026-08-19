import { z } from 'zod';

export const treasuryCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTreasuryCategorySchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const updateTreasuryCategorySchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type TreasuryCategory = z.infer<typeof treasuryCategorySchema>;
export type CreateTreasuryCategoryInput = z.infer<typeof createTreasuryCategorySchema>;
export type UpdateTreasuryCategoryInput = z.infer<typeof updateTreasuryCategorySchema>;
