import type { Request, Response } from 'express';
import { createOrderSchema, createPaymentSchema, hasPermission } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  createOrder,
  mapOrderToDto,
  OrderNotFoundError,
  ORDER_INCLUDE,
  PricingInputError,
  recordPayment,
  resolveItemCatalogNames,
} from '../services/orderService.js';
import { QuotationItemValidationError, validateQuotationItemRefs } from '../services/quotationService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';

/**
 * FEATURE-007 — the "المستندات" (Documents) unified list needs every
 * Order alongside Quotations/WorkOrders. Mirrors `listQuotations`'s shape
 * exactly (same `partnerId` filter, same `isDeleted`/`orderBy` pattern) —
 * this project never grows two different list-endpoint conventions for
 * the same kind of resource.
 */
export async function listOrders(req: Request, res: Response) {
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;

  const orders = await prisma.order.findMany({
    where: {
      isDeleted: false,
      ...(partnerId ? { partnerId } : {}),
    },
    include: ORDER_INCLUDE,
    orderBy: { date: 'desc' },
  });

  const canSeeInternal = hasPermission(req.auth!.permissions, 'orders.edit');
  res.json({ success: true, data: orders.map((o) => mapOrderToDto(o, canSeeInternal)) });
}

/**
 * Minimal read-only surface for FEATURE-003 M2 — just enough to show an
 * Order created by Quotation conversion. No edit/delete; those belong to
 * a future, dedicated Order module (00_REQUIREMENTS.md §14).
 */
export async function getOrder(req: Request<{ id: string }>, res: Response) {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: ORDER_INCLUDE,
  });
  if (!order || order.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order not found' } });
    return;
  }

  const canSeeInternal = hasPermission(req.auth!.permissions, 'orders.edit');
  res.json({ success: true, data: mapOrderToDto(order, canSeeInternal) });
}

/**
 * Direct Order creation (FEATURE-006 M2) — no Quotation required, per
 * Approved Addition B's "Direct Customer → Order/Invoice Flow." Item
 * validation reuses `validateQuotationItemRefs` (generic despite its
 * name — the same readyProductId/serviceId/description rule applies to
 * any Quotation-shaped item input, Order or Quotation alike).
 */
export async function createOrderHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createOrderSchema.parse(req.body);

  const partner = await loadPartnerOr404(input.partnerId, res);
  if (!partner) return;

  try {
    await validateQuotationItemRefs(input.items);
  } catch (err) {
    if (err instanceof QuotationItemValidationError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_ITEM' } });
      return;
    }
    throw err;
  }

  const itemNames = await resolveItemCatalogNames(input.items);

  let created;
  try {
    created = await createOrder({ ...input, staffId: auth.staffId }, itemNames);
  } catch (err) {
    if (err instanceof PricingInputError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_PRICING_INPUT' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'Order',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    partnerId: created.partnerId,
    newValue: { invoiceNumber: created.invoiceNumber, itemCount: created.itemCount, quotationOriginId: null },
  });

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: created.id },
    include: ORDER_INCLUDE,
  });
  res.status(201).json({ success: true, data: mapOrderToDto(order, true) });
}

/**
 * Records a deposit/payment against an Order (FEATURE-006 M3) — the
 * Payment and its Treasury entry are created atomically in
 * `recordPayment`'s own transaction; this handler never writes either
 * directly. No Quotation involvement anywhere — works identically for a
 * direct Order (M2) or a Quotation-converted one.
 */
export async function recordPaymentHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = createPaymentSchema.parse(req.body);

  let result;
  try {
    result = await recordPayment(req.params.id, input, auth.staffId);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
  const { order, paymentId } = result;

  await recordAudit({
    entityType: 'Payment',
    entityId: paymentId,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: order.branchId,
    partnerId: order.partnerId,
    newValue: { orderId: order.id, invoiceNumber: order.invoiceNumber, method: input.method, amount: input.amount },
  });

  res.status(201).json({ success: true, data: mapOrderToDto(order, true) });
}
