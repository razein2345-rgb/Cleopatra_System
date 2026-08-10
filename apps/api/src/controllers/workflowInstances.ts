import type { Request, Response } from 'express';
import { advanceWorkflowInstanceSchema, hasPermission, updateStageInstanceSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  IllegalStageTransitionError,
  MissingRequiredVariablesError,
  WORKFLOW_INSTANCE_INCLUDE,
  advanceWorkflowInstance,
  getDepartmentQueue,
  getWorkflowDashboardSummary,
  mapWorkflowInstanceToDto,
  updateCurrentStageInstance,
} from '../services/workflowInstanceService.js';
import { accessibleDepartmentScope, canAccessDepartment } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';

function canSeeInternal(req: Request): boolean {
  return hasPermission(req.auth!.permissions, 'work-orders.edit');
}

export async function getWorkflowInstance(req: Request<{ id: string }>, res: Response) {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: req.params.id },
    include: WORKFLOW_INSTANCE_INCLUDE,
  });
  if (!instance || instance.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow instance not found' } });
    return;
  }
  res.json({ success: true, data: mapWorkflowInstanceToDto(instance, canSeeInternal(req)) });
}

/**
 * The one mutation path for moving a `WorkflowInstance`'s current stage —
 * the destination is resolved entirely from the current stage's own
 * `nextStageId`/`failureStageId` inside `advanceWorkflowInstance`; this
 * controller only validates input, checks permission, and maps errors.
 */
export async function advanceWorkflowInstanceHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = advanceWorkflowInstanceSchema.parse(req.body);

  const existing = await prisma.workflowInstance.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow instance not found' } });
    return;
  }

  let updated;
  try {
    updated = await advanceWorkflowInstance(existing.id, input, auth.staffId);
  } catch (err) {
    if (err instanceof IllegalStageTransitionError) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'ILLEGAL_STAGE_TRANSITION' },
      });
      return;
    }
    if (err instanceof MissingRequiredVariablesError) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'MISSING_REQUIRED_VARIABLES', missingKeys: err.missingKeys },
      });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'WorkflowInstance',
    entityId: updated.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    previousValue: { currentStageId: existing.currentStageId },
    newValue: { action: input.action, currentStageId: updated.currentStageId, status: updated.status },
  });

  res.json({ success: true, data: mapWorkflowInstanceToDto(updated, true) });
}

/**
 * Queue metadata editing (priority/due date/assignee/waiting reason) on the
 * current, still-open stage instance — deliberately separate from
 * `advanceWorkflowInstanceHandler`: this never changes status or moves the
 * workflow, so no `WorkflowEvent` is written.
 */
export async function updateCurrentStageInstanceHandler(req: Request<{ id: string }>, res: Response) {
  const input = updateStageInstanceSchema.parse(req.body);

  let updated;
  try {
    updated = await updateCurrentStageInstance(req.params.id, input);
  } catch (err) {
    if (err instanceof IllegalStageTransitionError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  res.json({ success: true, data: mapWorkflowInstanceToDto(updated, true) });
}

/**
 * The Queue View (00_REQUIREMENTS.md §8/§12) — always internal (no
 * customer caller ever requests a department queue). Department-scoped:
 * `canAccessDepartment` rejects a caller asking for a queue outside their
 * own department, the same way `canAccessBranch` already scopes branches.
 */
export async function getWorkflowQueue(req: Request, res: Response) {
  const auth = req.auth!;
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
  if (!departmentId) {
    res.status(400).json({ success: false, error: { message: 'departmentId query parameter is required' } });
    return;
  }
  if (!canAccessDepartment(auth, departmentId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this department' } });
    return;
  }

  const items = await getDepartmentQueue(departmentId);
  res.json({ success: true, data: items });
}

/**
 * The Production Dashboard's aggregate read (FEATURE-005 Sprint 2) —
 * always internal, scoped to the caller's own department access exactly
 * like `getWorkflowQueue` above, just across every accessible department
 * in one call instead of one department per call.
 */
export async function getWorkflowDashboardSummaryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const summary = await getWorkflowDashboardSummary(accessibleDepartmentScope(auth));
  res.json({ success: true, data: summary });
}
