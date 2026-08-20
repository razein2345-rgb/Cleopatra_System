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
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "الغيها خالص —
 * النظام يحدد لوحده") — SUPERSEDES the previous doc comment here (which
 * described a manual, staff-picked, order-level track). That decision is
 * now explicitly reversed: track is resolved automatically per OrderItem
 * from the composer tab it was built under (see
 * `packages/shared/src/orders/itemCategories.ts`'s `productionTrack` on
 * each tab) — never a manual dropdown, never one value for a whole order.
 * `SERVICES` gained its WorkflowTemplate 2026-08-16; `READY_PRODUCTS`
 * still has none (ready-made/purchased items need a distinct, not-yet-built
 * "Procurement Job" workflow per CLAUDE.md, not this Design→Print style
 * engine) — an item resolving to a templateless track simply never gets a
 * Work Order, same "best-effort, never blocks the Order" behavior as
 * every other track.
 */
export const productionTrackSchema = z.enum([
  'OFFSET',
  'DIGITAL',
  'BOARDS_SIGNAGE',
  'OTHER_PRODUCTS',
  'SERVICES',
  'READY_PRODUCTS',
  // system_specifications_v2.md §2.4/§7-A.6 "Sublimation & Gifts" (2026-08-16).
  'SUBLIMATION_GIFTS',
]);

/**
 * One shared Arabic label source for `ProductionTrack` — used by every
 * screen that displays a track name (order composer, printed documents,
 * Production Board) so they can never drift into showing two different
 * names for the same track.
 */
export const PRODUCTION_TRACK_LABELS: Record<z.infer<typeof productionTrackSchema>, string> = {
  OFFSET: 'أوفست',
  DIGITAL: 'ديجيتال',
  BOARDS_SIGNAGE: 'لوحات وإعلانات',
  OTHER_PRODUCTS: 'منتجات أخرى',
  SERVICES: 'خدمات',
  READY_PRODUCTS: 'منتجات جاهزة',
  SUBLIMATION_GIFTS: 'طباعة حرارية وهدايا',
};

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — per-`OrderItem`
 * production progress, independent of the shared WorkOrder/WorkflowInstance
 * stage this item's own production job is in. Deliberately a small, plain
 * status (not `StageInstanceStatus`'s WAITING/IN_PROGRESS/DONE/SKIPPED/
 * FAILED) — this tracks "how much of this one item's quantity is
 * physically done," never "what stage is the whole job in."
 */
export const orderItemProductionStatusSchema = z.enum(['WAITING', 'IN_PROGRESS', 'DONE']);

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
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — frozen at creation
  // from the composer tab; null = never enters production (INVENTORY_RETAIL,
  // or a track with no published template). `workOrderId` is set once this
  // item's own Work Order exists.
  productionTrack: productionTrackSchema.nullable(),
  workOrderId: z.string().uuid().nullable(),
  /**
   * Multi-material pricing (2026-08-17) — NOTEBOOK/DIGITAL items only.
   * Populated in creation order (`sortOrder`) when this item consumes more
   * than one material; empty/absent for every other kind (they still use
   * `inventoryItemId`/`sheetsConsumed` above, untouched).
   */
  materials: z
    .array(
      z.object({
        id: z.string().uuid(),
        role: z.string(),
        sortOrder: z.number(),
        inventoryItemId: z.string().uuid(),
        paperName: z.string(),
        sheetPrice: z.number(),
        sheetsConsumed: z.number(),
      }),
    )
    .optional(),
  /**
   * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — optional link to the
   * other items on this order that share the same design/artwork (e.g.
   * 2×A4 + 50×A5 of one flyer). Purely a sales/display/entry concern —
   * `null` behaves identically to every item today; has no effect on
   * pricing (still fully independent per item) or on which WorkOrder this
   * item lands in (still grouped by `productionTrack` alone).
   */
  groupId: z.string().uuid().nullable(),
  /**
   * Per-variant production progress, independent of the shared WorkOrder's
   * own stage. `requiredQuantity` is a frozen snapshot of this item's own
   * quantity (null for kinds with no single meaningful quantity);
   * `producedQuantity`/`productionStatus` are staff-updated as pieces are
   * physically finished — see `updateOrderItemProductionSchema` below.
   */
  requiredQuantity: z.number().int().nullable(),
  producedQuantity: z.number().int(),
  productionStatus: orderItemProductionStatusSchema,
  productionUpdatedAt: z.string().nullable(),
  productionUpdatedById: z.string().uuid().nullable(),
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
  // Owner (2026-08-20, "فاتورة بدون إسم العميل") — nullable for walk-in/cash
  // sales (INVENTORY_RETAIL/MANUAL items only); see createOrderSchema.
  partnerId: z.string().uuid().nullable(),
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
  quotationOriginId: z.string().uuid().nullable(),
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was a singular
  // `workOrderId` (one order = one order-level track = one Work Order).
  // Now a list: one Work Order per distinct `ProductionTrack` actually
  // present among this order's items (see `OrderItem.productionTrack`).
  // Empty array = no item resolved to a track with a published template
  // yet. Lets OrderDocumentPage/NewOrderPage's success screen render one
  // "طباعة أمر الشغل" link per Work Order without a second fetch.
  workOrders: z.array(
    z.object({
      id: z.string().uuid(),
      workOrderNumber: z.string(),
      productionTrack: productionTrackSchema,
    }),
  ),
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
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — stamped client-side
  // from the composer tab (`resolveProductionTrackForTab` in
  // itemCategories.ts), NOT a manual pick. Trusted the same way
  // `itemType`/`inkColor` already are (a descriptive/routing field, not a
  // money figure the pricing engine computes) — the server still runs a
  // cheap consistency check against `pricing.kind` for the unambiguous
  // kinds (see `orderService.ts`'s `assertProductionTrackConsistentWithKind`).
  productionTrack: productionTrackSchema.nullable().optional(),
  /**
   * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — a client-generated
   * correlation key (same `tempKey` pattern `createWorkflowStageSchema`
   * already uses for cross-referencing rows that don't have real ids yet):
   * two items in the same `items[]` array sharing the same `groupKey` get
   * linked to one real `OrderItemGroup` row, created server-side inside the
   * same transaction. Omitted/no match with any other item = this item
   * simply gets no group, exactly like today.
   */
  groupKey: z.string().trim().min(1).max(50).optional(),
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
  // Owner (2026-08-20, "فاتورة بدون إسم العميل") — omitted/null is only
  // valid when every item is INVENTORY_RETAIL or MANUAL (a walk-in/cash
  // sale); enforced server-side in orderService.createOrder, since that's
  // the only place both the partner and the items are known together.
  partnerId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid(),
  discountPercent: z.number().min(0).max(100).optional(),
  vatOn: z.boolean().optional(),
  paymentTerms: z.string().trim().min(1).max(200).optional(),
  deliveryDate: z.string().optional(),
  customerNotes: z.string().trim().min(1).max(2000).optional(),
  internalNotes: z.string().trim().min(1).max(2000).optional(),
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was a single
  // order-level `productionTrack`/`requiresDesign`; superseded by each
  // item's own `productionTrack` (above). `requiresDesignByTrack` is
  // transient — read once at Work-Order-creation time to decide whether
  // that track's design stage auto-skips, never stored on Order or
  // OrderItem (a track only "needs design" at the moment its Work Order
  // is born). Missing a track's key defaults to `true` (unchanged
  // behavior: every track goes through design unless told not to).
  requiresDesignByTrack: z.record(z.string(), z.boolean()).optional(),
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
  requiresDesignByTrack: z.record(z.string(), z.boolean()).optional(),
  items: z.array(createOrderItemSchema).min(1),
});

