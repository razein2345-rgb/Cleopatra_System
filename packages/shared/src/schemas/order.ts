import { z } from 'zod';
import { createPaymentSchema, paymentSchema } from './payment.js';
import { orderItemPricingInputSchema } from './orderItemPricing.js';

export const orderStatusSchema = z.enum([
  'DRAFT',
  'QUOTATION',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CANCELLED',
]);

/**
 * FEATURE-007 WF-B — matches `WorkflowTemplate.code` for the 4 tracks
 * seeded by WF-A. Chosen explicitly by staff at order-creation time
 * (owner decision, 2026-08-12: "بنفرق على حسب الطلب من الأول") — never
 * inferred from item kind, since e.g. loose paper can legitimately go
 * either Offset or Digital and only the person taking the order knows
 * which. `createWorkOrder` reads this to auto-resolve `templateCode`.
 */
// FEATURE-009 (2026-08-13) — SERVICES/READY_PRODUCTS reserved so a
// services-only or ready-products-only order can eventually get its own
// dedicated WorkflowTemplate; no template exists for either yet (owner:
// "جهز الـarchitecture فقط... لا تخترع لها قواعد من عندك").
export const productionTrackSchema = z.enum([
  'OFFSET',
  'DIGITAL',
  'BOARDS_SIGNAGE',
  'OTHER_PRODUCTS',
  'SERVICES',
  'READY_PRODUCTS',
]);

/**
 * A historical line item snapshot — `kind`/`modelName`/`breakdown` are
 * frozen at the moment of creation and never recomputed from a live
 * source. See ADR 0010 and FEATURE-003 02_PLAN.md's Milestone 2 section
 * ("Order Conversion" / Decision 8).
 *
 * FEATURE-007 PE-E — `itemTotal` is the frozen, queryable/summable result
 * of the pricing engine (packages/shared/src/pricing/*) for this item;
 * `breakdown` still carries the full computation detail (every
 * intermediate figure — zinc cost, print runs, numbering, etc.) for
 * transparency, but `itemTotal` is what `Order.subtotal` sums.
 */
export const orderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  kind: z.string().nullable(),
  modelName: z.string().nullable(),
  breakdown: z.unknown().nullable(),
  itemTotal: z.number().nullable(),
  // FEATURE-007 M2 — sheet-count-to-inventory link, populated only for
  // paper-consuming items. `sheetsConsumed` is frozen at creation time,
  // matching this project's "freeze by default" discipline — never
  // recomputed once written.
  sizeFamilyKey: z.string().nullable(),
  realSizeLabel: z.string().nullable(),
  inventoryItemId: z.string().uuid().nullable(),
  sheetsConsumed: z.number().nullable(),
  createdAt: z.string(),
});

/**
 * `canSeeInternal`-shaped the same way as `quotationSchema` — one DTO,
 * permission-shaped by value, never two response types (FEATURE-003 M2,
 * Decision 5 — Customer View). No Customer Portal caller exists yet, but
 * the shape is prepared now so a future one needs no rewrite.
 */
