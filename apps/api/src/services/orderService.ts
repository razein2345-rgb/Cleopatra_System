import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateOrderItemInput,
  CreateOrderItemReturnInput,
  CreatePaymentInput,
  Order,
  OrderItem,
  OrderItemReturn,
  Payment,
  ProductionTrack,
  SalesSummary,
  UpdatePaymentInput,
} from '@cleopatra/shared';
import { resolveRequiredQuantity } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { deductStockForOrderItem, restockForOrderItem } from './inventoryService.js';
import { buildPricingContext, computeItemPricing, type ItemPricingResult } from './pricingEngineService.js';
import { getPublicAttachmentUrl } from './attachmentService.js';
import { createWorkOrderForTrack, softDeleteWorkOrderTx, tryAutoCreateWorkOrders } from './workOrderService.js';
import { assertBranchDayNotClosed, reopenDayIfClosed } from './treasuryService.js';

export { PricingInputError } from './pricingEngineService.js';

/**
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — `productionTrack` is
 * stamped client-side from the composer tab (see
 * `packages/shared/src/orders/itemCategories.ts`), trusted the same way
 * `itemType`/`inkColor` already are — not the same trust tier as
 * `pricing`, which the server always recomputes. This is a cheap defense,
 * not full re-derivation: for the kinds where the tab→track mapping is
 * unambiguous, a mismatched track is almost certainly an integration bug
 * worth rejecting early; PRODUCT (shared by READY_PRODUCTS and
 * SUBLIMATION_GIFTS) and SERVICE have no single correct answer from `kind`
 * alone, so anything the client sent for those is accepted as-is.
 */
export class InconsistentProductionTrackError extends Error {
  constructor(kind: string, productionTrack: string) {
    super(`Item kind "${kind}" cannot resolve to production track "${productionTrack}"`);
    this.name = 'InconsistentProductionTrackError';
  }
}

/**
 * Owner (2026-08-20, "فاتورة بدون إسم العميل") — a walk-in/cash sale (no
 * `BusinessPartner`) is only valid when every item is INVENTORY_RETAIL or
 * MANUAL; anything else (a produced job, a service, a catalog product)
 * needs a real customer to track. Checked here, not in the Zod schema,
 * because the rule depends on both `partnerId` and `items` together.
 */
export class PartnerRequiredError extends Error {
  constructor() {
    super('partnerId is required unless every item is INVENTORY_RETAIL or MANUAL');
    this.name = 'PartnerRequiredError';
  }
}

const WALK_IN_ALLOWED_KINDS = new Set(['INVENTORY_RETAIL', 'MANUAL']);

/**
 * Owner (2026-08-23, "تخفيض على صنف محدد وليس بالضرورة كل الفاتورة") — a
 * per-item discount can't exceed that item's own frozen pricing-engine
 * total (an item can't go negative). Deliberately checked against the
 * fresh `priced[i].total`, not a caller-supplied number, so this can
 * never be gamed by inflating the discount alongside a lowballed price.
 */
export class ItemDiscountExceedsTotalError extends Error {
  constructor(index: number) {
    super(`Item ${index}'s discountAmount exceeds its own total`);
    this.name = 'ItemDiscountExceedsTotalError';
  }
}

/**
 * Owner (2026-08-26, "الخصم على بند واحد عايزها نسبه مش بالجنيه") — the
 * caller now supplies a percentage (0-100) per item instead of a flat
 * amount; this converts each to a frozen currency amount against that
 * item's own freshly-computed total, the shape `assertItemDiscountsValid`/
 * `sumItemDiscounts`/every write path below still work with unchanged
 * (they never cared whether the amount came from a percent or was typed
 * directly — only `OrderItem.discountAmount`'s storage format matters).
 */
export function resolveItemDiscountAmounts(items: { discountPercent?: number }[], priced: { total: number }[]): number[] {
  return items.map((item, index) => (priced[index]!.total * (item.discountPercent ?? 0)) / 100);
}

export function assertItemDiscountsValid(discountAmounts: number[], priced: { total: number }[]): void {
  discountAmounts.forEach((discount, index) => {
    if (discount > priced[index]!.total) {
      throw new ItemDiscountExceedsTotalError(index);
    }
  });
}

export function sumItemDiscounts(discountAmounts: number[]): number {
  return discountAmounts.reduce((sum, discount) => sum + discount, 0);
}

export function assertPartnerPresentUnlessWalkIn(partnerId: string | null | undefined, items: { pricing: { kind: string } }[]) {
  if (partnerId) return;
  if (items.every((item) => WALK_IN_ALLOWED_KINDS.has(item.pricing.kind))) return;
  throw new PartnerRequiredError();
}

const UNAMBIGUOUS_TRACK_BY_KIND: Partial<Record<string, ProductionTrack>> = {
  LOOSE_PAPER: 'OFFSET',
  NOTEBOOK: 'OFFSET',
  FOLDER: 'OFFSET',
  ENVELOPE: 'OFFSET',
  DIGITAL: 'DIGITAL',
  BOARDS: 'BOARDS_SIGNAGE',
  SERVICE: 'SERVICES',
  INVENTORY_RETAIL: undefined, // must resolve to no track at all
  MANUAL: undefined, // same — a manual/custom line is never a production job
};

function assertProductionTrackConsistentWithKind(kind: string, productionTrack: ProductionTrack | null | undefined): void {
  if (!(kind in UNAMBIGUOUS_TRACK_BY_KIND)) return; // PRODUCT — genuinely ambiguous, no check possible
  const expected = UNAMBIGUOUS_TRACK_BY_KIND[kind];
  if ((productionTrack ?? undefined) !== expected) {
    throw new InconsistentProductionTrackError(kind, productionTrack ?? 'null');
  }
}

/**
 * Centralized here (not duplicated per controller) — `orders.ts` and
 * `quotations.ts` (convertQuotation, which returns the created Order) both
 * import this single definition. `payments: true` added in FEATURE-006 M3
 * so `mapOrderToDto` can always compute `paidTotal`/`remainingBalance`.
 */
