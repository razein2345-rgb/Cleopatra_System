import type { Request, Response } from 'express';
import { createWorkOrderSchema, hasPermission } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  WORK_ORDER_INCLUDE,
  deleteWorkOrder as deleteWorkOrderService,
  mapWorkOrderToDto,
  nextWorkOrderNumber,
  WorkOrderNotFoundError,
} from '../services/workOrderService.js';
import { getLatestPublishedTemplate } from '../services/workflowTemplateService.js';
import { createWorkflowInstance, WorkflowNoStagesError } from '../services/workflowInstanceService.js';
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
 * Creates a `WorkOrder` for an `Order` plus its `WorkflowInstance` on the
 * requested template's latest published version, in one transaction —
 * mirrors quotation-conversion's create-plus-link transaction shape
 * (FEATURE-003 M2).
 *
 * FEATURE-007 WF-B — `templateCode` is optional: when omitted, resolved
 * from `order.productionTrack` (the track chosen at order-creation time,
 * per the owner's "differentiate from the start" decision, 2026-08-12)
 * instead of requiring a manual pick every time. An explicit
 * `templateCode` still wins if supplied — e.g. an older order created
 * before `productionTrack` existed.
 */
export async function createWorkOrder(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createWorkOrderSchema.parse(req.body);

  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order not found' } });
    return;
  }

  const templateCode = input.templateCode ?? order.productionTrack;
  if (!templateCode) {
    res.status(400).json({
      success: false,
      error: {
        message: 'This order has no production track set — pass templateCode explicitly or set one on the order',
        code: 'NO_PRODUCTION_TRACK',
      },
    });
    return;
  }

  const template = await getLatestPublishedTemplate(templateCode);
  if (!template) {
    res.status(400).json({
      success: false,
      error: { message: 'No published workflow template found for this code', code: 'NO_PUBLISHED_TEMPLATE' },
    });
    return;
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const workOrderNumber = await nextWorkOrderNumber(tx);
      const workOrder = await tx.workOrder.create({
        data: { workOrderNumber, orderId: order.id, branchId: order.branchId },
      });
      await createWorkflowInstance(tx, {
        templateId: template.id,
        workOrderId: workOrder.id,
        performedById: auth.staffId,
        requiresDesign: order.requiresDesign,
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: workOrder.id }, include: WORK_ORDER_INCLUDE });
    });
  } catch (err) {
    if (err instanceof WorkflowNoStagesError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'NO_STAGES' } });
      return;
    }
    throw err;
  }

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
