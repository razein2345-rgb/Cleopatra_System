import type { Prisma } from '../generated/prisma/client.js';
import type { CreateOrderItemInput, CreatePaymentInput, Order, OrderItem, Payment } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { deductStockForOrderItem } from './inventoryService.js';
import { buildPricingContext, computeItemPricing } from './pricingEngineService.js';

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
 * Atomically reserves the next invoice number for a branch/year — a
 * direct copy of `nextQuotationNumber`'s shape
 * (`quotationService.ts`), reusing the same `DocumentSequence` model
 * with `documentType: 'INVOICE'` (reserved since Phase 1; unused until
 * FEATURE-003 M2).
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: { branchId_documentType_year: { branchId, documentType: 'INVOICE', year } },
    create: { branchId, documentType: 'INVOICE', year, prefix: 'CLP-INV', lastNumber: 1 },
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
    items: CreateOrderItemInput[];
    payments?: CreatePaymentInput[];
  },
  itemNames: Map<string, string>,
): Promise<{ id: string; branchId: string; partnerId: string; invoiceNumber: string; itemCount: number }> {
  // Read-only reference data — safe outside the write transaction; the
  // actual order + stock deduction writes below run inside it.
  const ctx = await buildPricingContext(input.items);
  const priced = input.items.map((item) => computeItemPricing(item, ctx));

  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const discountPercent = input.discountPercent ?? 0;
  const afterDiscount = subtotal * (1 - discountPercent / 100);
  const vatOn = input.vatOn ?? false;
  const vatAmount = vatOn ? afterDiscount * (ctx.vatRate / 100) : 0;
  const finalTotal = afterDiscount + vatAmount;

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx, input.branchId);
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
              breakdownOverride: result.breakdown,
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
