import { z } from 'zod';

/**
 * Owner (2026-08-25, "عايز البضاعه في المخزون تكون تصنيفات واقدر اعمل
 * فلتر اشوف بيه كل صنف") — free-form, admin-manageable inventory browsing
 * categories, same shape/discipline as `PartnerCategory`. Independent of
 * `MaterialCategory` (the fixed enum the Pricing Engine depends on).
 */
export const inventoryCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createInventoryCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateInventoryCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type InventoryCategory = z.infer<typeof inventoryCategorySchema>;
export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;
export type UpdateInventoryCategoryInput = z.infer<typeof updateInventoryCategorySchema>;
