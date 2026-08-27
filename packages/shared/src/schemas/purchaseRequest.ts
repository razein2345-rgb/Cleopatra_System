import { z } from 'zod';

export const purchaseRequestStatusSchema = z.enum(['PENDING', 'PURCHASED']);

/**
 * Owner (2026-08-27, "الشراء العاجل لما يكون تبع طلب من الطلبات اللي
 * العملا طلبوها") — "قائمة شراء عاجل": one row per real stock shortfall
 * caused by a real customer Order, created automatically server-side —
 * never a caller-composed input (see orderService.ts's stock-deduction
 * hook). This schema is read-only from the client's perspective; the only
 * write endpoint is "mark purchased" (`markPurchaseRequestPurchasedSchema`
 * below).
 */
export const purchaseRequestSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  inventoryItemName: z.string(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  orderId: z.string().uuid(),
  orderInvoiceNumber: z.string(),
  orderItemId: z.string().uuid().nullable(),
  quantityNeeded: z.number(),
  status: purchaseRequestStatusSchema,
  purchasedQuantity: z.number().nullable(),
  purchasedAmount: z.number().nullable(),
  purchasedAt: z.string().nullable(),
  purchasedByName: z.string().nullable(),
  createdAt: z.string(),
});

/** "اتشرت" — staff confirms the real purchase, editable from the pre-filled shortfall default (often not identical to what was actually bought). */
export const markPurchaseRequestPurchasedSchema = z.object({
  purchasedQuantity: z.number().positive(),
  purchasedAmount: z.number().nonnegative(),
});

export type PurchaseRequestStatus = z.infer<typeof purchaseRequestStatusSchema>;
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type MarkPurchaseRequestPurchasedInput = z.infer<typeof markPurchaseRequestPurchasedSchema>;