export const ORDER_INCLUDE = {
  items: {
    include: {
      materials: { orderBy: { sortOrder: 'asc' } },
      // Owner (2026-08-23, "مرتجعات") — needed so `mapOrderToDto` can
      // always compute `returnedTotal`/`netTotal`, same pattern as
      // `payments` below.
      returns: { orderBy: { createdAt: 'asc' } },
    },
  },
  quotationOrigin: { select: { id: true } },
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was a to-one
  // `workOrder` select; now a filtered list (Prisma supports `where` on a
  // to-many include, unlike the old to-one relation) — only non-deleted
  // Work Orders, one per resolved track actually present among the
  // order's items.
  workOrders: { where: { isDeleted: false }, select: { id: true, workOrderNumber: true, productionTrack: true } },
  payments: { where: { isDeleted: false } },
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type OrderItemRecord = Prisma.OrderItemGetPayload<{ include: { materials: true; returns: true } }>;
type PaymentRecord = Prisma.PaymentGetPayload<object>;
type OrderItemReturnRecord = Prisma.OrderItemReturnGetPayload<object>;

export function mapOrderItemReturnToDto(ret: OrderItemReturnRecord): OrderItemReturn {
  return {
    id: ret.id,
    orderItemId: ret.orderItemId,
    quantity: ret.quantity.toNumber(),
    refundAmount: ret.refundAmount.toNumber(),
    reason: ret.reason,
    recordedById: ret.recordedById,
    createdAt: ret.createdAt.toISOString(),
  };
}

/**
 * Owner (2026-08-26, "هيتصمم ويتبعت للمورد... سعر المورد") — a BOARDS
 * item's `breakdown.supplierCost` is real money owed to a real external
 * vendor, the same "internal, not customer/general-staff facing" class of
 * data as `StageInstance.externalCost` (see `workflowInstanceService.ts`'s
 * identical `canSeeInternal` gate on that field) — stripped here rather
 * than at the controller layer since `breakdown` is a single opaque JSON
 * blob, not a flat column `stripCostPrice`-style helpers can target.
 */
function stripSupplierCostIfNeeded(breakdown: Prisma.JsonValue, canSeeInternal: boolean): Prisma.JsonValue {
  if (canSeeInternal || breakdown === null || typeof breakdown !== 'object' || Array.isArray(breakdown)) {
    return breakdown;
  }
  if (!('supplierCost' in breakdown)) return breakdown;
  const { supplierCost: _supplierCost, ...rest } = breakdown as Record<string, unknown>;
  return rest as Prisma.JsonValue;
}

export function mapOrderItemToDto(item: OrderItemRecord, canSeeInternal: boolean): OrderItem {
  return {
    id: item.id,
    orderId: item.orderId,
    kind: item.kind,
    modelName: item.modelName,
    breakdown: stripSupplierCostIfNeeded(item.breakdown, canSeeInternal),
    itemTotal: item.itemTotal?.toNumber() ?? null,
    sizeFamilyKey: item.sizeFamilyKey,
    realSizeLabel: item.realSizeLabel,
    inventoryItemId: item.inventoryItemId,
    sheetsConsumed: item.sheetsConsumed?.toNumber() ?? null,
    productionTrack: item.productionTrack,
    workOrderId: item.workOrderId,
    materials: item.materials.map((m) => ({
      id: m.id,
      role: m.role,
      sortOrder: m.sortOrder,
      inventoryItemId: m.inventoryItemId,
      paperName: m.paperName,
      sheetPrice: m.sheetPrice.toNumber(),
      sheetsConsumed: m.sheetsConsumed.toNumber(),
    })),
    groupId: item.groupId,
    requiredQuantity: item.requiredQuantity,
    producedQuantity: item.producedQuantity,
    productionStatus: item.productionStatus,
    productionUpdatedAt: item.productionUpdatedAt?.toISOString() ?? null,
    productionUpdatedById: item.productionUpdatedById,
    returns: item.returns.map(mapOrderItemReturnToDto),
    discountAmount: item.discountAmount.toNumber(),
    preferredSupplierId: item.preferredSupplierId,
    // Owner (2026-08-26, branch-profit reporting) — real catalog FK, see
    // OrderItem.readyProductId's own schema doc comment. Null on orders
    // created before this column existed.
    readyProductId: item.readyProductId,
    serviceId: item.serviceId,
    boardsCatalogItemId: item.boardsCatalogItemId,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Multi-material pricing (2026-08-17) — the single place that decides which
 * (material, quantity) pairs to deduct/restock for a priced item, shared by
 * `createOrder`/`updateOrder`. Prefers `result.materials` (NOTEBOOK/DIGITAL)
 * when present; every other kind falls back to the singular
 * `inventoryItemId`/`sheetsNeeded` fields, untouched — same one call to
 * `deductStockForOrderItem` it always made, just reached through one shared
 * function instead of an inline `if`.
 */
function materialsToDeduct(result: ItemPricingResult): { inventoryItemId: string; sheetsNeeded: number }[] {
  if (result.materials?.length) {
    return result.materials.map((m) => ({ inventoryItemId: m.inventoryItemId, sheetsNeeded: m.sheetsNeeded }));
  }
  if (result.inventoryItemId && result.sheetsNeeded) {
    return [{ inventoryItemId: result.inventoryItemId, sheetsNeeded: result.sheetsNeeded }];
  }
  return [];
}

/** The restock-on-edit/delete counterpart to `materialsToDeduct` above, reading from an already-persisted `OrderItem` row (with its `materials` relation) instead of a fresh `ItemPricingResult`. */
function materialsToRestock(item: {
  inventoryItemId: string | null;
  sheetsConsumed: Prisma.Decimal | null;
  materials: { inventoryItemId: string; sheetsConsumed: Prisma.Decimal }[];
}): { inventoryItemId: string; sheetsNeeded: number }[] {
  if (item.materials.length) {
    return item.materials.map((m) => ({ inventoryItemId: m.inventoryItemId, sheetsNeeded: m.sheetsConsumed.toNumber() }));
  }
  if (item.inventoryItemId && item.sheetsConsumed) {
    return [{ inventoryItemId: item.inventoryItemId, sheetsNeeded: item.sheetsConsumed.toNumber() }];
  }
  return [];
}

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — creates one real
 * `OrderItemGroup` row per distinct `groupKey` shared by two or more items
 * (a "group" of exactly one item isn't meaningful — the composer only ever
 * sets `groupKey` when duplicating a line as a variant of another), and
 * returns a map from that key to the real id for `buildOrderItemCreate`'s
 * `groupId` param. Shared by `createOrder`/`updateOrder` so the two can
 * never drift.
 */
async function resolveOrderItemGroups(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: { groupKey?: string }[],
): Promise<Map<string, string>> {
  const keyCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.groupKey) continue;
    keyCounts.set(item.groupKey, (keyCounts.get(item.groupKey) ?? 0) + 1);
  }

  const groupKeyToId = new Map<string, string>();
  for (const [key, count] of keyCounts) {
    if (count < 2) continue;
    const group = await tx.orderItemGroup.create({ data: { orderId } });
    groupKeyToId.set(key, group.id);
  }
  return groupKeyToId;
}

export function mapPaymentToDto(payment: PaymentRecord): Payment {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    amount: payment.amount.toNumber(),
    createdAt: payment.createdAt.toISOString(),
  };
}

/**
 * `canSeeInternal` is an explicit capability input, mirroring
 * `mapQuotationToDto` exactly — a future Customer Portal caller computes
 * this differently (e.g. always `false`) and calls this same function
 * (FEATURE-003 M2, Decision 5 — Customer View).
 */
