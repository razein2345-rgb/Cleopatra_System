import type { Request, Response } from 'express';
import { createOrderSchema, createPaymentSchema, hasPermission, updateOrderSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  createOrder,
  DeliveryDateBeforeOrderDateError,
  deleteOrder,
  getSalesSummary,
  mapOrderToDto,
  OrderHasPaymentsError,
  OrderHasWorkOrderError,
  OrderNotFoundError,
  ORDER_INCLUDE,
  PricingInputError,
  recordPayment,
  resolveItemCatalogNames,
  updateOrder,
} from '../services/orderService.js';
import { QuotationItemValidationError, validateQuotationItemRefs } from '../services/quotationService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { DayClosedError } from '../services/treasuryService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

/**
 * Owner (2026-08-20, "الموظف اللي انا محدد إنه من فرع برينتنج هاوس مينفعش
 * يعمل عملية لفرع كليوباترا") — found live: none of this file's write
 * handlers ever checked branch access at all, unlike `users.ts`/
 * `employeeAdvances.ts`/`workflowInstances.ts`/`treasuryEntries.ts`'s
 * `resolveTargetBranchId`, which already enforce it. A non-Super-Admin
 * caller with only their home branch could target any other branch's
 * order just by id (or by `branchId` in the create body) — closes that
 * gap without touching `getOrder`/`listOrders` (unaffected, out of scope
 * for this report — a read-only cross-branch document lookup is a
 * different, likely-intentional behavior).
 */
async function loadOrderBranchOr404(id: string, res: Response): Promise<string | null> {
  const order = await prisma.order.findUnique({ where: { id }, select: { branchId: true, isDeleted: true } });
  if (!order || order.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order not found' } });
    return null;
  }
  return order.branchId;
}

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

/** UX_PRODUCT_AUDIT.md § مشكلة 2.1 — feeds the owner-only financial Dashboard widget. Gated on `treasury.view` (not `orders.view`) since aggregate revenue is more sensitive than the per-order detail an ordinary `orders.view` holder (e.g. SALES) already sees. */
export async function getSalesSummaryHandler(_req: Request, res: Response) {
  const summary = await getSalesSummary();
  res.json({ success: true, data: summary });
}

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

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

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
    if (err instanceof DeliveryDateBeforeOrderDateError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_DELIVERY_DATE' } });
      return;
    }
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
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
 * FEATURE-007 — full item-replacement edit (owner, 2026-08-12). Same
 * item-ref validation as create; `updateOrder` itself handles restocking
 * the old items and deducting the new ones inside one transaction.
 */
export async function updateOrderHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const orderBranchId = await loadOrderBranchOr404(req.params.id, res);
  if (!orderBranchId) return;
  if (!canAccessBranch(auth, orderBranchId)) {
    forbidBranch(res);
    return;
  }

  const input = updateOrderSchema.parse(req.body);

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

  let updated;
  try {
    updated = await updateOrder(req.params.id, input, itemNames, auth.staffId);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof PricingInputError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_PRICING_INPUT' } });
      return;
    }
    if (err instanceof DeliveryDateBeforeOrderDateError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_DELIVERY_DATE' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'Order',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.partnerId,
    newValue: { invoiceNumber: updated.invoiceNumber, itemCount: input.items.length },
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: updated.id }, include: ORDER_INCLUDE });
  res.json({ success: true, data: mapOrderToDto(order, true) });
}

/**
 * FEATURE-007 — soft delete, blocked if the Order has any Payment or
 * WorkOrder (owner, 2026-08-12: "ممنوع لو فيه دفعات" — `deleteOrder`
 * itself enforces both guards and restocks consumed sheets).
 */
export async function deleteOrderHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const orderBranchId = await loadOrderBranchOr404(req.params.id, res);
  if (!orderBranchId) return;
  if (!canAccessBranch(auth, orderBranchId)) {
    forbidBranch(res);
    return;
  }

  let result;
  try {
    result = await deleteOrder(req.params.id, auth.staffId);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof OrderHasPaymentsError || err instanceof OrderHasWorkOrderError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'ORDER_HAS_DEPENDENTS' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'Order',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: result.branchId,
    partnerId: result.partnerId,
    newValue: null,
  });

  res.json({ success: true, data: { id: req.params.id } });
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
  const orderBranchId = await loadOrderBranchOr404(req.params.id, res);
  if (!orderBranchId) return;
  if (!canAccessBranch(auth, orderBranchId)) {
    forbidBranch(res);
    return;
  }

  const input = createPaymentSchema.parse(req.body);

  let result;
  try {
    result = await recordPayment(req.params.id, input, auth.staffId);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
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
