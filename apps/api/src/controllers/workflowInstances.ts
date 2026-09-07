import type { Request, Response } from 'express';
import type { ProductionTrack, WorkflowInstanceStatus } from '@cleopatra/shared';
import { advanceWorkflowInstanceSchema, hasPermission, updateStageInstanceSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  IllegalStageTransitionError,
  MissingRequiredVariablesError,
  WORKFLOW_INSTANCE_INCLUDE,
  advanceWorkflowInstance,
  getAllQueue,
  getDepartmentQueue,
  getMyQueue,
  getTemplateQueue,
  getTrackQueue,
  getWorkflowDashboardSummary,
  listWorkflowInstances,
  mapWorkflowInstanceToDto,
  updateCurrentStageInstance,
} from '../services/workflowInstanceService.js';
import { listPublishedWorkflowTemplates, mapWorkflowTemplateToDto } from '../services/workflowTemplateService.js';
import { accessibleDepartmentScope, canAccessDepartment } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';

function canSeeInternal(req: Request): boolean {
  return hasPermission(req.auth!.permissions, 'work-orders.edit');
}

const LIST_STATUSES: readonly WorkflowInstanceStatus[] = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/**
 * FEATURE-010 (2026-08-14) — لوحة الإنتاج's "الطلبات" tab. Defaults to
 * `IN_PROGRESS` (the active orders view) since that's the only status this
 * tab ever needs today; `?status=` still accepts COMPLETED/CANCELLED for
 * completeness (e.g. a future "records/history" view) without a second
 * endpoint.
 */
export async function listWorkflowInstancesHandler(req: Request, res: Response) {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'IN_PROGRESS';
  if (!LIST_STATUSES.includes(rawStatus as WorkflowInstanceStatus)) {
    res.status(400).json({ success: false, error: { message: 'Invalid status query parameter' } });
    return;
  }
  const items = await listWorkflowInstances(rawStatus as WorkflowInstanceStatus);
  res.json({ success: true, data: items });
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
  const productionTrack =
    typeof req.query.productionTrack === 'string' ? (req.query.productionTrack as ProductionTrack) : undefined;
  const mine = req.query.mine === 'true';

  // UX_PRODUCT_AUDIT.md § مشكلة 5.1 — "مهامي اليوم": always the caller's
  // own StaffProfile id, never a client-supplied employeeId, so this needs
  // no department-access check (see getMyQueue's doc comment).
  if (mine) {
    const items = await getMyQueue(auth.staffId);
    res.json({ success: true, data: items });
    return;
  }

  // FEATURE-010 (2026-08-14) — لوحة الإنتاج's "الأقسام" sub-tabs: one
  // combined queue for every department in a track, instead of the caller
  // firing one request per department. Scoped to the caller's own
  // accessible departments, same as the dashboard summary; an empty
  // intersection is an empty queue, not a 403.
  if (productionTrack) {
    const items = await getTrackQueue(productionTrack, accessibleDepartmentScope(auth));
    res.json({ success: true, data: items });
    return;
  }

  // Owner (2026-09-07, "عايز كل الطلبات في مكان واحد وفي فلتر... افلتر
  // براحتي") — لوحة الإنتاج's new unified "الكل" view: every open stage
  // instance across every department this caller may see, one request
  // instead of one per track — track/department/priority/delayed slicing
  // all happen client-side from this single list. Explicit `?all=true`
  // (not just "no other param given") so a genuinely malformed request
  // still gets the 400 below instead of silently returning everything.
  if (req.query.all === 'true') {
    const items = await getAllQueue(accessibleDepartmentScope(auth));
    res.json({ success: true, data: items });
    return;
  }

  // Owner (2026-09-07, "عايز فيو مختلف يظهرلي فيه كل وورك فلو حسب اختياري
  // بيبانلي فيه كل الشغل اللي في الوورك فلو اللي اختارته") — لوحة الإنتاج's
  // Kanban-by-workflow view: every open stage instance for one specific
  // WorkflowTemplate version, across whichever departments its stages live
  // in, still scoped to what this caller may see.
  const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : undefined;
  if (templateId) {
    const items = await getTemplateQueue(templateId, accessibleDepartmentScope(auth));
    res.json({ success: true, data: items });
    return;
  }

  if (!departmentId) {
    res.status(400).json({
      success: false,
      error: { message: 'departmentId, productionTrack, mine, all, or templateId query parameter is required' },
    });
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
 * Owner (2026-09-07, "عايز فيو مختلف يظهرلي فيه كل وورك فلو حسب اختياري") —
 * the picker list for لوحة الإنتاج's Kanban-by-workflow view. Deliberately
 * gated by `work-orders.view` at the route level, not `workflow-templates.
 * view` (template *administration*, granted only to DESIGNER/Super Admin
 * today) — this is a read-only list of published templates for the
 * production floor to pick from, not a template-editing surface.
 */
export async function listWorkflowTemplatesForKanbanHandler(_req: Request, res: Response) {
  const templates = await listPublishedWorkflowTemplates();
  res.json({ success: true, data: templates.map(mapWorkflowTemplateToDto) });
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