export function mapOrderToDto(order: OrderRecord, canSeeInternal: boolean): Order {
  const payments = order.payments.map(mapPaymentToDto);
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const finalTotal = order.finalTotal.toNumber();
  // Owner (2026-08-23, "مرتجعات") — summed across every item's returns.
  // `finalTotal` itself is never mutated (rule 9); `netTotal` is what's
  // actually owed once returns are accounted for.
  const returnedTotal = order.items.reduce(
    (sum, item) => sum + item.returns.reduce((s, r) => s + r.refundAmount.toNumber(), 0),
    0,
  );
  const netTotal = finalTotal - returnedTotal;
  // Owner (2026-08-23, "تخفيض على صنف محدد") — summed across every item's
  // own frozen discountAmount, same "computed at read time" discipline as
  // `returnedTotal` above (each item's own value is what's stored/frozen;
  // this total is just their sum, never stored separately).
  const itemDiscountsTotal = order.items.reduce((sum, item) => sum + item.discountAmount.toNumber(), 0);
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    branchId: order.branchId,
    partnerId: order.partnerId,
    staffId: order.staffId,
    date: order.date.toISOString(),
    subtotal: order.subtotal.toNumber(),
    discountPercent: order.discountPercent.toNumber(),
    vatOn: order.vatOn,
    vatAmount: order.vatAmount.toNumber(),
    finalTotal,
    paymentTerms: order.paymentTerms,
    deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString() : null,
    customerNotes: order.customerNotes,
    internalNotes: canSeeInternal ? order.internalNotes : null,
    status: order.status,
    quotationOriginId: order.quotationOrigin?.id ?? null,
    workOrders: order.workOrders.map((w) => ({ id: w.id, workOrderNumber: w.workOrderNumber, productionTrack: w.productionTrack })),
    items: order.items.map((item) => mapOrderItemToDto(item, canSeeInternal)),
    itemDiscountsTotal,
    // FEATURE-006 M3 — computed from `payments` at read time, never
    // stored (same discipline as computeIsDelayed).
    payments,
    paidTotal,
    returnedTotal,
    netTotal,
    remainingBalance: netTotal - paidTotal,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Atomically reserves the next invoice number for a year — a direct copy
 * of `nextQuotationNumber`'s shape (`quotationService.ts`), reusing the
 * same `DocumentSequence` model with `documentType: 'INVOICE'` (reserved
 * since Phase 1; unused until FEATURE-003 M2).
 *
 * FEATURE-007 (2026-08-12, bug fix) — `Order.invoiceNumber` is *globally*
 * unique, not unique-per-branch, but `DocumentSequence` was keyed by the
 * caller's own `branchId`, so two different branches independently
 * counting from 1 would generate the identical number and collide the
 * first time a second real branch ever issued an invoice — invisible
 * until today because the system only ever had one branch. Fixed by
 * always reserving against the *default* branch's sequence row
 * regardless of which branch is actually creating the document — a
 * single shared global counter per year, matching the real DB
 * constraint, with no schema migration and no change to the number
 * *format* for branches that already have invoices.
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const defaultBranch = await tx.branch.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } });
  const year = new Date().getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: { branchId_documentType_year: { branchId: defaultBranch.id, documentType: 'INVOICE', year } },
    create: { branchId: defaultBranch.id, documentType: 'INVOICE', year, prefix: 'CLP-INV', lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

/**
 * The single place an `OrderItem`'s `kind`/`modelName`/`breakdown`/
 * `itemTotal` are assembled from a Quotation-shaped item input — shared by
 * both `convertQuotation` (whose item names come from an already-loaded
 * Quotation's own catalog `include`, and which has no Pricing Engine
 * result yet — see FEATURE-007 PE-E's known gap, `itemTotal` stays null
 * there) and `createOrder` below (whose names come from
 * `resolveItemCatalogNames` and whose `itemTotal`/pricing fields come from
 * `computeItemPricing`), so the two creation paths never grow two
 * different snapshot shapes for the same concept.
 */
export function buildOrderItemCreate(item: {
  itemType: string;
  // Only used to build the ad-hoc fallback `breakdown` shape below when no
  // `breakdownOverride` is supplied (i.e. `convertQuotation`'s call site,
  // which has no Pricing Engine result yet). `createOrder` always supplies
  // `breakdownOverride`, so it never needs to pass these.
  quantity?: number;
  size?: string | null;
  notes?: string | null;
  description?: string | null;
  readyProductId?: string | null;
  readyProductName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  // Owner (2026-08-27, "روول أب... محتاجة مورد وسعر تكلفة خاصين بيها") —
  // mirrors readyProductId/serviceId exactly, see OrderItem.boardsCatalogItemId's schema doc comment.
  boardsCatalogItemId?: string | null;
  boardsCatalogItemName?: string | null;
  // FEATURE-007 PE-E — the frozen pricing-engine result. `breakdownOverride`
  // replaces the ad-hoc snapshot object below entirely when supplied
  // (`createOrder` always supplies it); `convertQuotation` never does yet.
  itemTotal?: number | null;
  breakdownOverride?: Prisma.InputJsonValue;
  // FEATURE-007 M2 — set only by `createOrder` for paper-consuming items
  // that carried a computed sheet count; `convertQuotation` never passes
  // these (in scope for a later milestone).
  sizeFamilyKey?: string | null;
  realSizeLabel?: string | null;
  inventoryItemId?: string | null;
  sheetsConsumed?: number | null;
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — frozen straight
  // through, no ad-hoc breakdown involvement (it's a real OrderItem
  // column, not a `breakdown` field).
  productionTrack?: ProductionTrack | null;
  // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — `groupId` is the
  // already-resolved real `OrderItemGroup` id (the caller maps each item's
  // client-side `groupKey` to a real id before calling this — see
  // `createOrder`/`updateOrder`), never a raw `groupKey` string.
  // `requiredQuantity` is `resolveRequiredQuantity(item.pricing)`'s result,
  // frozen the same way `sheetsConsumed` already is.
  groupId?: string | null;
  requiredQuantity?: number | null;
  // Owner (2026-08-23, "تخفيض على صنف محدد") — frozen straight through,
  // same discipline as every other column here.
  discountAmount?: number;
  // Owner (2026-08-23, "اكتب اسم المورد منين وانا بطلب؟") — frozen
  // straight through; the Workflow Engine reads it once, not this column
  // directly, when an EXTERNAL-type stage instance is first created.
  preferredSupplierId?: string | null;
}): {
  kind: string;
  modelName: string | null;
  breakdown: Prisma.InputJsonValue;
  itemTotal: number | null;
  sizeFamilyKey: string | null;
  realSizeLabel: string | null;
  inventoryItemId: string | null;
  sheetsConsumed: number | null;
  productionTrack: ProductionTrack | null;
  groupId: string | null;
  requiredQuantity: number | null;
  discountAmount: number;
  preferredSupplierId: string | null;
  readyProductId: string | null;
  serviceId: string | null;
  boardsCatalogItemId: string | null;
} {
  return {
    kind: item.itemType,
    modelName: item.readyProductName ?? item.serviceName ?? item.boardsCatalogItemName ?? null,
    itemTotal: item.itemTotal ?? null,
    sizeFamilyKey: item.sizeFamilyKey ?? null,
    realSizeLabel: item.realSizeLabel ?? null,
    inventoryItemId: item.inventoryItemId ?? null,
    sheetsConsumed: item.sheetsConsumed ?? null,
    productionTrack: item.productionTrack ?? null,
    groupId: item.groupId ?? null,
    requiredQuantity: item.requiredQuantity ?? null,
    discountAmount: item.discountAmount ?? 0,
    preferredSupplierId: item.preferredSupplierId ?? null,
    // Owner (2026-08-26, branch-profit reporting) — a real catalog FK now
    // persisted (see OrderItem.readyProductId's own doc comment), not just
    // baked into the ad-hoc breakdown fallback below.
    readyProductId: item.readyProductId ?? null,
    serviceId: item.serviceId ?? null,
    boardsCatalogItemId: item.boardsCatalogItemId ?? null,
    breakdown:
      item.breakdownOverride ??
      {
        itemType: item.itemType,
        quantity: item.quantity ?? null,
        size: item.size ?? null,
        notes: item.notes ?? null,
        description: item.description ?? null,
        readyProductId: item.readyProductId ?? null,
        readyProductName: item.readyProductName ?? null,
        serviceId: item.serviceId ?? null,
        serviceName: item.serviceName ?? null,
      },
  };
}

/**
 * Batch-resolves catalog names for a set of Quotation-shaped item inputs —
 * `createOrder`'s equivalent of the catalog `include` a Quotation's own
 * items already carry at conversion time. One query per catalog, not one
 * per item.
 */
export async function resolveItemCatalogNames(
  items: Array<{ readyProductId?: string; serviceId?: string; boardsCatalogItemId?: string }>,
): Promise<Map<string, string>> {
  const readyProductIds = [...new Set(items.map((i) => i.readyProductId).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((id): id is string => Boolean(id)))];
  const boardsCatalogItemIds = [...new Set(items.map((i) => i.boardsCatalogItemId).filter((id): id is string => Boolean(id)))];

  const [readyProducts, services, boardsCatalogItems] = await Promise.all([
    readyProductIds.length
      ? prisma.readyProduct.findMany({ where: { id: { in: readyProductIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    boardsCatalogItemIds.length
      ? prisma.boardsCatalogItem.findMany({ where: { id: { in: boardsCatalogItemIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const p of readyProducts) names.set(p.id, p.name);
  for (const s of services) names.set(s.id, s.name);
  for (const b of boardsCatalogItems) names.set(b.id, b.name);
  return names;
}

/**
 * Direct Order creation (FEATURE-006 M2, wired to the real Pricing Engine
 * in FEATURE-007 PE-E) — Approved Addition B's "Direct Customer →
 * Order/Invoice Flow." Mirrors `convertQuotation`'s numbering/snapshot
 * shape exactly, but with no source Quotation: `quotationOriginId` stays
 * null (the FK is the reverse side of `Quotation.convertedOrderId`, never
 * set here).
 *
 * `subtotal`/`vatAmount`/`finalTotal` are computed here, never accepted
 * from the caller — every item's price comes from
 * `packages/shared/src/pricing/*` via `computeItemPricing`, matching the
 * owner's explicit PE-E decision to wire the full engine now rather than
 * defer it.
 *
 * `payments` (optional, FEATURE-007 — PRICING_ENGINE_SPEC.md §4's
 * multi-payment array collected at creation time, not just via the
 * separate post-hoc `recordPayment`) are created atomically in the same
 * transaction as the order, mirroring `recordPayment`'s own
 * Payment+TreasuryEntry pairing — never one without the other.
 */
export async function createOrder(
  input: {
    partnerId?: string | null;
    branchId: string;
    staffId: string;
    discountPercent?: number;
    vatOn?: boolean;
    paymentTerms?: string;
    deliveryDate?: string;
    customerNotes?: string;
    internalNotes?: string;
    requiresDesignByTrack?: Record<string, boolean>;
    items: CreateOrderItemInput[];
    payments?: CreatePaymentInput[];
  },
  itemNames: Map<string, string>,
): Promise<{ id: string; branchId: string; partnerId: string | null; invoiceNumber: string; itemCount: number }> {
  assertDeliveryDateNotBeforeOrderDate(input.deliveryDate, new Date());
  assertPartnerPresentUnlessWalkIn(input.partnerId, input.items);

  for (const item of input.items) {
    assertProductionTrackConsistentWithKind(item.pricing.kind, item.productionTrack);
  }

  // Read-only reference data — safe outside the write transaction; the
  // actual order + stock deduction writes below run inside it.
  const ctx = await buildPricingContext(input.items);
  const priced = input.items.map((item) => computeItemPricing(item, ctx));

  // FEATURE-007 — reference-image upload (video's "صورة المنتج" dropzone).
  // Each item's `attachmentId` points at an Attachment already uploaded via
  // POST /api/attachments before the item was added to the cart; resolve
  // the real storage path here (never trust a client-supplied URL string —
  // this gets embedded as an <img> src on the printed Work Order) rather
  // than inventing an OrderItem↔Attachment column.
  const attachmentIds = [...new Set(input.items.map((i) => i.attachmentId).filter((id): id is string => Boolean(id)))];
  const attachmentUrlById = new Map(
    attachmentIds.length
      ? (await prisma.attachment.findMany({ where: { id: { in: attachmentIds } }, select: { id: true, storagePath: true } }))
          .filter((a) => a.storagePath)
          .map((a) => [a.id, getPublicAttachmentUrl(a.storagePath!)] as const)
      : [],
  );

  const itemDiscountAmounts = resolveItemDiscountAmounts(input.items, priced);
  assertItemDiscountsValid(itemDiscountAmounts, priced);
  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const itemDiscountsTotal = sumItemDiscounts(itemDiscountAmounts);
  const discountPercent = input.discountPercent ?? 0;
  // Owner (2026-08-23, "متلغيش التخفيض على الفاتورة كلها طبعاً") — item
  // discounts and the whole-invoice percentage stack: items are
  // discounted first, then the order-level percentage applies on top.
  const afterDiscount = (subtotal - itemDiscountsTotal) * (1 - discountPercent / 100);
  const vatOn = input.vatOn ?? false;
  const vatAmount = vatOn ? afterDiscount * (ctx.vatRate / 100) : 0;
  // Owner, 2026-08-12: "عايزة يقرب رقم الفاتورة دايماً لأقرب رقم صحيح أعلى" —
  // only the final charged amount rounds up; subtotal/vatAmount stay precise.
  const finalTotal = Math.ceil(afterDiscount + vatAmount);

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx);
    const created = await tx.order.create({
      data: {
        invoiceNumber,
        branchId: input.branchId,
        partnerId: input.partnerId ?? null,
        staffId: input.staffId,
        subtotal,
        discountPercent,
        vatOn,
        vatAmount,
        finalTotal,
        paymentTerms: input.paymentTerms ?? null,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        customerNotes: input.customerNotes ?? null,
        internalNotes: input.internalNotes ?? null,
        status: 'CONFIRMED',
        // quotationOriginId is intentionally never set here — this is the
        // reverse relation from Quotation.convertedOrderId; a directly
        // created Order simply has no Quotation pointing at it.
      },
      select: { id: true, branchId: true, partnerId: true, invoiceNumber: true },
    });

    // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — resolve each item's
    // client-side `groupKey` to a real `OrderItemGroup` id before creating
    // any item, so `buildOrderItemCreate` below can set the real column.
    const groupKeyToId = await resolveOrderItemGroups(tx, created.id, input.items);

    // Multi-material pricing (2026-08-17) — items are created one at a time
    // (not via a single nested `items: { create: [...] }`) so each item's
    // real id is known immediately, letting its `OrderItemMaterial` rows
    // (when `result.materials` is populated) be linked correctly. A bulk
    // nested create gives back no per-item ids to correlate against
    // `priced[index]`, which the old single-material path never needed.
    const createdItemRows: { id: string; productionTrack: ProductionTrack | null }[] = [];
    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index]!;
      const result = priced[index]!;
      const createdItem = await tx.orderItem.create({
        data: {
          orderId: created.id,
          ...buildOrderItemCreate({
            itemType: item.itemType,
            notes: item.notes,
            description: item.description,
            readyProductId: item.readyProductId,
            readyProductName: item.readyProductId ? (itemNames.get(item.readyProductId) ?? null) : null,
            serviceId: item.serviceId,
            serviceName: item.serviceId ? (itemNames.get(item.serviceId) ?? null) : null,
            boardsCatalogItemId: item.boardsCatalogItemId,
            boardsCatalogItemName: item.boardsCatalogItemId ? (itemNames.get(item.boardsCatalogItemId) ?? null) : null,
            itemTotal: result.total,
            groupId: item.groupKey ? (groupKeyToId.get(item.groupKey) ?? null) : null,
            requiredQuantity: resolveRequiredQuantity(item.pricing),
            discountAmount: itemDiscountAmounts[index],
            preferredSupplierId: item.preferredSupplierId,
            // `computeItemPricing`'s breakdown is pricing-only — it has
            // no access to `notes` (not part of `PricingLineItem`). Merge
            // it in here, the one place both the frozen pricing result
            // and the caller's free-text note are both in scope, or it's
            // silently lost: `buildOrderItemCreate`'s own `notes` param
            // only feeds its ad-hoc fallback shape, which this
            // `breakdownOverride` always bypasses.
            breakdownOverride: {
              ...(result.breakdown as Record<string, unknown>),
              notes: item.notes ?? null,
              // ERP-navigation research (2026-08-16, "نطاق العمل" for
              // SERVICE items) — was accepted by the schema but silently
              // dropped here before now: `buildOrderItemCreate`'s own
              // `description` param only feeds its ad-hoc fallback shape,
              // which this `breakdownOverride` always bypasses, same as
              // `notes` above.
              description: item.description ?? null,
              referenceImageUrl: item.attachmentId ? (attachmentUrlById.get(item.attachmentId) ?? null) : null,
              // FEATURE-009 (2026-08-13) — printed on the Offset Work
              // Order job-card only, no pricing effect.
              inkColor: item.inkColor ?? null,
              bindingType: item.bindingType ?? null,
              sellophaneType: item.sellophaneType ?? null,
            },
            sizeFamilyKey: result.sizeFamilyKey,
            realSizeLabel: result.realSizeLabel,
            inventoryItemId: result.inventoryItemId,
            sheetsConsumed: result.sheetsNeeded,
            productionTrack: item.productionTrack,
          }),
        },
        select: { id: true, productionTrack: true },
      });

      if (result.materials?.length) {
        await tx.orderItemMaterial.createMany({
          data: result.materials.map((m, materialIndex) => ({
            orderItemId: createdItem.id,
            role: m.role,
            sortOrder: materialIndex,
            inventoryItemId: m.inventoryItemId,
            paperName: m.paperName ?? '',
            sheetPrice: m.sheetPrice,
            sheetsConsumed: m.sheetsNeeded,
          })),
        });
      }

      createdItemRows.push(createdItem);
    }

    // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "لما اعمل
    // فاتورة دايركت يدخل في عملية التشغيل") — best-effort, never blocks
    // order creation: one Work Order per distinct track actually present
    // among this order's items; items whose track has no published
    // template yet simply stay unlinked (see `tryAutoCreateWorkOrders`'s
    // own doc comment).
    await tryAutoCreateWorkOrders(tx, { id: created.id, branchId: created.branchId }, createdItemRows, input.requiresDesignByTrack, input.staffId);

    // Link each uploaded Attachment to this Order now that it exists —
    // mirrors the Payment+TreasuryEntry atomicity below, same transaction.
    if (attachmentIds.length) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { orderId: created.id } });
    }

    // FEATURE-007 M2 — auto-deduct stock in the same transaction as the
    // order, mirroring the Payment+Treasury atomicity pattern. Locked
    // decision: never blocks order creation, even if this drives
    // `quantityOnHand` negative — see inventoryService's own doc comment.
    // Multi-material pricing (2026-08-17) — `materialsToDeduct` returns
    // every (material, quantity) pair to deduct for the item, one call per
    // pair; for every non-NOTEBOOK/DIGITAL kind this is still exactly the
    // single old pair, unchanged.
    for (const result of priced) {
      for (const m of materialsToDeduct(result)) {
        await deductStockForOrderItem(tx, m.inventoryItemId, input.branchId, m.sheetsNeeded);
      }
    }

    // FEATURE-007 — multi-payment collection at creation time
    // (PRICING_ENGINE_SPEC.md §4). Each payment gets its own atomically
    // paired TreasuryEntry, same shape as `recordPayment` below. Daily
    // closure (2026-08-18) — one guard check covers the whole loop since
    // every payment here shares the same branch+today's date.
    if ((input.payments?.length ?? 0) > 0) {
      await assertBranchDayNotClosed(input.branchId, new Date(), tx);
    }
    for (const payment of input.payments ?? []) {
      const createdPayment = await tx.payment.create({
        data: { orderId: created.id, method: payment.method, amount: payment.amount },
      });
      await tx.treasuryEntry.create({
        data: {
          type: 'INCOME',
          amount: payment.amount,
          method: payment.method,
          category: 'دفعة فاتورة',
          note: `دفعة على الفاتورة ${created.invoiceNumber}`,
          date: new Date(),
          sourceType: 'INVOICE_PAYMENT',
          orderId: created.id,
          paymentId: createdPayment.id,
          partnerId: input.partnerId,
          staffId: input.staffId,
          branchId: input.branchId,
        },
      });
    }

    return { ...created, itemCount: input.items.length };
  });
}

export class OrderNotFoundError extends Error {
  constructor() {
    super('Order not found');
    this.name = 'OrderNotFoundError';
  }
}

export class DeliveryDateBeforeOrderDateError extends Error {
  constructor() {
    super('تاريخ الاستلام لا يمكن أن يكون قبل تاريخ المعاملة');
    this.name = 'DeliveryDateBeforeOrderDateError';
  }
}

// Owner, 2026-08-13: "مينفعش تاريخ الإستلام يكون قبل تاريخ المعامله" —
// compares calendar days only (both `deliveryDate` and `Order.date` are
// stored as UTC-midnight-anchored `Date`s, so truncating `orderDate` to
// its UTC calendar day keeps the comparison consistent with how
// `deliveryDate` itself gets parsed from the "YYYY-MM-DD" input string).
function assertDeliveryDateNotBeforeOrderDate(deliveryDate: string | null | undefined, orderDate: Date): void {
  if (!deliveryDate) return;
  const delivery = new Date(deliveryDate);
  const orderDateOnly = Date.UTC(orderDate.getUTCFullYear(), orderDate.getUTCMonth(), orderDate.getUTCDate());
  if (delivery.getTime() < orderDateOnly) {
    throw new DeliveryDateBeforeOrderDateError();
  }
}

export class OrderHasPaymentsError extends Error {
  constructor() {
    super('لا يمكن حذف فاتورة عليها دفعات مسجلة — احذف الدفعات أولاً من الخزينة');
    this.name = 'OrderHasPaymentsError';
  }
}

export class OrderHasWorkOrderError extends Error {
  constructor() {
    super('لا يمكن حذف فاتورة لها أمر شغل قائم — احذف أو ألغِ أمر الشغل أولاً');
    this.name = 'OrderHasWorkOrderError';
  }
}

/**
 * FEATURE-007 — full item replacement (owner, 2026-08-12: "استبدال كامل
 * للأصناف"). Mirrors `createOrder`'s pricing/attachment logic exactly,
 * plus the extra step every edit needs: reverse the old items' stock
 * consumption before deleting them, then deduct fresh for the new set —
 * never leaves a stale `StockLevel` behind from the items being replaced.
 * Existing `Payment` rows are untouched; `paidTotal`/`remainingBalance`
 * simply recompute at read time against the new `finalTotal`.
 */
export async function updateOrder(
  orderId: string,
  input: {
    discountPercent?: number;
    vatOn?: boolean;
    paymentTerms?: string | null;
    deliveryDate?: string | null;
    customerNotes?: string | null;
    internalNotes?: string | null;
    requiresDesignByTrack?: Record<string, boolean>;
    items: CreateOrderItemInput[];
  },
  itemNames: Map<string, string>,
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — the staff performing
  // *this* edit, not the order's original creator (`existing.staffId`,
  // which this function previously had no other identity to fall back on
  // for the new Work Order reconciliation's `deletedBy`/`performedById`).
  performedById: string,
): Promise<{ id: string; invoiceNumber: string; branchId: string; partnerId: string | null }> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      // Multi-material pricing (2026-08-17) — `materials` needed for the
      // restock-on-edit loop below (`materialsToRestock`).
      items: { include: { materials: true } },
      // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — needed to
      // reconcile Work Orders per track after the item set changes (see
      // the reconciliation block below): which tracks already have an
      // active Work Order, and each one's WorkflowInstance/StageInstances
      // in case that track's items disappear entirely and it needs
      // soft-deleting via `softDeleteWorkOrderTx`.
      workOrders: { where: { isDeleted: false }, include: { workflowInstance: { include: { stageInstances: true } } } },
    },
  });
  if (!existing || existing.isDeleted) {
    throw new OrderNotFoundError();
  }

  assertDeliveryDateNotBeforeOrderDate(
    input.deliveryDate !== undefined ? input.deliveryDate : existing.deliveryDate?.toISOString(),
    existing.date,
  );

  for (const item of input.items) {
    assertProductionTrackConsistentWithKind(item.pricing.kind, item.productionTrack);
  }

  const ctx = await buildPricingContext(input.items);
  const priced = input.items.map((item) => computeItemPricing(item, ctx));

  const attachmentIds = [...new Set(input.items.map((i) => i.attachmentId).filter((id): id is string => Boolean(id)))];
  const attachmentUrlById = new Map(
    attachmentIds.length
      ? (await prisma.attachment.findMany({ where: { id: { in: attachmentIds } }, select: { id: true, storagePath: true } }))
          .filter((a) => a.storagePath)
          .map((a) => [a.id, getPublicAttachmentUrl(a.storagePath!)] as const)
      : [],
  );

  const itemDiscountAmounts = resolveItemDiscountAmounts(input.items, priced);
  assertItemDiscountsValid(itemDiscountAmounts, priced);
  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const itemDiscountsTotal = sumItemDiscounts(itemDiscountAmounts);
  const discountPercent = input.discountPercent ?? existing.discountPercent.toNumber();
  const afterDiscount = (subtotal - itemDiscountsTotal) * (1 - discountPercent / 100);
  const vatOn = input.vatOn ?? existing.vatOn;
  const vatAmount = vatOn ? afterDiscount * (ctx.vatRate / 100) : 0;
  // Owner, 2026-08-12: "عايزة يقرب رقم الفاتورة دايماً لأقرب رقم صحيح أعلى" —
  // only the final charged amount rounds up; subtotal/vatAmount stay precise.
  const finalTotal = Math.ceil(afterDiscount + vatAmount);

  await prisma.$transaction(async (tx) => {
    // Reverse the old items' stock consumption before removing them —
    // "يرجع للمخزن تلقائيًا" (owner, 2026-08-12). Multi-material pricing
    // (2026-08-17) — `materialsToRestock` restocks every material row an
    // old NOTEBOOK/DIGITAL item had, not just a single pair.
    for (const oldItem of existing.items) {
      for (const m of materialsToRestock(oldItem)) {
        await restockForOrderItem(tx, m.inventoryItemId, existing.branchId, m.sheetsNeeded);
      }
    }
    // `OrderItemMaterial` rows cascade-delete with their parent `OrderItem`
    // (schema's `onDelete: Cascade`) — no separate cleanup needed here.
    await tx.orderItem.deleteMany({ where: { orderId } });
    // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — old `OrderItemGroup`
    // rows don't cascade away with their items (only Order deletion cascades
    // to groups); clear them explicitly so a full item-replacement edit
    // doesn't accumulate orphaned groups. `resolveOrderItemGroups` below
    // creates fresh ones for whatever `groupKey`s the new item set uses.
    await tx.orderItemGroup.deleteMany({ where: { orderId } });

    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        discountPercent,
        vatOn,
        vatAmount,
        finalTotal,
        paymentTerms: input.paymentTerms !== undefined ? input.paymentTerms : existing.paymentTerms,
        deliveryDate:
          input.deliveryDate !== undefined
            ? input.deliveryDate
              ? new Date(input.deliveryDate)
              : null
            : existing.deliveryDate,
        customerNotes: input.customerNotes !== undefined ? input.customerNotes : existing.customerNotes,
        internalNotes: input.internalNotes !== undefined ? input.internalNotes : existing.internalNotes,
      },
    });

    // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — same group
    // resolution `createOrder` does; the old groups were just cleared above.
    const groupKeyToId = await resolveOrderItemGroups(tx, orderId, input.items);

    // Multi-material pricing (2026-08-17) — items created one at a time
    // (not a nested bulk `items: { create: [...] }`), same reasoning as
    // `createOrder`: each item's real id must be known immediately to link
    // its own `OrderItemMaterial` rows correctly.
    const newItemRows: { id: string; productionTrack: ProductionTrack | null }[] = [];
    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index]!;
      const result = priced[index]!;
      const createdItem = await tx.orderItem.create({
        data: {
          orderId,
          ...buildOrderItemCreate({
            itemType: item.itemType,
            notes: item.notes,
            description: item.description,
            readyProductId: item.readyProductId,
            readyProductName: item.readyProductId ? (itemNames.get(item.readyProductId) ?? null) : null,
            serviceId: item.serviceId,
            serviceName: item.serviceId ? (itemNames.get(item.serviceId) ?? null) : null,
            boardsCatalogItemId: item.boardsCatalogItemId,
            boardsCatalogItemName: item.boardsCatalogItemId ? (itemNames.get(item.boardsCatalogItemId) ?? null) : null,
            itemTotal: result.total,
            groupId: item.groupKey ? (groupKeyToId.get(item.groupKey) ?? null) : null,
            requiredQuantity: resolveRequiredQuantity(item.pricing),
            discountAmount: itemDiscountAmounts[index],
            preferredSupplierId: item.preferredSupplierId,
            breakdownOverride: {
              ...(result.breakdown as Record<string, unknown>),
              notes: item.notes ?? null,
              // ERP-navigation research (2026-08-16, "نطاق العمل" for
              // SERVICE items) — was accepted by the schema but silently
              // dropped here before now: `buildOrderItemCreate`'s own
              // `description` param only feeds its ad-hoc fallback shape,
              // which this `breakdownOverride` always bypasses, same as
              // `notes` above.
              description: item.description ?? null,
              referenceImageUrl: item.attachmentId ? (attachmentUrlById.get(item.attachmentId) ?? null) : null,
              inkColor: item.inkColor ?? null,
              bindingType: item.bindingType ?? null,
              sellophaneType: item.sellophaneType ?? null,
            },
            sizeFamilyKey: result.sizeFamilyKey,
            realSizeLabel: result.realSizeLabel,
            inventoryItemId: result.inventoryItemId,
            sheetsConsumed: result.sheetsNeeded,
            productionTrack: item.productionTrack,
          }),
        },
        select: { id: true, productionTrack: true },
      });

      if (result.materials?.length) {
        await tx.orderItemMaterial.createMany({
          data: result.materials.map((m, materialIndex) => ({
            orderItemId: createdItem.id,
            role: m.role,
            sortOrder: materialIndex,
            inventoryItemId: m.inventoryItemId,
            paperName: m.paperName ?? '',
            sheetPrice: m.sheetPrice,
            sheetsConsumed: m.sheetsNeeded,
          })),
        });
      }

      newItemRows.push(createdItem);
    }

    if (attachmentIds.length) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { orderId } });
    }

    // Multi-material pricing (2026-08-17) — same shared helper `createOrder`
    // uses; deducts every material pair for the freshly-created items.
    for (const result of priced) {
      for (const m of materialsToDeduct(result)) {
        await deductStockForOrderItem(tx, m.inventoryItemId, existing.branchId, m.sheetsNeeded);
      }
    }

    // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — reconcile Work
    // Orders against the new item set. `updateOrder` never touched Work
    // Orders at all before this change (a pre-existing gap, not a
    // regression) — now it has to, since a track can be added or removed
    // entirely by an edit. Three cases per track:
    //   1. Existed before AND still has items → keep the same WorkOrder
    //      (its WorkflowInstance/stage progress is untouched), just
    //      re-link the freshly-recreated items to it.
    //   2. Existed before, has zero items now → soft-delete it, same as
    //      the manual "حذف أمر الشغل" flow.
    //   3. Didn't exist before, has items now → create it fresh.
    const newItemIdsByTrack = new Map<ProductionTrack, string[]>();
    for (const item of newItemRows) {
      if (!item.productionTrack) continue;
      const list = newItemIdsByTrack.get(item.productionTrack) ?? [];
      list.push(item.id);
      newItemIdsByTrack.set(item.productionTrack, list);
    }

    const existingWorkOrderByTrack = new Map(existing.workOrders.map((wo) => [wo.productionTrack, wo]));

    for (const workOrder of existing.workOrders) {
      if (!newItemIdsByTrack.has(workOrder.productionTrack)) {
        await softDeleteWorkOrderTx(tx, workOrder.id, workOrder.workflowInstance, performedById);
      }
    }

    for (const [track, itemIds] of newItemIdsByTrack) {
      const existingWorkOrder = existingWorkOrderByTrack.get(track);
      if (existingWorkOrder) {
        await tx.orderItem.updateMany({ where: { id: { in: itemIds } }, data: { workOrderId: existingWorkOrder.id } });
      } else {
        await createWorkOrderForTrack(tx, {
          orderId,
          branchId: existing.branchId,
          track,
          itemIds,
          requiresDesign: input.requiresDesignByTrack?.[track] ?? true,
          performedById,
        });
      }
    }
  });

  return { id: orderId, invoiceNumber: existing.invoiceNumber, branchId: existing.branchId, partnerId: existing.partnerId };
}

