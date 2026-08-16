import type { Prisma } from '../generated/prisma/client.js';
import type { CreateOrderItemInput, CreatePaymentInput, Order, OrderItem, Payment, ProductionTrack } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { deductStockForOrderItem, restockForOrderItem } from './inventoryService.js';
import { buildPricingContext, computeItemPricing, type ItemPricingResult } from './pricingEngineService.js';
import { getPublicAttachmentUrl } from './attachmentService.js';
import { createWorkOrderForTrack, softDeleteWorkOrderTx, tryAutoCreateWorkOrders } from './workOrderService.js';

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

const UNAMBIGUOUS_TRACK_BY_KIND: Partial<Record<string, ProductionTrack>> = {
  LOOSE_PAPER: 'OFFSET',
  NOTEBOOK: 'OFFSET',
  FOLDER: 'OFFSET',
  ENVELOPE: 'OFFSET',
  DIGITAL: 'DIGITAL',
  BOARDS: 'BOARDS_SIGNAGE',
  SERVICE: 'SERVICES',
  INVENTORY_RETAIL: undefined, // must resolve to no track at all
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
  items: { include: { materials: { orderBy: { sortOrder: 'asc' } } } },
  quotationOrigin: { select: { id: true } },
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was a to-one
  // `workOrder` select; now a filtered list (Prisma supports `where` on a
  // to-many include, unlike the old to-one relation) — only non-deleted
  // Work Orders, one per resolved track actually present among the
  // order's items.
  workOrders: { where: { isDeleted: false }, select: { id: true, workOrderNumber: true, productionTrack: true } },
  payments: true,
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type OrderItemRecord = Prisma.OrderItemGetPayload<{ include: { materials: true } }>;
type PaymentRecord = Prisma.PaymentGetPayload<object>;

export function mapOrderItemToDto(item: OrderItemRecord): OrderItem {
  return {
    id: item.id,
    orderId: item.orderId,
    kind: item.kind,
    modelName: item.modelName,
    breakdown: item.breakdown,
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
    items: order.items.map(mapOrderItemToDto),
    // FEATURE-006 M3 — computed from `payments` at read time, never
    // stored (same discipline as computeIsDelayed).
    payments,
    paidTotal,
    remainingBalance: finalTotal - paidTotal,
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
} {
  return {
    kind: item.itemType,
    modelName: item.readyProductName ?? item.serviceName ?? null,
    itemTotal: item.itemTotal ?? null,
    sizeFamilyKey: item.sizeFamilyKey ?? null,
    realSizeLabel: item.realSizeLabel ?? null,
    inventoryItemId: item.inventoryItemId ?? null,
    sheetsConsumed: item.sheetsConsumed ?? null,
    productionTrack: item.productionTrack ?? null,
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
  items: Array<{ readyProductId?: string; serviceId?: string }>,
): Promise<Map<string, string>> {
  const readyProductIds = [...new Set(items.map((i) => i.readyProductId).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((id): id is string => Boolean(id)))];

  const [readyProducts, services] = await Promise.all([
    readyProductIds.length
      ? prisma.readyProduct.findMany({ where: { id: { in: readyProductIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const p of readyProducts) names.set(p.id, p.name);
  for (const s of services) names.set(s.id, s.name);
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
    partnerId: string;
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
): Promise<{ id: string; branchId: string; partnerId: string; invoiceNumber: string; itemCount: number }> {
  assertDeliveryDateNotBeforeOrderDate(input.deliveryDate, new Date());

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

  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const discountPercent = input.discountPercent ?? 0;
  const afterDiscount = subtotal * (1 - discountPercent / 100);
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
        partnerId: input.partnerId,
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
            itemTotal: result.total,
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
    // paired TreasuryEntry, same shape as `recordPayment` below.
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
): Promise<{ id: string; invoiceNumber: string; branchId: string; partnerId: string }> {
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

  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const discountPercent = input.discountPercent ?? existing.discountPercent.toNumber();
  const afterDiscount = subtotal * (1 - discountPercent / 100);
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
            itemTotal: result.total,
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
): Promise<{ branchId: string; partnerId: string }> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    // Multi-material pricing (2026-08-17) — `materials` needed for the
    // restock loop below (`materialsToRestock`).
    include: { items: { include: { materials: true } }, payments: true, workOrders: true },
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