export const orderSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  branchId: z.string().uuid(),
  partnerId: z.string().uuid(),
  staffId: z.string().uuid(),
  date: z.string(),
  subtotal: z.number(),
  discountPercent: z.number(),
  vatOn: z.boolean(),
  vatAmount: z.number(),
  finalTotal: z.number(),
  paymentTerms: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  customerNotes: z.string().nullable(),
  internalNotes: z.string().nullable(),
  status: orderStatusSchema,
  productionTrack: productionTrackSchema.nullable(),
  quotationOriginId: z.string().uuid().nullable(),
  items: z.array(orderItemSchema),
  // FEATURE-006 M3 — deposits/remaining balance (Approved Addition,
  // "Deposit / Payment Flow"). `paidTotal`/`remainingBalance` are
  // computed from `payments` at read time, never stored — the same
  // "never a stale stored flag" discipline as Workflow Engine's
  // `isDelayed` (see workflowInstanceService.ts's computeIsDelayed).
  payments: z.array(paymentSchema),
  paidTotal: z.number(),
  remainingBalance: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * FEATURE-007 PE-E — `pricing` replaces caller-supplied per-item prices
 * entirely: the service layer runs the real pricing engine
 * (packages/shared/src/pricing/*) against these inputs and freezes the
 * result. `itemType` stays free text (the printed line description);
 * `readyProductId`/`serviceId` select the catalog row PRODUCT/SERVICE
 * pricing reads its unit price from.
 */
export const createOrderItemSchema = z.object({
  itemType: z.string().trim().min(1).max(50),
  notes: z.string().trim().min(1).max(1000).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  // FEATURE-009 (2026-08-13, owner: "لون الحبر / نوع التجليد / نوع
  // السلوفان" على أمر شغل الأوفست) — free-text, printed on the Work
  // Order job-card only, no pricing effect (سلوفان/تجليد's own pricing
  // flags — FOLDER.sellophaneEnabled, NOTEBOOK.bindingPricePerNotebook —
  // are untouched, this is purely descriptive info for the worker).
  inkColor: z.string().trim().min(1).max(200).optional(),
  bindingType: z.string().trim().min(1).max(200).optional(),
  sellophaneType: z.string().trim().min(1).max(200).optional(),
  readyProductId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  // FEATURE-007 — id of an already-uploaded Attachment (POST
  // /api/attachments happens before the item is added to the cart); the
  // service resolves it to a real URL and freezes that into the item's
  // breakdown as `referenceImageUrl`, and links Attachment.orderId once
  // the Order exists.
  attachmentId: z.string().uuid().optional(),
  pricing: orderItemPricingInputSchema,
});

/**
 * FEATURE-007 PE-E — `subtotal`/`vatAmount`/`finalTotal` are no longer
 * caller-supplied: the service sums each item's pricing-engine result,
 * applies `discountPercent`, then `vatOn` against `Setting.vatRate`. A
 * caller can still choose *whether* VAT applies and *how much* discount,
 * but never the resulting numbers themselves — matches the standing rule
 * that this system never invents a second pricing engine at the call site.
 */
export const createOrderSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid(),
  discountPercent: z.number().min(0).max(100).optional(),
  vatOn: z.boolean().optional(),
  paymentTerms: z.string().trim().min(1).max(200).optional(),
  deliveryDate: z.string().optional(),
  customerNotes: z.string().trim().min(1).max(2000).optional(),
  internalNotes: z.string().trim().min(1).max(2000).optional(),
  productionTrack: productionTrackSchema.optional(),
  items: z.array(createOrderItemSchema).min(1),
  // FEATURE-007 — PRICING_ENGINE_SPEC.md §4's multi-payment array,
  // collected at creation time (e.g. cash + bank transfer for the same
  // invoice), not just via the separate post-hoc `POST /:id/payments`.
  payments: z.array(createPaymentSchema).optional(),
});

/**
 * FEATURE-007 — full item replacement (owner, 2026-08-12: "استبدال كامل
 * للأصناف" — recompute pricing, restock the old items, deduct the new
 * ones). `items` is required (not optional like `updateQuotationSchema`)
 * because a partial edit with no items would leave `subtotal`/totals
 * stale — this project's edit flow always resubmits the full cart, never
 * a field-by-field patch. Existing `payments` are never touched here —
 * `paidTotal`/`remainingBalance` are always computed at read time against
 * whatever `finalTotal` results.
 */
export const updateOrderSchema = z.object({
  discountPercent: z.number().min(0).max(100).optional(),
  vatOn: z.boolean().optional(),
  paymentTerms: z.string().trim().min(1).max(200).nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  customerNotes: z.string().trim().min(1).max(2000).nullable().optional(),
  internalNotes: z.string().trim().min(1).max(2000).nullable().optional(),
  productionTrack: productionTrackSchema.nullable().optional(),
  items: z.array(createOrderItemSchema).min(1),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type ProductionTrack = z.infer<typeof productionTrackSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