/**
 * Owner (2026-08-20, "فاتورة كانت معمولة عند نادي المهندسين... محتاج
 * اعدلها واخليها بدون عميل") — the first request was a one-off manual DB
 * correction; this is the real UI path for it going forward. Deliberately
 * separate from `updateOrder` (which replaces the whole item set) — this
 * only ever changes which customer (if any) the invoice is attributed to.
 * Same walk-in rule as creation: `null` only accepted when every existing
 * item is INVENTORY_RETAIL/MANUAL.
 */
export async function setOrderPartner(orderId: string, partnerId: string | null): Promise<{ id: string; branchId: string; partnerId: string | null; invoiceNumber: string }> {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!existing || existing.isDeleted) throw new OrderNotFoundError();

  assertPartnerPresentUnlessWalkIn(
    partnerId,
    existing.items.map((item) => ({ pricing: { kind: (item.breakdown as { kind?: string } | null)?.kind ?? '' } })),
  );

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { partnerId },
    select: { id: true, branchId: true, partnerId: true, invoiceNumber: true },
  });
  return updated;
}

/**
 * Owner (2026-08-23, "لازم اقدر اغير الفرع... صلاحيات كاملة") — a
 * correction tool, same shape as `setOrderPartner` above: only changes
 * which branch this invoice is attributed to. Deliberately does NOT touch
 * `OrderItem`/`WorkOrder`/`StockMovement`/`TreasuryEntry` rows already
 * created against the old branch — those stay exactly as they are (this
 * is a bookkeeping correction, not a physical transfer of stock/
 * production between branches).
 */
