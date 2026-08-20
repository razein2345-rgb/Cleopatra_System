import type { Prisma } from '../generated/prisma/client.js';
import type { ProductionTrack, WorkOrder } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  WORKFLOW_INSTANCE_INCLUDE,
  createWorkflowInstance,
  mapWorkflowInstanceToDto,
  WorkflowNoStagesError,
} from './workflowInstanceService.js';
import { recordWorkflowEvent } from './workflowEventService.js';
import { getLatestPublishedTemplate } from './workflowTemplateService.js';
import { mapOrderItemToDto } from './orderService.js';

export const WORK_ORDER_INCLUDE = {
  items: { include: { materials: { orderBy: { sortOrder: 'asc' } } } },
  workflowInstance: { include: WORKFLOW_INSTANCE_INCLUDE },
} satisfies Prisma.WorkOrderInclude;

type WorkOrderRecord = Prisma.WorkOrderGetPayload<{ include: typeof WORK_ORDER_INCLUDE }>;

/**
 * `productionStatus` is deliberately never read here — deprecated (see its
 * own schema doc comment); `workflowInstance` is the real state.
 *
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — `items` is inlined
 * (only this Work Order's own items, via `OrderItem.workOrderId`), and
 * `productionTrack` is read straight off the frozen column — neither is
 * re-derived from the parent Order any more.
 */
export function mapWorkOrderToDto(record: WorkOrderRecord, canSeeInternal: boolean): WorkOrder {
  return {
    id: record.id,
    workOrderNumber: record.workOrderNumber,
    orderId: record.orderId,
    branchId: record.branchId,
    productionTrack: record.productionTrack,
    items: record.items.map(mapOrderItemToDto),
    workflowInstance: record.workflowInstance
      ? mapWorkflowInstanceToDto(record.workflowInstance, canSeeInternal)
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Atomically reserves the next work order number for a year — the same
 * `nextQuotationNumber`/`nextInvoiceNumber` shape, fourth use of this
 * mechanism. `DocumentType.WORK_ORDER`/prefix `CLP-WO` reserved since
 * Phase 1, unused until now.
 *
 * FEATURE-007 (2026-08-12, bug fix) — `WorkOrder.workOrderNumber` is
 * *globally* unique, not unique-per-branch; always reserving against the
 * default branch's sequence row keeps this a single shared global counter
 * per year — see `nextInvoiceNumber`'s doc comment in `orderService.ts`
 * for the full incident this fixes.
 */
export async function nextWorkOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const defaultBranch = await tx.branch.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } });
  const year = new Date().getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: { branchId_documentType_year: { branchId: defaultBranch.id, documentType: 'WORK_ORDER', year } },
    create: { branchId: defaultBranch.id, documentType: 'WORK_ORDER', year, prefix: 'CLP-WO', lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

/**
 * One track's worth of the auto-creation body — a real WorkOrder for
 * `track`, its WorkflowInstance, and linking `itemIds` (all of which
 * already resolved to `track`) to it. Shared by `tryAutoCreateWorkOrders`
 * (the automatic per-order fan-out) and `workOrders.ts`'s manual endpoint
 * (the `GenerateWorkOrderPanel` "missing track" fallback) so the two paths
 * can never drift. Returns `null` (never throws) if `track` has no
 * published template yet or its template has no stages — same
 * "best-effort, never blocks" discipline the whole Work Order auto-entry
 * flow already follows.
 */
export async function createWorkOrderForTrack(
  tx: Prisma.TransactionClient,
  input: { orderId: string; branchId: string; track: ProductionTrack; itemIds: string[]; requiresDesign: boolean; performedById: string },
): Promise<{ workOrderId: string; productionTrack: ProductionTrack; itemIds: string[] } | null> {
  const template = await getLatestPublishedTemplate(input.track);
  if (!template) return null;

  try {
    const workOrderNumber = await nextWorkOrderNumber(tx);
    const workOrder = await tx.workOrder.create({
      data: { workOrderNumber, orderId: input.orderId, branchId: input.branchId, productionTrack: input.track },
    });
    await tx.orderItem.updateMany({ where: { id: { in: input.itemIds } }, data: { workOrderId: workOrder.id } });
    await createWorkflowInstance(tx, {
      templateId: template.id,
      workOrderId: workOrder.id,
      performedById: input.performedById,
      requiresDesign: input.requiresDesign,
    });
    return { workOrderId: workOrder.id, productionTrack: input.track, itemIds: input.itemIds };
  } catch (err) {
    if (err instanceof WorkflowNoStagesError) return null;
    throw err;
  }
}

/**
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "الغيها خالص —
 * النظام يحدد لوحده") — supersedes the old singular `tryAutoCreateWorkOrder`
 * (one order-level track → one WorkOrder for the whole order). Groups the
 * order's just-created items by their own frozen `productionTrack`, and
 * creates one independent WorkOrder per distinct track present — a mixed
 * order (e.g. an Offset flyer + a Sublimation mug) gets two WorkOrders,
 * each linked only to its own items. Items with no track (INVENTORY_RETAIL,
 * or a track with no published template) are simply left unlinked — same
 * best-effort, never-blocks-the-Order principle `tryAutoCreateWorkOrder`
 * always had, just applied per-track instead of once for the whole order.
 */
export async function tryAutoCreateWorkOrders(
  tx: Prisma.TransactionClient,
  order: { id: string; branchId: string },
  createdItems: Array<{ id: string; productionTrack: ProductionTrack | null }>,
  requiresDesignByTrack: Record<string, boolean> | undefined,
  performedById: string,
): Promise<Array<{ workOrderId: string; productionTrack: ProductionTrack; itemIds: string[] }>> {
  const itemIdsByTrack = new Map<ProductionTrack, string[]>();
  for (const item of createdItems) {
    if (!item.productionTrack) continue;
    const list = itemIdsByTrack.get(item.productionTrack) ?? [];
    list.push(item.id);
    itemIdsByTrack.set(item.productionTrack, list);
  }

  const results: Array<{ workOrderId: string; productionTrack: ProductionTrack; itemIds: string[] }> = [];
  for (const [track, itemIds] of itemIdsByTrack) {
    const result = await createWorkOrderForTrack(tx, {
      orderId: order.id,
      branchId: order.branchId,
      track,
      itemIds,
      requiresDesign: requiresDesignByTrack?.[track] ?? true,
      performedById,
    });
    if (result) results.push(result);
  }
  return results;
}

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super('Work order not found');
    this.name = 'WorkOrderNotFoundError';
  }
}

