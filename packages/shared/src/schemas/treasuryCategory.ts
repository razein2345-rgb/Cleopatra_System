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

/** Owner (2026-08-20, "حابب إن يظهرلي جمب التصنيف بتاع الخزينة بيدخلي كام إجمالي وشهرياً") — matched by `TreasuryEntry.category`'s free-text value against this category's `name`, not an FK (see TreasuryCategory's own schema comment on why the two stay decoupled). */
export const treasuryCategoryTotalSchema = z.object({
  category: z.string(),
  total: z.number(),
  month: z.number(),
  entryCount: z.number().int(),
});

export type TreasuryCategory = z.infer<typeof treasuryCategorySchema>;
export type CreateTreasuryCategoryInput = z.infer<typeof createTreasuryCategorySchema>;
export type UpdateTreasuryCategoryInput = z.infer<typeof updateTreasuryCategorySchema>;
export type TreasuryCategoryTotal = z.infer<typeof treasuryCategoryTotalSchema>;
