import { z } from 'zod';

export const treasuryCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** A single emoji, admin-entered — see the Prisma model's own doc comment. Optional. */
  icon: z.string().max(8).nullable(),
  /** Owner (2026-09-13, POS "كتالوج التصنيفات") — explicit per-category choice, not a name match. When true, the picker asks for a per-unit price + a count instead of one flat price. */
  calculateByQuantity: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTreasuryCategorySchema = z.object({
  name: z.string().min(1),
  icon: z.string().max(8).optional(),
  calculateByQuantity: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTreasuryCategorySchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().max(8).nullable().optional(),
  calculateByQuantity: z.boolean().optional(),
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
