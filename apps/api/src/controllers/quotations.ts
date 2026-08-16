import type { Request, Response } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { hasPermission, quotationStatusSchema } from '@cleopatra/shared';
import {
  createQuotationSchema,
  setQuotationApprovalStateSchema,
  setQuotationStatusSchema,
  updateQuotationSchema,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  assertLegalStatusTransition,
  createQuotation as createQuotationRecord,
  IllegalStatusTransitionError,
  mapQuotationToDto,
  nextQuotationNumber,
  QUOTATION_INCLUDE,
  QuotationItemValidationError,
  validateQuotationItemRefs,
} from '../services/quotationService.js';
import {
  buildOrderItemCreate,
  mapOrderToDto,
  nextInvoiceNumber,
  ORDER_INCLUDE,
  resolveItemCatalogNames,
} from '../services/orderService.js';
import { buildPricingContext, computeItemPricing, PricingInputError } from '../services/pricingEngineService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { tryAutoCreateWorkOrders } from '../services/workOrderService.js';

/**
 * All current callers are internal staff (this route is gated on
 * `quotations.view`, and no Customer Portal exists yet — 01_ANALYSIS.md's
 * Future Portal Compatibility note). Internal View access is computed
 * here, from the caller's own permission grants, and passed into
 * `mapQuotationToDto` as an explicit capability — a future portal
 * endpoint computes this differently (e.g. always `false`) and calls the
 * identical mapping function.
 */
function canSeeInternal(req: Request): boolean {
  return hasPermission(req.auth!.permissions, 'quotations.edit');
}

function handleQuotationItemError(err: unknown, res: Response): boolean {
  if (err instanceof QuotationItemValidationError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_ITEM' } });
    return true;
  }
  if (err instanceof PricingInputError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_PRICING_INPUT' } });
    return true;
  }
  return false;
}

export async function listQuotations(req: Request, res: Response) {
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
  const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
  const statusResult = statusParam ? quotationStatusSchema.safeParse(statusParam) : undefined;

  const quotations = await prisma.quotation.findMany({
    where: {
      isDeleted: false,
      ...(partnerId ? { partnerId } : {}),
      ...(statusResult?.success ? { status: statusResult.data } : {}),
    },
    include: QUOTATION_INCLUDE,
    orderBy: { date: 'desc' },
  });

  const internal = canSeeInternal(req);
  res.json({ success: true, data: quotations.map((q) => mapQuotationToDto(q, internal)) });
}

export async function getQuotation(req: Request<{ id: string }>, res: Response) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: QUOTATION_INCLUDE,
  });
  if (!quotation || quotation.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  res.json({ success: true, data: mapQuotationToDto(quotation, canSeeInternal(req)) });
}

/**
 * FEATURE-007 — wired to the real Pricing Engine (see
 * `quotationService.ts`'s `createQuotation`), the same engine `orders.ts`'s
 * `createOrderHandler` uses — owner's explicit clarification that
 * Quotation creation is the same unified flow, not a separate one.
 */
export async function createQuotation(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createQuotationSchema.parse(req.body);

  const partner = await loadPartnerOr404(input.partnerId, res);
  if (!partner) return;

  try {
    await validateQuotationItemRefs(input.items);
  } catch (err) {
    if (handleQuotationItemError(err, res)) return;
    throw err;
  }

  const itemNames = await resolveItemCatalogNames(input.items);

  let created;
  try {
    created = await createQuotationRecord({ ...input, staffId: auth.staffId }, itemNames);
  } catch (err) {
    if (handleQuotationItemError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'Quotation',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    partnerId: created.partnerId,
    newValue: { quotationNumber: created.quotationNumber, itemCount: created.items.length },
  });

  res.status(201).json({ success: true, data: mapQuotationToDto(created, true) });
}

/**
 * `subtotal`/`vatAmount`/`finalTotal` are always recomputed from `items`
 * when items are provided, same as create — an update never accepts a
 * caller-supplied total either. If items aren't provided, the existing
 * frozen totals are left untouched (only note/date-type fields change).
 */
