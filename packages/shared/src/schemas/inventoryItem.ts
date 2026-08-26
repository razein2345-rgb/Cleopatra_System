import { z } from 'zod';
import { inventoryUnitSchema } from './sheetType.js';
import { paymentMethodSchema } from './partnerCommercialProfile.js';

export const materialCategorySchema = z.enum(['PAPER', 'INK', 'PLATE', 'FINISHING', 'CONSUMABLE', 'READY_MADE']);
export const stockMovementTypeSchema = z.enum(['IN', 'OUT', 'ADJUSTMENT']);

/**
 * `quantityOnHand`/`isLowStock` are derived at read time from `StockLevel`
 * (the caller's branch) — never stored on the DTO itself, same "never a
 * stale stored flag" discipline as `Order.remainingBalance`.
 */
export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  category: materialCategorySchema,
  // Owner (2026-08-25, "عايز البضاعه في المخزون تكون تصنيفات واقدر اعمل
  // فلتر اشوف بيه كل صنف") — a separate, free-form browsing category
  // (InventoryCategory), independent of `category` above.
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  name: z.string(),
  unit: inventoryUnitSchema,
  sheetTypeId: z.string().uuid().nullable(),
  barcode: z.string().nullable(),
  // FEATURE-007 PE-E — the linked SheetType's per-sheet price, read at
  // response time (never stored redundantly here). Null for items with no
  // `sheetTypeId` (non-paper categories). Lets `NewOrderPage.tsx` price a
  // LOOSE_PAPER/NOTEBOOK/FOLDER item client-side without a separate
  // `/api/sheet-types` call (that endpoint needs `settings.view`, which
  // reception/sales order-creators don't hold).
  sheetPrice: z.number().nullable(),
  // system_specifications_v2.md (2026-08-16) — retail sale price for a
  // READY_MADE item, sold directly off the shelf (owner: "مخزون جاهز
  // عندي"). Null for the other 5 categories.
  salePrice: z.number().nullable(),
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
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(150),
  unit: inventoryUnitSchema,
  sheetTypeId: z.string().uuid().optional(),
  reorderLevel: z.number().nonnegative().optional(),
  initialQuantity: z.number().nonnegative().optional(),
  barcode: z.string().trim().min(1).max(100).optional(),
  salePrice: z.number().nonnegative().optional(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  // Owner (2026-08-25, "عايز اقدر اعدل في الفئه واغيرها") — corrects a
  // miscategorized item after creation (same freedom already available
  // at creation time); no calculation changes, only which of the 6
  // buckets an item belongs to.
  category: materialCategorySchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  reorderLevel: z.number().nonnegative().nullable().optional(),
  barcode: z.string().trim().min(1).max(100).nullable().optional(),
  salePrice: z.number().nonnegative().nullable().optional(),
});

export const createStockMovementSchema = z.object({
  type: stockMovementTypeSchema,
  quantity: z.number().positive(),
  reference: z.string().trim().min(1).max(200).optional(),
});

/**
 * Owner (2026-08-20, "لا عايز اقدر اعدل الحركة واحذفها") — correcting an
 * already-recorded movement (wrong quantity/type/date/reference), not just
 * adding a new one. `branchId` (2026-08-24, "عايز اغير الفرع في عملية بيع
 * سريع") extends the same edit path to the branch a movement is attributed
 * to — same treasury-entry branch-edit capability already built for MANUAL
 * entries, now covering QUICK_SALE-sourced ones too.
 */
export const updateStockMovementSchema = z.object({
  type: stockMovementTypeSchema.optional(),
  quantity: z.number().positive().optional(),
  reference: z.string().trim().min(1).max(200).nullable().optional(),
  date: z.string().optional(),
  branchId: z.string().uuid().optional(),
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

/**
 * Owner (2026-08-20, "لو حد خد صنف بسيط من قسم بضاعة من المخزون مش مضطر
 * اطلع عليه فاتورة وعايزة يتسجل في حركة الخزينة ويخصمه من المخزن") — a
 * one-step cash sale with no Order/invoice at all: deducts stock (a normal
 * `OUT` StockMovement) and records treasury income, paired atomically. Edit/
 * delete only ever happens through the StockMovement (see
 * `updateStockMovementSchema`/`deleteStockMovement`) — the paired
 * TreasuryEntry follows automatically, never edited directly (same
 * `sourceType !== 'MANUAL'` guard `treasuryService.ts` already enforces).
 */
export const quickInventorySaleSchema = z.object({
  quantity: z.number().positive(),
  /** Defaults to `InventoryItem.salePrice` server-side when omitted. */
  unitPrice: z.number().nonnegative().optional(),
  /**
   * Owner (2026-08-26, "الخصم على بند واحد عايزها نسبه... ويتضاف الخصم ده
   * على البيع السريع") — same percentage-off-the-item convention as the
   * order composer's per-item discount. Applied on top of `unitPrice`
   * (or `salePrice` when omitted) before multiplying by `quantity` —
   * the treasury entry's `amount` always reflects the actual price charged.
   */
  discountPercent: z.number().min(0).max(100).optional(),
  method: paymentMethodSchema,
  category: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().min(1).max(500).optional(),
});

export type MaterialCategory = z.infer<typeof materialCategorySchema>;
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
export type UpdateStockMovementInput = z.infer<typeof updateStockMovementSchema>;
export type QuickInventorySaleInput = z.infer<typeof quickInventorySaleSchema>;
