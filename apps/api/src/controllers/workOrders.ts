import type { Request, Response } from 'express';
import { createWorkOrderSchema, hasPermission } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { WORK_ORDER_INCLUDE, mapWorkOrderToDto, nextWorkOrderNumber } from '../services/workOrderService.js';
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
 */
export async function createWorkOrder(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createWorkOrderSchema.parse(req.body);

  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order not found' } });
    return;
  }

  const template = await getLatestPublishedTemplate(input.templateCode);
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
      const workOrderNumber = await nextWorkOrderNumber(tx, order.branchId);
      const workOrder = await tx.workOrder.create({
        data: { workOrderNumber, orderId: order.id, branchId: order.branchId },
      });
      await createWorkflowInstance(tx, {
        templateId: template.id,
        workOrderId: workOrder.id,
        performedById: auth.staffId,
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
 */
export async function listWorkOrders(req: Request, res: Response) {
  const workOrders = await prisma.workOrder.findMany({
    where: { isDeleted: false },
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
