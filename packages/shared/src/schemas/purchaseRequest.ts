import { z } from 'zod';

export const purchaseRequestStatusSchema = z.enum(['PENDING', 'PURCHASED']);

/**
 * Owner (2026-08-27, "الروول أب... لما نطلب الاوردر يتحط في قائمة شراء
 * عاجل... ويروح للمورد اللي بيطبع البانر ويركبه") — a `PurchaseRequest`
 * has two origins sharing the same queue/"اتشرت" flow: `STOCK_SHORTFALL`
 * (an `InventoryItem` went negative — part 2) has a real quantity/stock
 * effect; `BOARDS_PURCHASE`/`BOARDS_ASSEMBLY` (a `BoardsCatalogItem`
 * order — part 3, e.g. a Roll-Up) has no stock concept at all, just a
 * supplier obligation to book — one row per step since the purchase and
 * the assembly are genuinely two different suppliers with two different
 * amounts.
 */
export const purchaseRequestKindSchema = z.enum(['STOCK_SHORTFALL', 'BOARDS_PURCHASE', 'BOARDS_ASSEMBLY']);

/**
 * "قائمة شراء عاجل": one row per real need caused by a real customer
 * Order, created automatically server-side — never a caller-composed
 * input (see orderService.ts's stock-deduction hook for `STOCK_SHORTFALL`,
 * pricingEngineService.ts's BOARDS catalog dispatch for `BOARDS_*`). This
 * schema is read-only from the client's perspective; the only write
 * endpoint is "mark purchased" (`markPurchaseRequestPurchasedSchema`
 * below). Exactly one of `inventoryItemId`/`boardsCatalogItemId` is ever
 * set, matching `kind`.
 */
export const purchaseRequestSchema = z.object({
  id: z.string().uuid(),
  kind: purchaseRequestKindSchema,
  inventoryItemId: z.string().uuid().nullable(),
  inventoryItemName: z.string().nullable(),
  boardsCatalogItemId: z.string().uuid().nullable(),
  boardsCatalogItemName: z.string().nullable(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  orderId: z.string().uuid(),
  orderInvoiceNumber: z.string(),
  orderItemId: z.string().uuid().nullable(),
  /** `STOCK_SHORTFALL` only — null for `BOARDS_*` rows (no quantity concept). */
  quantityNeeded: z.number().nullable(),
  status: purchaseRequestStatusSchema,
  purchasedQuantity: z.number().nullable(),
  purchasedAmount: z.number().nullable(),
  purchasedAt: z.string().nullable(),
  purchasedByName: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * "اتشرت" — staff confirms the real purchase. `purchasedQuantity` is
 * pre-filled from the shortfall default for `STOCK_SHORTFALL` rows
 * (editable, often not identical to what was actually bought) and
 * meaningless for `BOARDS_*` rows (no stock to restock) — optional here,
 * the service ignores it for those.
 */
export const markPurchaseRequestPurchasedSchema = z.object({
  purchasedQuantity: z.number().positive().optional(),
  purchasedAmount: z.number().nonnegative(),
});

export type PurchaseRequestStatus = z.infer<typeof purchaseRequestStatusSchema>;
export type PurchaseRequestKind = z.infer<typeof purchaseRequestKindSchema>;
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type MarkPurchaseRequestPurchasedInput = z.infer<typeof markPurchaseRequestPurchasedSchema>;
