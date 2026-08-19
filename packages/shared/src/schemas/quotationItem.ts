import { z } from 'zod';
import { orderItemPricingInputSchema } from './orderItemPricing.js';
import { productionTrackSchema } from './order.js';

/**
 * Known item types offered as UI presets — NOT an enforced enum.
 * `itemType` is a plain string at the schema/DB level specifically so a
 * future business line can introduce a new value with zero migration
 * (FEATURE-003 M1's "Product Type Agnostic" architectural decision).
 */
export const KNOWN_QUOTATION_ITEM_TYPES = [
  'READY_PRODUCT',
  'SERVICE',
  'PRINTING_PRODUCT',
  'MARKETING_SERVICE',
  'GRAPHIC_DESIGN',
  'PHOTOGRAPHY',
  'VIDEO_EDITING',
  'BRANDING',
  'CUSTOM',
] as const;

/**
 * FEATURE-007 — `itemTotal`/`breakdown`/`kind`/`modelName` are the frozen
 * Pricing Engine result, same shape and same freeze-at-creation discipline
 * as `orderItemSchema` (see order.ts's own doc comment) — the owner's
 * explicit clarification (2026-08-10) that Quotation creation runs
 * through the identical engine as Order, not a separate/lesser one.
 */
export const quotationItemSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  itemType: z.string(),
  notes: z.string().nullable(),
  description: z.string().nullable(),
  readyProductId: z.string().uuid().nullable(),
  serviceId: z.string().uuid().nullable(),
  kind: z.string().nullable(),
  modelName: z.string().nullable(),
  breakdown: z.unknown().nullable(),
  itemTotal: z.number().nullable(),
  sizeFamilyKey: z.string().nullable(),
  realSizeLabel: z.string().nullable(),
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — mirrors
  // OrderItem.productionTrack so `convertQuotation` can carry each item's
  // own track into the new Order's items instead of losing it.
  productionTrack: productionTrackSchema.nullable(),
  // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — mirrors
  // OrderItem.groupId/requiredQuantity, same carry-through-on-conversion
  // reasoning as productionTrack above.
  groupId: z.string().uuid().nullable(),
  requiredQuantity: z.number().int().nullable(),
  createdAt: z.string(),
});

/**
 * FEATURE-007 — `pricing` replaces caller-supplied per-item prices
 * entirely, identical shape to `createOrderItemSchema` (order.ts) — the
 * service layer runs the real pricing engine against these inputs and
 * freezes the result. No `quantity`/`size` at this level any more (each
 * pricing kind carries its own quantity field already).
 */
export const createQuotationItemSchema = z.object({
  itemType: z.string().trim().min(1).max(50),
  notes: z.string().trim().min(1).max(1000).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  readyProductId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  // FEATURE-007 — same attachment-linking pattern as createOrderItemSchema
  // (order.ts) — see its doc comment.
  attachmentId: z.string().uuid().optional(),
  pricing: orderItemPricingInputSchema,
  // Same stamped-from-composer-tab field as createOrderItemSchema — see
  // its doc comment (order.ts).
  productionTrack: productionTrackSchema.nullable().optional(),
  // Same client-correlation-key pattern as createOrderItemSchema — see its
  // doc comment (order.ts).
  groupKey: z.string().trim().min(1).max(50).optional(),
});

export type QuotationItem = z.infer<typeof quotationItemSchema>;
export type CreateQuotationItemInput = z.infer<typeof createQuotationItemSchema>;