export async function setOrderBranch(orderId: string, branchId: string): Promise<{ id: string; branchId: string; partnerId: string | null; invoiceNumber: string }> {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { isDeleted: true } });
  if (!existing || existing.isDeleted) throw new OrderNotFoundError();

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { branchId },
    select: { id: true, branchId: true, partnerId: true, invoiceNumber: true },
  });
  return updated;
}

export class OrderItemNotFoundError extends Error {
  constructor() {
    super('Order item not found');
    this.name = 'OrderItemNotFoundError';
  }
}

/**
 * The item doesn't belong to the Work Order the caller is operating
 * from — same "scope the mutation to what the URL actually names" defense
 * `deleteWorkOrder`/`advanceWorkflowInstance` already apply elsewhere,
 * not a generic 404 (the item exists, just not under this job).
 */
export class OrderItemNotInWorkOrderError extends Error {
  constructor() {
    super('This item does not belong to the given work order');
    this.name = 'OrderItemNotInWorkOrderError';
  }
}

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19, owner: "أقدر أعرف A4
 * خلصت والA5 لسه") — the one mutation path for an OrderItem's own
 * production progress, independent of the shared WorkOrder/WorkflowInstance
 * stage this item's job is in (see `OrderItemProductionStatus`'s own doc
 * comment). `status`, when the caller omits it, is derived from
 * `producedQuantity` vs. the item's frozen `requiredQuantity` — WAITING at
 * 0, DONE once produced reaches/exceeds required, IN_PROGRESS otherwise
 * (including when `requiredQuantity` is null, i.e. unknown: any progress
 * at all counts as IN_PROGRESS since "done" can't be determined).
 */
export async function updateOrderItemProduction(
  workOrderId: string,
  orderItemId: string,
  input: { producedQuantity?: number; status?: OrderItem['productionStatus'] },
  updatedById: string,
): Promise<OrderItem> {
  const existing = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { materials: true } });
  if (!existing) throw new OrderItemNotFoundError();
  if (existing.workOrderId !== workOrderId) throw new OrderItemNotInWorkOrderError();

  const producedQuantity = input.producedQuantity ?? existing.producedQuantity;
  const status =
    input.status ??
    (producedQuantity <= 0
      ? 'WAITING'
      : existing.requiredQuantity !== null && producedQuantity >= existing.requiredQuantity
        ? 'DONE'
        : 'IN_PROGRESS');

  const updated = await prisma.orderItem.update({
    where: { id: orderItemId },
    data: {
      producedQuantity,
      productionStatus: status,
      productionUpdatedAt: new Date(),
      productionUpdatedById: updatedById,
    },
    include: { materials: true, returns: true },
  });
  // Reached only via `work-orders.edit` (route-level gate, see workOrders.ts) — same bar `canSeeInternal` already enforces elsewhere, so it's trivially satisfied here.
  return mapOrderItemToDto(updated, true);
}