/**
 * Owner (2026-08-20, "فاتورة كانت معمولة... كانت فاتورة بدون عميل فا
 * محتاج اعدلها واخليها بدون عميل") — a dedicated single-purpose mutation
 * (mirrors `setQuotationStatusSchema`'s own separateness from the full
 * item-replacement edit above), not folded into `updateOrderSchema`: this
 * never touches items/pricing, just which customer (if any) the invoice is
 * attributed to. `null` is only accepted server-side when every item is
 * INVENTORY_RETAIL/MANUAL — same rule `createOrderSchema.partnerId`
 * enforces at creation time (see `orderService.ts`'s
 * `assertPartnerPresentUnlessWalkIn`).
 */
export const setOrderPartnerSchema = z.object({
  partnerId: z.string().uuid().nullable(),
});

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — the one mutation path
 * for an OrderItem's own production progress; deliberately separate from
 * `updateOrderSchema` (which replaces the whole cart) since this touches
 * exactly one item's progress counters, not pricing or item content.
 * `status`, when omitted, is derived server-side from `producedQuantity`
 * vs. the item's frozen `requiredQuantity` — sent explicitly here only
 * when the caller wants to override that derivation (e.g. flagging
 * IN_PROGRESS before any pieces are counted yet).
 */
export const updateOrderItemProductionSchema = z.object({
  producedQuantity: z.number().int().nonnegative().optional(),
  status: orderItemProductionStatusSchema.optional(),
});

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 2.1 — the owner-only Dashboard financial
 * widget's sales figures. `receivablesTotal`/`receivablesCount` (owner,
 * 2026-08-20: "المفروض يبانلي انا ليا كام مستحقات عند الناس") — sum of
 * every non-cancelled order's `remainingBalance` still above zero, across
 * all time (not scoped to today/week like the sales figures above it).
 */
export const salesSummarySchema = z.object({
  todayTotal: z.number(),
  todayCount: z.number().int(),
  weekTotal: z.number(),
  weekCount: z.number().int(),
  receivablesTotal: z.number(),
  receivablesCount: z.number().int(),
});

export type SalesSummary = z.infer<typeof salesSummarySchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type ProductionTrack = z.infer<typeof productionTrackSchema>;
export type OrderItemProductionStatus = z.infer<typeof orderItemProductionStatusSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type SetOrderPartnerInput = z.infer<typeof setOrderPartnerSchema>;
export type UpdateOrderItemProductionInput = z.infer<typeof updateOrderItemProductionSchema>;
