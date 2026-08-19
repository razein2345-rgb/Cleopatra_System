import type { Request, Response } from 'express';
import type { ProductionTrack } from '@cleopatra/shared';
import { createWorkOrderSchema, hasPermission, updateOrderItemProductionSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  WORK_ORDER_INCLUDE,
  createWorkOrderForTrack,
  deleteWorkOrder as deleteWorkOrderService,
  mapWorkOrderToDto,
  WorkOrderNotFoundError,
} from '../services/workOrderService.js';
import {
  OrderItemNotFoundError,
  OrderItemNotInWorkOrderError,
  updateOrderItemProduction,
} from '../services/orderService.js';
import { getLatestPublishedTemplate } from '../services/workflowTemplateService.js';
import { recordAudit } from '../services/auditService.js';

/**
 * All current callers are internal staff (no Customer Portal exists yet) —
 * `canSeeInternal` is computed here, from the caller's own grants, the same
 * `mapQuotationToDto`/`mapOrderToDto` pattern.
 */
function canSeeInternal(req: Request): boolean {
  return hasPermission(req.auth!.permissions, 'work-orders.edit');
}

/**
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — the manual fallback
 * behind `GenerateWorkOrderPanel`, for whichever tracks didn't get an
 * automatic Work Order at order-creation time (their template wasn't
 * published yet). `templateCode` now doubles as the track selector —
 * scoped to exactly this order's items whose own `productionTrack`
 * matches `templateCode` and have no `workOrderId` yet, mirroring
 * `createWorkOrderForTrack` (the exact function `orderService.ts`'s
 * automatic per-track loop already uses, so the two paths can never
 * drift). A 400 with no matching items also naturally replaces the old
 * latent bug where calling this twice for the same order threw an
 * uncaught unique-constraint error.
 */
export async function createWorkOrder(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createWorkOrderSchema.parse(req.body);

  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order not found' } });
    return;
  }

  const track = input.templateCode as ProductionTrack;
  const template = await getLatestPublishedTemplate(track);
  if (!template) {
    res.status(400).json({
      success: false,
      error: { message: 'No published workflow template found for this code', code: 'NO_PUBLISHED_TEMPLATE' },
    });
    return;
  }

  const unlinkedItems = await prisma.orderItem.findMany({
    where: { orderId: order.id, productionTrack: track, workOrderId: null },
    select: { id: true },
  });
  if (unlinkedItems.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        message: 'No unlinked items on this order resolve to this track — a Work Order may already exist for it',
        code: 'NO_UNLINKED_ITEMS_FOR_TRACK',
      },
    });
    return;
  }

  const result = await prisma.$transaction(async (tx) =>
    createWorkOrderForTrack(tx, {
      orderId: order.id,
      branchId: order.branchId,
      track,
      itemIds: unlinkedItems.map((i) => i.id),
      requiresDesign: input.requiresDesign ?? true,
      performedById: auth.staffId,
    }),
  );
  if (!result) {
    res.status(400).json({ success: false, error: { message: 'This template has no stages', code: 'NO_STAGES' } });
    return;
  }

  const created = await prisma.workOrder.findUniqueOrThrow({ where: { id: result.workOrderId }, include: WORK_ORDER_INCLUDE });

  await recordAudit({
    entityType: 'WorkOrder',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    partnerId: order.partnerId,
    newValue: { workOrderNumber: created.workOrderNumber, orderId: order.id, templateCode: template.code, templateVersion: template.version },
  });

  res.status(201).json({ success: true, data: mapWorkOrderToDto(created, true) });
}

/**
 * FEATURE-007 — the "المستندات" (Documents) unified list needs every
 * WorkOrder alongside Quotations/Orders. Same `isDeleted`/`orderBy`
 * pattern as `listQuotations`/`listOrders`.
 *
 * FEATURE-011 (2026-08-14) — `partnerId` filter for the customer profile's
 * work-order history. `WorkOrder` has no `partnerId` column of its own
 * (it links to a customer only transitively through `order.partnerId`), so
 * this filters through the relation instead of adding a denormalized
 * column — same `?partnerId=` query-param shape as `listOrders`/
 * `listQuotations`.
 */
export async function listWorkOrders(req: Request, res: Response) {
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;

  const workOrders = await prisma.workOrder.findMany({
    where: {
      isDeleted: false,
      ...(partnerId ? { order: { partnerId } } : {}),
    },
    include: WORK_ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const internal = canSeeInternal(req);
  res.json({ success: true, data: workOrders.map((w) => mapWorkOrderToDto(w, internal)) });
}

export async function getWorkOrder(req: Request<{ id: string }>, res: Response) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: req.params.id },
    include: WORK_ORDER_INCLUDE,
  });
  if (!workOrder || workOrder.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Work order not found' } });
    return;
  }
  res.json({ success: true, data: mapWorkOrderToDto(workOrder, canSeeInternal(req)) });
}

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19, owner: "أقدر أعرف A4
 * خلصت والA5 لسه") — updates one OrderItem's own production progress,
 * independent of the shared WorkOrder's own stage. Gated the same weight
 * as advancing a stage (`work-orders.edit`), scoped to `:workOrderId` in
 * the URL (not just `:itemId` alone) so a caller can't update an item on a
 * job they have no route into — `updateOrderItemProduction` itself
 * enforces the item actually belongs to that Work Order.
 */
export async function updateWorkOrderItemProduction(req: Request<{ workOrderId: string; itemId: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateOrderItemProductionSchema.parse(req.body);

  let updated;
  try {
    updated = await updateOrderItemProduction(req.params.workOrderId, req.params.itemId, input, auth.staffId);
  } catch (err) {
    if (err instanceof OrderItemNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof OrderItemNotInWorkOrderError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'ITEM_NOT_IN_WORK_ORDER' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'OrderItem',
    entityId: updated.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    newValue: { producedQuantity: updated.producedQuantity, productionStatus: updated.productionStatus },
  });

  res.json({ success: true, data: updated });
}

/**
 * FEATURE-012 (2026-08-14, owner: "لازم اكون أقدر أحذف أمر الشغل") —
 * mirrors `deleteOrderHandler`'s exact shape (404 on not-found, `recordAudit`
 * after the soft-delete succeeds, `{id}` response).
 */
export async function deleteWorkOrder(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  let result;
  try {
    result = await deleteWorkOrderService(req.params.id, auth.staffId);
  } catch (err) {
    if (err instanceof WorkOrderNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'WorkOrder',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: result.branchId,
    partnerId: result.partnerId,
    newValue: null,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
