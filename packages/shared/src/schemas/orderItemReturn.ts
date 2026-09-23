import { z } from 'zod';

/**
 * Owner (2026-08-23, "مرتجعات") — scoped to INVENTORY_RETAIL order items
 * only (confirmed v1 scope). A single OrderItem can have several of these
 * rows (partial-quantity returns), capped in the service layer at the
 * quantity originally sold. Refund is always cash (owner, "كاش في الدرج
 * دائمًا") — see the paired TreasuryEntry this creates.
 */
export const orderItemReturnSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  // Accounting fix (2026-09-17) — nullable now: an order edit detaches a
  // return from its (deleted-and-recreated) OrderItem, but the return row
  // itself survives (see the Prisma schema's own doc comment on this FK).
  // `orderId` above always identifies which order it belongs to.
  orderItemId: z.string().uuid().nullable(),
  quantity: z.number(),
  refundAmount: z.number(),
  reason: z.string().nullable(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
});

export const createOrderItemReturnSchema = z.object({
  // Owner (2026-08-23, "مينفعش أي كمية تكون بتقبل تبقى كسر") — matches
  // `inventoryRetailPricingInputSchema.quantity`'s own `.int()` (the
  // original sale is always whole pieces, so a return of it must be too).
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000).optional(),
});

export type OrderItemReturn = z.infer<typeof orderItemReturnSchema>;
export type CreateOrderItemReturnInput = z.infer<typeof createOrderItemReturnSchema>;