/**
 * Soft delete (same discipline as Quotation/Attachment/...), guarded by
 * two owner decisions (2026-08-12): blocked entirely if any `Payment`
 * exists ("ممنوع لو فيه دفعات" — the staff must reverse those from
 * Treasury first), and — a related, unasked-but-same-category guard —
 * blocked if a `WorkOrder` already exists for it, since a soft-deleted
 * Order would 404 out from under an in-progress production job. Restocks
 * every item's consumed sheets, same as `updateOrder`.
 */
export async function deleteOrder(
  orderId: string,
  deletedBy: string,
): Promise<{ branchId: string; partnerId: string | null }> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    // Multi-material pricing (2026-08-17) — `materials` needed for the
    // restock loop below (`materialsToRestock`).
    include: { items: { include: { materials: true } }, payments: { where: { isDeleted: false } }, workOrders: true },
  });
  if (!existing || existing.isDeleted) {
    throw new OrderNotFoundError();
  }
  if (existing.payments.length > 0) {
    throw new OrderHasPaymentsError();
  }
  // FEATURE-012 (2026-08-14) — a soft-deleted WorkOrder (deleted via the
  // "حذف أمر الشغل" flow) must not keep blocking its parent invoice from
  // being deleted — same isDeleted check as ORDER_INCLUDE's workOrders.
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — pluralized: any
  // active Work Order (of any track) still blocks the whole Order's delete.
  if (existing.workOrders.some((wo) => !wo.isDeleted)) {
    throw new OrderHasWorkOrderError();
  }

  await prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      for (const m of materialsToRestock(item)) {
        await restockForOrderItem(tx, m.inventoryItemId, existing.branchId, m.sheetsNeeded);
      }
    }
    await tx.order.update({
      where: { id: orderId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });
  });

  return { branchId: existing.branchId, partnerId: existing.partnerId };
}