export async function updateQuotation(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: QUOTATION_INCLUDE,
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  const input = updateQuotationSchema.parse(req.body);

  if (input.items) {
    try {
      await validateQuotationItemRefs(input.items);
    } catch (err) {
      if (handleQuotationItemError(err, res)) return;
      throw err;
    }
  }

  let recomputedTotals: { subtotal: number; vatAmount: number; finalTotal: number } | null = null;
  let itemNames = new Map<string, string>();
  let priced: ReturnType<typeof computeItemPricing>[] = [];
  if (input.items) {
    try {
      itemNames = await resolveItemCatalogNames(input.items);
      const ctx = await buildPricingContext(input.items);
      priced = input.items.map((item) => computeItemPricing(item, ctx));
      const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
      const discountPercent = input.discountPercent ?? existing.discountPercent.toNumber();
      const afterDiscount = subtotal * (1 - discountPercent / 100);
      const vatOn = input.vatOn ?? existing.vatOn;
      const vatAmount = vatOn ? afterDiscount * (ctx.vatRate / 100) : 0;
      recomputedTotals = { subtotal, vatAmount, finalTotal: Math.ceil(afterDiscount + vatAmount) };
    } catch (err) {
      if (handleQuotationItemError(err, res)) return;
      throw err;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.quotationItem.deleteMany({ where: { quotationId: existing.id } });
      await tx.quotationItem.createMany({
        data: input.items.map((item, index) => {
          const result = priced[index]!;
          const readyProductName = item.readyProductId ? (itemNames.get(item.readyProductId) ?? null) : null;
          const serviceName = item.serviceId ? (itemNames.get(item.serviceId) ?? null) : null;
          return {
            quotationId: existing.id,
            itemType: item.itemType,
            notes: item.notes ?? null,
            description: item.description ?? null,
            readyProductId: item.readyProductId ?? null,
            serviceId: item.serviceId ?? null,
            kind: item.itemType,
            modelName: readyProductName ?? serviceName,
            breakdown: result.breakdown as Prisma.InputJsonValue,
            itemTotal: result.total,
            sizeFamilyKey: result.sizeFamilyKey,
            realSizeLabel: result.realSizeLabel,
            productionTrack: item.productionTrack ?? null,
          };
        }),
      });
    }

    return tx.quotation.update({
      where: { id: existing.id },
      data: {
        validUntil: input.validUntil !== undefined ? (input.validUntil ? new Date(input.validUntil) : null) : undefined,
        subtotal: recomputedTotals?.subtotal,
        discountPercent: input.discountPercent,
        vatOn: input.vatOn,
        vatAmount: recomputedTotals?.vatAmount,
        finalTotal: recomputedTotals?.finalTotal,
        customerNotes: input.customerNotes,
        internalNotes: input.internalNotes,
      },
      include: QUOTATION_INCLUDE,
    });
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.partnerId,
    previousValue: {
      validUntil: existing.validUntil,
      subtotal: existing.subtotal,
      discountPercent: existing.discountPercent,
      vatOn: existing.vatOn,
      vatAmount: existing.vatAmount,
      finalTotal: existing.finalTotal,
      customerNotes: existing.customerNotes,
      internalNotes: existing.internalNotes,
      itemCount: existing.items.length,
    },
    newValue: { itemCount: updated.items.length },
  });

  res.json({ success: true, data: mapQuotationToDto(updated, true) });
}

/**
 * Only entry point that may change `status` — enforces
 * `assertLegalStatusTransition` (the one place transition legality is
 * decided, per the "Workflow Ready" architectural decision).
 */
