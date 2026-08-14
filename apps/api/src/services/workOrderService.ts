import type { Prisma } from '../generated/prisma/client.js';
import type { WorkOrder } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { WORKFLOW_INSTANCE_INCLUDE, mapWorkflowInstanceToDto } from './workflowInstanceService.js';
import { recordWorkflowEvent } from './workflowEventService.js';

export const WORK_ORDER_INCLUDE = {
  workflowInstance: { include: WORKFLOW_INSTANCE_INCLUDE },
} satisfies Prisma.WorkOrderInclude;

type WorkOrderRecord = Prisma.WorkOrderGetPayload<{ include: typeof WORK_ORDER_INCLUDE }>;

/**
 * `productionStatus` is deliberately never read here — deprecated (see its
 * own schema doc comment); `workflowInstance` is the real state.
 */
export function mapWorkOrderToDto(record: WorkOrderRecord, canSeeInternal: boolean): WorkOrder {
  return {
    id: record.id,
    workOrderNumber: record.workOrderNumber,
    orderId: record.orderId,
    branchId: record.branchId,
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
export async function deleteWorkOrder(
  workOrderId: string,
  deletedBy: string,
): Promise<{ branchId: string; partnerId: string }> {
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
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });

    if (existing.workflowInstance) {
      const now = new Date();
      const openStageInstanceIds = existing.workflowInstance.stageInstances
        .filter((s) => s.status === 'WAITING' || s.status === 'IN_PROGRESS')
        .map((s) => s.id);
      if (openStageInstanceIds.length > 0) {
        await tx.stageInstance.updateMany({
          where: { id: { in: openStageInstanceIds } },
          data: { status: 'FAILED', finishedAt: now },
        });
      }
      await tx.workflowInstance.update({
        where: { id: existing.workflowInstance.id },
        data: { status: 'CANCELLED', isDeleted: true, currentStageId: null },
      });
      await recordWorkflowEvent(tx, {
        workflowInstanceId: existing.workflowInstance.id,
        eventType: 'INSTANCE_CANCELLED',
        payload: { reason: 'WORK_ORDER_DELETED', workOrderId },
        performedById: deletedBy,
      });
    }
  });

  return { branchId: existing.branchId, partnerId: existing.order.partnerId };
}
