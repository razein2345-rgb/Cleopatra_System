import { z } from 'zod';
import { inventoryUnitSchema } from './sheetType.js';

export const materialCategorySchema = z.enum(['PAPER', 'INK', 'PLATE', 'FINISHING', 'CONSUMABLE']);
export const stockMovementTypeSchema = z.enum(['IN', 'OUT', 'ADJUSTMENT']);

/**
 * `quantityOnHand`/`isLowStock` are derived at read time from `StockLevel`
 * (the caller's branch) — never stored on the DTO itself, same "never a
 * stale stored flag" discipline as `Order.remainingBalance`.
 */
export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  category: materialCategorySchema,
  name: z.string(),
  unit: inventoryUnitSchema,
  sheetTypeId: z.string().uuid().nullable(),
  // FEATURE-007 PE-E — the linked SheetType's per-sheet price, read at
  // response time (never stored redundantly here). Null for items with no
  // `sheetTypeId` (non-paper categories). Lets `NewOrderPage.tsx` price a
  // LOOSE_PAPER/NOTEBOOK/FOLDER item client-side without a separate
  // `/api/sheet-types` call (that endpoint needs `settings.view`, which
  // reception/sales order-creators don't hold).
  sheetPrice: z.number().nullable(),
  reorderLevel: z.number().nonnegative().nullable(),
  quantityOnHand: z.number(),
  isLowStock: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `initialQuantity` registers on-hand stock in the same call — the owner's
 * own ask ("اسجل عليه البضاعه اللي عندي") — recorded as an `IN`
 * `StockMovement`, not written directly onto `StockLevel`.
 */
export const createInventoryItemSchema = z.object({
  category: materialCategorySchema,
  name: z.string().trim().min(1).max(150),
  unit: inventoryUnitSchema,
  sheetTypeId: z.string().uuid().optional(),
  reorderLevel: z.number().nonnegative().optional(),
  initialQuantity: z.number().nonnegative().optional(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  reorderLevel: z.number().nonnegative().nullable().optional(),
});

export const createStockMovementSchema = z.object({
  type: stockMovementTypeSchema,
  quantity: z.number().positive(),
  reference: z.string().trim().min(1).max(200).optional(),
});

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  branchId: z.string().uuid(),
  type: stockMovementTypeSchema,
  quantity: z.number(),
  reference: z.string().nullable(),
  date: z.string(),
  createdAt: z.string(),
});

export type MaterialCategory = z.infer<typeof materialCategorySchema>;
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
