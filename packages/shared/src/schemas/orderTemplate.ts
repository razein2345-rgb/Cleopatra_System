import { z } from 'zod';
import { createOrderItemSchema } from './order.js';

/**
 * Owner (2026-08-17, "بعد ما الاوردر يتحفظ يسألني هل احفظه كقالب دوري") —
 * a reusable snapshot of an order's line-item configuration. `itemsSnapshot`
 * reuses `createOrderItemSchema` verbatim (the exact shape `NewOrderPage.tsx`
 * already builds per line and posts to `/api/orders`) — no separate/
 * duplicated item-shape (rule 5). Pricing is never stored/reused as-is:
 * loading a template only rehydrates the composer, the pricing engine
 * always recomputes fresh.
 */
export const orderTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  branchId: z.string().uuid(),
  createdById: z.string().uuid(),
  /** The customer this template was first saved from — context only, never restricts reuse. */
  partnerId: z.string().uuid().nullable(),
  itemsSnapshot: z.array(createOrderItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createOrderTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  branchId: z.string().uuid(),
  partnerId: z.string().uuid().optional(),
  itemsSnapshot: z.array(createOrderItemSchema).min(1),
});

export type OrderTemplate = z.infer<typeof orderTemplateSchema>;
export type CreateOrderTemplateInput = z.infer<typeof createOrderTemplateSchema>;