/**
 * Records a payment against an Order and its matching Treasury entry in
 * one transaction (FEATURE-006 M3, "Payments + Treasury" — never allow a
 * payment saved without a Treasury entry or vice versa). `sourceType:
 * 'INVOICE_PAYMENT'` was reserved on `TreasuryEntry` since Phase 1,
 * unused until now. No Quotation involvement anywhere in this path —
 * deposits/remaining-balance work identically for a direct Order (M2)
 * and a Quotation-converted one.
 */
export async function recordPayment(
  orderId: string,
  input: CreatePaymentInput,
  staffId: string,
): Promise<{ order: OrderRecord; paymentId: string }> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.isDeleted) {
      throw new OrderNotFoundError();
    }
    await assertBranchDayNotClosed(order.branchId, new Date(), tx);

    const payment = await tx.payment.create({
      data: { orderId: order.id, method: input.method, amount: input.amount },
    });

    await tx.treasuryEntry.create({
      data: {
        type: 'INCOME',
        amount: input.amount,
        method: input.method,
        category: 'دفعة فاتورة',
        note: `دفعة على الفاتورة ${order.invoiceNumber}`,
        date: new Date(),
        sourceType: 'INVOICE_PAYMENT',
        orderId: order.id,
        paymentId: payment.id,
        partnerId: order.partnerId,
        staffId,
        branchId: order.branchId,
      },
    });

    const fullOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
    return { order: fullOrder, paymentId: payment.id };
  });
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super('Payment not found');
    this.name = 'PaymentNotFoundError';
  }
}

/**
 * Owner (2026-08-20, "تعديل المدفوع... تعديل أي دفعة سابقة") — a Payment
 * was purely additive until now. Updates the Payment row and its linked
 * TreasuryEntry to the same new amount/method atomically (never one
 * without the other — same discipline `recordPayment` above already
 * follows for creation), auto-reopening the day if the original payment
 * landed on one already closed (`reopenDayIfClosed` — never blocks the
 * correction, just makes it visible).
 */
export async function updatePayment(
  orderId: string,
  paymentId: string,
  input: UpdatePaymentInput,
  staffId: string,
): Promise<{ order: OrderRecord; previous: Payment }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.isDeleted || payment.orderId !== orderId) {
      throw new PaymentNotFoundError();
    }
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.isDeleted) {
      throw new OrderNotFoundError();
    }
    const previous = mapPaymentToDto(payment);

    const newAmount = input.amount ?? payment.amount.toNumber();
    const newMethod = input.method ?? payment.method;

    await tx.payment.update({ where: { id: paymentId }, data: { amount: newAmount, method: newMethod } });
    await tx.treasuryEntry.updateMany({
      where: { paymentId },
      data: { amount: newAmount, method: newMethod },
    });

    await reopenDayIfClosed(order.branchId, payment.createdAt, staffId, `تعديل دفعة على الفاتورة ${order.invoiceNumber}`, tx);

    const fullOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order: fullOrder, previous };
  });
}

