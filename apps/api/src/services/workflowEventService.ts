import type { Prisma } from '../generated/prisma/client.js';
import type { WorkflowEventType } from '../generated/prisma/enums.js';

type RecordWorkflowEventParams = {
  workflowInstanceId: string;
  stageInstanceId?: string | null;
  eventType: WorkflowEventType;
  payload: object;
  performedById?: string | null;
};

/**
 * The one place a `WorkflowEvent` is written (FEATURE-004 Refinement 3) —
 * always inside the same transaction as the state change it records, never
 * an afterthought. Distinct from `AuditLog` (`recordAudit`, security/
 * compliance) — both are written for the same transition; neither replaces
 * the other. See 01_ANALYSIS.md's Workflow Events reasoning.
 */
export async function recordWorkflowEvent(
  tx: Prisma.TransactionClient,
  params: RecordWorkflowEventParams,
): Promise<void> {
  await tx.workflowEvent.create({
    data: {
      workflowInstanceId: params.workflowInstanceId,
      stageInstanceId: params.stageInstanceId ?? null,
      eventType: params.eventType,
      payload: params.payload as Prisma.InputJsonValue,
      performedById: params.performedById ?? null,
    },
  });
}
