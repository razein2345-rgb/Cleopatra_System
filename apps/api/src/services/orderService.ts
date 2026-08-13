import type { Prisma } from '../generated/prisma/client.js';
import type { CreateOrderItemInput, CreatePaymentInput, Order, OrderItem, Payment, ProductionTrack } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { deductStockForOrderItem, restockForOrderItem } from './inventoryService.js';
import { buildPricingContext, computeItemPricing } from './pricingEngineService.js';
import { getPublicAttachmentUrl } from './attachmentService.js';

export { PricingInputError } from './pricingEngineService.js';

/**
 * Centralized here (not duplicated per controller) — `orders.ts` and
 * `quotations.ts` (convertQuotation, which returns the created Order) both
 * import this single definition. `payments: true` added in FEATURE-006 M3
 * so `mapOrderToDto` can always compute `paidTotal`/`remainingBalance`.
 */
export const ORDER_INCLUDE = {
  items: true,
  quotationOrigin: { select: { id: true } },
  payments: true,
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type OrderItemRecord = Prisma.OrderItemGetPayload<object>;
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
    createdAt: item.createdAt.toISOString(),
  };
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
    productionTrack: order.productionTrack,
    quotationOriginId: order.quotationOrigin?.id ?? null,
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
}): {
  kind: string;
  modelName: string | null;
  breakdown: Prisma.InputJsonValue;
  itemTotal: number | null;
  sizeFamilyKey: string | null;
  realSizeLabel: string | null;
  inventoryItemId: string | null;
  sheetsConsumed: number | null;
} {
  return {
    kind: item.itemType,
    modelName: item.readyProductName ?? item.serviceName ?? null,
    itemTotal: item.itemTotal ?? null,
    sizeFamilyKey: item.sizeFamilyKey ?? null,
    realSizeLabel: item.realSizeLabel ?? null,
    inventoryItemId: item.inventoryItemId ?? null,
    sheetsConsumed: item.sheetsConsumed ?? null,
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
    productionTrack?: ProductionTrack;
    items: CreateOrderItemInput[];
    payments?: CreatePaymentInput[];
  },
  itemNames: Map<string, string>,
): Promise<{ id: string; branchId: string; partnerId: string; invoiceNumber: string; itemCount: number }> {
  assertDeliveryDateNotBeforeOrderDate(input.deliveryDate, new Date());

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
        productionTrack: input.productionTrack ?? null,
        status: 'CONFIRMED',
        // quotationOriginId is intentionally never set here — this is the
        // reverse relation from Quotation.convertedOrderId; a directly
        // created Order simply has no Quotation pointing at it.
        items: {
          create: input.items.map((item, index) => {
            const result = priced[index]!;
            return buildOrderItemCreate({
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
            });
          }),
        },
      },
      select: { id: true, branchId: true, partnerId: true, invoiceNumber: true, _count: { select: { items: true } } },
    });

    // Link each uploaded Attachment to this Order now that it exists —
    // mirrors the Payment+TreasuryEntry atomicity below, same transaction.
    if (attachmentIds.length) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { orderId: created.id } });
    }

    // FEATURE-007 M2 — auto-deduct stock in the same transaction as the
    // order, mirroring the Payment+Treasury atomicity pattern. Locked
    // decision: never blocks order creation, even if this drives
    // `quantityOnHand` negative — see inventoryService's own doc comment.
    for (const result of priced) {
      if (result.inventoryItemId && result.sheetsNeeded) {
        await deductStockForOrderItem(tx, result.inventoryItemId, input.branchId, result.sheetsNeeded);
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

    return { ...created, itemCount: created._count.items };
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
    productionTrack?: ProductionTrack | null;
    items: CreateOrderItemInput[];
  },
  itemNames: Map<string, string>,
): Promise<{ id: string; invoiceNumber: string; branchId: string; partnerId: string }> {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!existing || existing.isDeleted) {
    throw new OrderNotFoundError();
  }

  assertDeliveryDateNotBeforeOrderDate(
    input.deliveryDate !== undefined ? input.deliveryDate : existing.deliveryDate?.toISOString(),
    existing.date,
  );

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
    // "يرجع للمخزن تلقائيًا" (owner, 2026-08-12).
    for (const oldItem of existing.items) {
      if (oldItem.inventoryItemId && oldItem.sheetsConsumed) {
        await restockForOrderItem(tx, oldItem.inventoryItemId, existing.branchId, oldItem.sheetsConsumed.toNumber());
      }
    }
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
        productionTrack: input.productionTrack !== undefined ? input.productionTrack : existing.productionTrack,
        items: {
          create: input.items.map((item, index) => {
            const result = priced[index]!;
            return buildOrderItemCreate({
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
                referenceImageUrl: item.attachmentId ? (attachmentUrlById.get(item.attachmentId) ?? null) : null,
                inkColor: item.inkColor ?? null,
                bindingType: item.bindingType ?? null,
                sellophaneType: item.sellophaneType ?? null,
              },
              sizeFamilyKey: result.sizeFamilyKey,
              realSizeLabel: result.realSizeLabel,
              inventoryItemId: result.inventoryItemId,
              sheetsConsumed: result.sheetsNeeded,
            });
          }),
        },
      },
    });

    if (attachmentIds.length) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { orderId } });
    }

    for (const result of priced) {
      if (result.inventoryItemId && result.sheetsNeeded) {
        await deductStockForOrderItem(tx, result.inventoryItemId, existing.branchId, result.sheetsNeeded);
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
    include: { items: true, payments: true, workOrder: true },
  });
  if (!existing || existing.isDeleted) {
    throw new OrderNotFoundError();
  }
  if (existing.payments.length > 0) {
    throw new OrderHasPaymentsError();
  }
  if (existing.workOrder) {
    throw new OrderHasWorkOrderError();
  }

  await prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      if (item.inventoryItemId && item.sheetsConsumed) {
        await restockForOrderItem(tx, item.inventoryItemId, existing.branchId, item.sheetsConsumed.toNumber());
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