/**
 * Soft-delete (rule 19) — reverses the payment the same way voiding it
 * should: the Payment row and its linked TreasuryEntry are both
 * soft-deleted together, never one without the other, so `paidTotal`/
 * `remainingBalance` (computed from `ORDER_INCLUDE`'s now-filtered
 * `payments`) and the treasury ledger agree immediately.
 */
export async function deletePayment(
  orderId: string,
  paymentId: string,
  staffId: string,
): Promise<{ order: OrderRecord; previous: Payment }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.isDeleted || payment.orderId !== orderId) {
      throw new PaymentNotFoundError();
    }
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.isDeleted) {
      throw new OrderNotFoundError();
    }
    const previous = mapPaymentToDto(payment);

    await tx.payment.update({ where: { id: paymentId }, data: { isDeleted: true, deletedAt: new Date(), deletedBy: staffId } });
    await tx.treasuryEntry.updateMany({
      where: { paymentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: staffId },
    });

    await reopenDayIfClosed(order.branchId, payment.createdAt, staffId, `حذف دفعة على الفاتورة ${order.invoiceNumber}`, tx);

    const fullOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order: fullOrder, previous };
  });
}

/** Thrown for a return that fails a business-rule check (wrong item kind, quantity exceeds what's returnable) — 400, not 404/500. */
export class ReturnNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReturnNotAllowedError';
  }
}

/**
 * Owner (2026-08-23, "مرتجعات: بضاعة من المخزون فقط... يقدر يحدّد الكمية
 * المرتجعة") — scoped to `INVENTORY_RETAIL` items only (checked via the
 * frozen `breakdown.kind`, confirmed live to be the same top-level field
 * `deductStockForOrderItem` already reads via `materialsToDeduct`), and
 * supports partial-quantity returns: a single item can be returned across
 * several calls, capped at `sheetsConsumed` minus everything already
 * returned. Restocks inventory, refunds cash from the drawer (owner,
 * "كاش في الدرج دائمًا" — always CASH regardless of the original payment
 * method), and auto-reopens the branch's treasury day if it was already
 * closed (owner, "يفتح اليوم المقفول تلقائيًا") — same `reopenDayIfClosed`
 * helper `updatePayment`/`deletePayment` already use. Never mutates
 * `Order.finalTotal`/`OrderItem.itemTotal` (rule 9 — frozen history);
 * `returnedTotal`/`netTotal` are computed at read time by `mapOrderToDto`.
 */
export async function createReturn(
  orderId: string,
  orderItemId: string,
  input: CreateOrderItemReturnInput,
  staffId: string,
): Promise<{ order: OrderRecord; created: OrderItemReturn }> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.isDeleted) {
      throw new OrderNotFoundError();
    }
    const item = await tx.orderItem.findUnique({ where: { id: orderItemId }, include: { returns: true } });
    if (!item || item.orderId !== orderId) {
      throw new OrderItemNotFoundError();
    }

    const breakdown = item.breakdown as { kind?: string; unitPrice?: number } | null;
    if (breakdown?.kind !== 'INVENTORY_RETAIL' || !item.inventoryItemId || !item.sheetsConsumed) {
      throw new ReturnNotAllowedError('Only sold inventory items (INVENTORY_RETAIL) can be returned');
    }

    const soldQuantity = item.sheetsConsumed.toNumber();
    const alreadyReturned = item.returns.reduce((sum, r) => sum + r.quantity.toNumber(), 0);
    const returnable = soldQuantity - alreadyReturned;
    if (input.quantity > returnable) {
      throw new ReturnNotAllowedError(`Requested quantity (${input.quantity}) exceeds returnable quantity (${returnable})`);
    }

    const unitPrice =
      typeof breakdown.unitPrice === 'number' ? breakdown.unitPrice : (item.itemTotal?.toNumber() ?? 0) / soldQuantity;
    const refundAmount = Math.round(unitPrice * input.quantity * 100) / 100;

    await restockForOrderItem(tx, item.inventoryItemId, order.branchId, input.quantity, `مرتجع فاتورة ${order.invoiceNumber}`);

    const created = await tx.orderItemReturn.create({
      data: {
        orderItemId: item.id,
        quantity: input.quantity,
        refundAmount,
        reason: input.reason,
        recordedById: staffId,
        branchId: order.branchId,
      },
    });

    await tx.treasuryEntry.create({
      data: {
        type: 'EXPENSE',
        amount: refundAmount,
        method: 'CASH',
        category: 'مرتجع',
        note: `مرتجع على الفاتورة ${order.invoiceNumber}`,
        date: new Date(),
        sourceType: 'RETURN',
        orderId: order.id,
        orderItemReturnId: created.id,
        partnerId: order.partnerId,
        staffId,
        branchId: order.branchId,
      },
    });

    await reopenDayIfClosed(order.branchId, new Date(), staffId, `مرتجع على الفاتورة ${order.invoiceNumber}`, tx);

    const fullOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order: fullOrder, created: mapOrderItemReturnToDto(created) };
  });
}

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 2.1 ("مفيش أي Widget مالي/تجاري لصاحب
 * المشروع") — no aggregate sales-total query existed anywhere in the
 * codebase before this (confirmed by search); `finalTotal` is only ever
 * summed per-order today. Every `Order` doubles as its own invoice
 * (`invoiceNumber` is assigned at creation, `createOrder` always starts a
 * new order at `status: 'CONFIRMED'`), so the only real-world exclusion is
 * `CANCELLED` — same `isDeleted`/`date`-ordering convention `listOrders`
 * already uses, not `createdAt`, to match how orders are dated everywhere
 * else in the app. "This week" is a rolling 7 days (today inclusive)
 * rather than a calendar week, to sidestep a Saturday-vs-Monday
 * week-start decision nobody has actually made for this business.
 */
export async function getSalesSummary(): Promise<SalesSummary> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const baseWhere = { isDeleted: false, status: { not: 'CANCELLED' as const } };
  const [today, week, unpaidCandidates] = await Promise.all([
    prisma.order.aggregate({
      where: { ...baseWhere, date: { gte: startOfToday } },
      _sum: { finalTotal: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { ...baseWhere, date: { gte: startOfWeek } },
      _sum: { finalTotal: true },
      _count: true,
    }),
    // Owner (2026-08-20, "المفروض يبانلي انا ليا كام مستحقات عند الناس") —
    // `remainingBalance` isn't stored (computed at read time everywhere
    // else, same discipline), so summing it requires pulling each order's
    // own total + its payments and computing per-row, same math
    // `mapOrderToDto` already uses.
    prisma.order.findMany({
      where: baseWhere,
      select: {
        finalTotal: true,
        payments: { where: { isDeleted: false }, select: { amount: true } },
        // Owner (2026-08-23, "مرتجعات") — subtract returned amounts so a
        // fully-returned invoice doesn't still count toward receivables.
        items: { select: { returns: { select: { refundAmount: true } } } },
      },
    }),
  ]);

  let receivablesTotal = 0;
  let receivablesCount = 0;
  for (const order of unpaidCandidates) {
    const paid = order.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const returned = order.items.reduce(
      (sum, item) => sum + item.returns.reduce((s, r) => s + r.refundAmount.toNumber(), 0),
      0,
    );
    const remaining = order.finalTotal.toNumber() - returned - paid;
    if (remaining > 0) {
      receivablesTotal += remaining;
      receivablesCount += 1;
    }
  }

  return {
    todayTotal: today._sum.finalTotal?.toNumber() ?? 0,
    todayCount: today._count,
    weekTotal: week._sum.finalTotal?.toNumber() ?? 0,
    weekCount: week._count,
    receivablesTotal,
    receivablesCount,
  };
}