export async function setQuotationStatus(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  const input = setQuotationStatusSchema.parse(req.body);

  try {
    assertLegalStatusTransition(existing.status, input.status);
  } catch (err) {
    if (err instanceof IllegalStatusTransitionError) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'ILLEGAL_STATUS_TRANSITION' },
      });
      return;
    }
    throw err;
  }

  const updated = await prisma.quotation.update({
    where: { id: existing.id },
    data: { status: input.status },
    include: QUOTATION_INCLUDE,
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: updated.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.partnerId,
    previousValue: { status: existing.status },
    newValue: { status: input.status },
  });

  res.json({ success: true, data: mapQuotationToDto(updated, true) });
}

/** Only entry point that may change `approvalState` — independent of `status` (see schema.prisma's doc comment). */
export async function setQuotationApprovalState(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  const input = setQuotationApprovalStateSchema.parse(req.body);

  const updated = await prisma.quotation.update({
    where: { id: existing.id },
    data: { approvalState: input.approvalState },
    include: QUOTATION_INCLUDE,
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: updated.id,
    action: 'APPROVAL_CHANGED',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.partnerId,
    previousValue: { approvalState: existing.approvalState },
    newValue: { approvalState: input.approvalState },
  });

  res.json({ success: true, data: mapQuotationToDto(updated, true) });
}

/**
 * Converts an ACCEPTED Quotation into a real Order (FEATURE-003 M2).
 * Conversion *is* the `ACCEPTED → CONVERTED` transition — it reuses
 * `assertLegalStatusTransition` unchanged, so an already-`CONVERTED`
 * quotation is rejected the same way any other illegal transition is
 * (`LEGAL_STATUS_TRANSITIONS['CONVERTED']` is `[]`), with no separate
 * "already converted" check needed. Everything copied onto the Order is a
 * frozen snapshot (ADR 0010) — nothing here references the Quotation or
 * its items by FK, so later edits to either side never leak across.
 *
 * FEATURE-007 — now carries the Quotation item's already-frozen
 * `breakdown`/`itemTotal` straight onto the new OrderItem (both run
 * through the identical Pricing Engine, so there's no re-pricing here —
 * just copying the frozen snapshot forward, same discipline as every
 * other field on this conversion).
 */
export async function convertQuotation(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: QUOTATION_INCLUDE,
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  try {
    assertLegalStatusTransition(existing.status, 'CONVERTED');
  } catch (err) {
    if (err instanceof IllegalStatusTransitionError) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'ILLEGAL_STATUS_TRANSITION' },
      });
      return;
    }
    throw err;
  }

  const { order, quotation } = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx);
    const createdOrder = await tx.order.create({
      data: {
        invoiceNumber,
        branchId: existing.branchId,
        partnerId: existing.partnerId,
        staffId: existing.staffId,
        subtotal: existing.subtotal,
        discountPercent: existing.discountPercent,
        vatOn: existing.vatOn,
        vatAmount: existing.vatAmount,
        finalTotal: existing.finalTotal,
        customerNotes: existing.customerNotes,
        internalNotes: existing.internalNotes,
        status: 'CONFIRMED',
        items: {
          create: existing.items.map((item) =>
            buildOrderItemCreate({
              itemType: item.itemType,
              notes: item.notes,
              description: item.description,
              readyProductId: item.readyProductId,
              readyProductName: item.modelName,
              serviceId: item.serviceId,
              serviceName: item.modelName,
              itemTotal: item.itemTotal?.toNumber() ?? null,
              // A converted Order's `OrderItem` has no `description` column
              // (unlike `QuotationItem`, which does) — merge the quotation's
              // own "نطاق العمل" into the frozen breakdown here, same as
              // `orderService.ts`'s `createOrder` does for a direct invoice,
              // or a scope the customer already approved silently vanishes
              // on conversion.
              breakdownOverride: {
                ...((item.breakdown as Record<string, unknown> | null) ?? {}),
                description: item.description ?? null,
              },
              sizeFamilyKey: item.sizeFamilyKey,
              realSizeLabel: item.realSizeLabel,
              productionTrack: item.productionTrack,
            }),
          ),
        },
      },
      include: ORDER_INCLUDE,
    });

    const updatedQuotation = await tx.quotation.update({
      where: { id: existing.id },
      data: { status: 'CONVERTED', convertedOrderId: createdOrder.id },
      include: QUOTATION_INCLUDE,
    });

    // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — same best-effort
    // auto-entry-into-production as the direct-invoice path
    // (`orderService.createOrder`), now per distinct track present among
    // the converted items (`QuotationItem.productionTrack`, carried
    // through `buildOrderItemCreate` above) — no longer a guaranteed
    // no-op, since Quotations now carry each item's track.
    const createdItemRows = await tx.orderItem.findMany({
      where: { orderId: createdOrder.id },
      select: { id: true, productionTrack: true },
    });
    await tryAutoCreateWorkOrders(tx, { id: createdOrder.id, branchId: createdOrder.branchId }, createdItemRows, undefined, auth.staffId);

    // Re-fetch with ORDER_INCLUDE now that the Quotation's `convertedOrderId`
    // FK is committed — `createdOrder`'s own include ran before that FK
    // existed, so `createdOrder.quotationOrigin` would still read back null.
    const orderWithOrigin = await tx.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: ORDER_INCLUDE,
    });

    return { order: orderWithOrigin, quotation: updatedQuotation };
  });

  await recordAudit({
    entityType: 'Order',
    entityId: order.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: order.branchId,
    partnerId: order.partnerId,
    newValue: { invoiceNumber: order.invoiceNumber, quotationId: existing.id, itemCount: order.items.length },
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: quotation.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    branchId: quotation.branchId,
    partnerId: quotation.partnerId,
    previousValue: { status: existing.status },
    newValue: { status: 'CONVERTED', convertedOrderId: order.id },
  });

  res.status(201).json({ success: true, data: mapOrderToDto(order, true) });
}

