import type { Prisma } from '../generated/prisma/client.js';
import type { WorkOrder } from '@cleopatra/shared';
import { WORKFLOW_INSTANCE_INCLUDE, mapWorkflowInstanceToDto } from './workflowInstanceService.js';

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