/**
 * FEATURE-012 (2026-08-14, owner: "لازم اكون أقدر أحذف أمر الشغل") — soft-
 * deletes the WorkOrder (same isDeleted/deletedAt/deletedBy pattern as
 * `deleteOrder`) and, if it has a WorkflowInstance, retires that too:
 * status → CANCELLED, isDeleted → true, and any still-open StageInstance
 * (WAITING/IN_PROGRESS) → FAILED. The FAILED flip matters — `getDepartmentQueue`
 * filters purely on `stageInstance.status IN (WAITING, IN_PROGRESS)` and
 * never looks at `isDeleted`, so leaving an open stage behind would keep a
 * deleted work order's job visible in a department's live queue. Nothing is
 * hard-deleted — this is the same "never erase production history" rule the
 * rest of the Workflow Engine follows, just reached via delete instead of
 * reaching "تسليم".
 */
/**
 * The transaction-scoped body of soft-deleting a WorkOrder — extracted so
 * `orderService.updateOrder` can reuse the exact same logic when an edit
 * removes every item of a track that already had an active WorkOrder
 * ("أمر شغل مستقل لكل صنف حسب مساره", 2026-08-16), instead of duplicating
 * it. Caller supplies the already-loaded `workflowInstance` (with its
 * `stageInstances`) since both call sites already have it in hand from
 * their own upstream `findUnique`/`findMany`.
 */
export async function softDeleteWorkOrderTx(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  workflowInstance: { id: string; stageInstances: { id: string; status: string }[] } | null,
  deletedBy: string,
): Promise<void> {
  await tx.workOrder.update({
    where: { id: workOrderId },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });

  if (workflowInstance) {
    const now = new Date();
    const openStageInstanceIds = workflowInstance.stageInstances
      .filter((s) => s.status === 'WAITING' || s.status === 'IN_PROGRESS')
      .map((s) => s.id);
    if (openStageInstanceIds.length > 0) {
      await tx.stageInstance.updateMany({
        where: { id: { in: openStageInstanceIds } },
        data: { status: 'FAILED', finishedAt: now },
      });
    }
    await tx.workflowInstance.update({
      where: { id: workflowInstance.id },
      data: { status: 'CANCELLED', isDeleted: true, currentStageId: null },
    });
    await recordWorkflowEvent(tx, {
      workflowInstanceId: workflowInstance.id,
      eventType: 'INSTANCE_CANCELLED',
      payload: { reason: 'WORK_ORDER_DELETED', workOrderId },
      performedById: deletedBy,
    });
  }
}

export async function deleteWorkOrder(
  workOrderId: string,
  deletedBy: string,
): Promise<{ branchId: string; partnerId: string | null }> {
  const existing = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      workflowInstance: { include: { stageInstances: true } },
      order: { select: { partnerId: true } },
    },
  });
  if (!existing || existing.isDeleted) {
    throw new WorkOrderNotFoundError();
  }

  await prisma.$transaction(async (tx) => {
    await softDeleteWorkOrderTx(tx, workOrderId, existing.workflowInstance, deletedBy);
  });

  return { branchId: existing.branchId, partnerId: existing.order.partnerId };
}