/**
 * Creates a new version of a Quotation: a new row, copying the current
 * item set (including its already-frozen pricing snapshot — never
 * re-priced), `version` incremented, `previousVersionId` pointing back —
 * the prior row is never overwritten (the explicit M1 versioning
 * requirement).
 */
export async function createQuotationVersion(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    include: QUOTATION_INCLUDE,
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const quotationNumber = await nextQuotationNumber(tx);
    return tx.quotation.create({
      data: {
        quotationNumber,
        branchId: existing.branchId,
        partnerId: existing.partnerId,
        staffId: auth.staffId,
        validUntil: existing.validUntil,
        subtotal: existing.subtotal,
        discountPercent: existing.discountPercent,
        vatOn: existing.vatOn,
        vatAmount: existing.vatAmount,
        finalTotal: existing.finalTotal,
        customerNotes: existing.customerNotes,
        internalNotes: existing.internalNotes,
        version: existing.version + 1,
        previousVersionId: existing.id,
        items: {
          create: existing.items.map((item) => ({
            itemType: item.itemType,
            notes: item.notes,
            description: item.description,
            readyProductId: item.readyProductId,
            serviceId: item.serviceId,
            kind: item.kind,
            modelName: item.modelName,
            breakdown: item.breakdown as Prisma.InputJsonValue | undefined,
            itemTotal: item.itemTotal,
            sizeFamilyKey: item.sizeFamilyKey,
            realSizeLabel: item.realSizeLabel,
            productionTrack: item.productionTrack,
          })),
        },
      },
      include: QUOTATION_INCLUDE,
    });
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    partnerId: created.partnerId,
    newValue: {
      quotationNumber: created.quotationNumber,
      version: created.version,
      previousVersionId: created.previousVersionId,
    },
  });

  res.status(201).json({ success: true, data: mapQuotationToDto(created, true) });
}

/** Soft delete only (ADR 0007). */
export async function deleteQuotation(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.quotation.findUnique({
    where: { id: req.params.id },
    select: { isDeleted: true, branchId: true, partnerId: true },
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Quotation not found' } });
    return;
  }

  const deleted = await prisma.quotation.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'Quotation',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    partnerId: existing.partnerId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
