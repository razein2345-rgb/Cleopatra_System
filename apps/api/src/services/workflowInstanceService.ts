import type { Prisma } from '../generated/prisma/client.js';
import type {
  AdvanceWorkflowInstanceInput,
  StageInstance,
  StageInstanceStatus,
  UpdateStageInstanceInput,
  WorkflowDashboardSummary,
  WorkflowInstance,
  WorkflowInstanceListItem,
  WorkflowInstanceStatus,
  WorkflowQueueItem,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { recordWorkflowEvent } from './workflowEventService.js';

const STAGE_INSTANCE_INCLUDE = {
  stage: { select: { name: true, stageType: true, customerVisible: true, internalVisible: true } },
  department: { select: { name: true } },
} satisfies Prisma.StageInstanceInclude;

export const WORKFLOW_INSTANCE_INCLUDE = {
  template: { select: { name: true, version: true } },
  stageInstances: { include: STAGE_INSTANCE_INCLUDE, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.WorkflowInstanceInclude;

type StageInstanceRecord = Prisma.StageInstanceGetPayload<{ include: typeof STAGE_INSTANCE_INCLUDE }>;
type WorkflowInstanceRecord = Prisma.WorkflowInstanceGetPayload<{ include: typeof WORKFLOW_INSTANCE_INCLUDE }>;

/**
 * Delay is deliberately never a stored column — computed here from
 * `dueDate` at read time (FEATURE-004 01_ANALYSIS.md's Queue Metadata
 * reasoning: a stored flag needs active maintenance a scheduler this
 * milestone doesn't build, and a stale flag is worse than none).
 */
export function computeIsDelayed(dueDate: Date | null, status: StageInstanceStatus): boolean {
  if (!dueDate) return false;
  if (status === 'DONE' || status === 'SKIPPED') return false;
  return dueDate.getTime() < Date.now();
}

/**
 * `canSeeInternal` mirrors `mapQuotationToDto`/`mapOrderToDto` exactly —
 * department, assignee, cost, internal notes/reasons, and variable answers
 * are nulled for a caller without internal visibility, never a second
 * response type (FEATURE-004 00_REQUIREMENTS.md §9).
 */
export function mapStageInstanceToDto(record: StageInstanceRecord, canSeeInternal: boolean): StageInstance {
  return {
    id: record.id,
    workflowInstanceId: record.workflowInstanceId,
    stageId: record.stageId,
    stageName: record.stage.name,
    stageType: record.stage.stageType,
    departmentId: canSeeInternal ? record.departmentId : null,
    departmentName: canSeeInternal ? (record.department?.name ?? null) : null,
    status: record.status,
    assignedEmployeeId: canSeeInternal ? record.assignedEmployeeId : null,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
    estimatedDurationMinutes: canSeeInternal ? record.estimatedDurationMinutes : null,
    actualDurationMinutes: canSeeInternal ? record.actualDurationMinutes : null,
    waitingReason: canSeeInternal ? record.waitingReason : null,
    blockingReason: canSeeInternal ? record.blockingReason : null,
    notes: canSeeInternal ? record.notes : null,
    priority: record.priority,
    dueDate: record.dueDate ? record.dueDate.toISOString() : null,
    isDelayed: computeIsDelayed(record.dueDate, record.status),
    variableValues: canSeeInternal ? ((record.variableValues as Record<string, unknown> | null) ?? null) : null,
    assignedSupplierId: canSeeInternal ? record.assignedSupplierId : null,
    sentDate: record.sentDate ? record.sentDate.toISOString() : null,
    expectedReturnDate: record.expectedReturnDate ? record.expectedReturnDate.toISOString() : null,
    actualReturnDate: record.actualReturnDate ? record.actualReturnDate.toISOString() : null,
    externalCost: canSeeInternal && record.externalCost ? record.externalCost.toNumber() : null,
    supplierStatus: record.supplierStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * A stage instance whose stage isn't `customerVisible` is entirely absent
 * for a caller without internal visibility — not just field-redacted —
 * per the stage's own visibility configuration (VISION.md's Workflow
 * Visibility). Internal callers see every stage instance.
 */
export function mapWorkflowInstanceToDto(
  record: WorkflowInstanceRecord,
  canSeeInternal: boolean,
): WorkflowInstance {
  const visible = canSeeInternal
    ? record.stageInstances
    : record.stageInstances.filter((si) => si.stage.customerVisible);
  return {
    id: record.id,
    templateId: record.templateId,
    templateName: record.template.name,
    templateVersion: record.template.version,
    workOrderId: record.workOrderId,
    status: record.status,
    currentStageId: record.currentStageId,
    stageInstances: visible.map((si) => mapStageInstanceToDto(si, canSeeInternal)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class IllegalStageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStageTransitionError';
  }
}

export class MissingRequiredVariablesError extends Error {
  missingKeys: string[];
  constructor(missingKeys: string[]) {
    super(`Missing required variables: ${missingKeys.join(', ')}`);
    this.name = 'MissingRequiredVariablesError';
    this.missingKeys = missingKeys;
  }
}

/** Pure guard — the instance must still be running, and SKIP is only legal when its stage allows it. */
export function assertLegalStageAction(
  instanceStatus: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  stage: { canSkip: boolean },
  action: AdvanceWorkflowInstanceInput['action'],
): void {
  if (instanceStatus !== 'IN_PROGRESS') {
    throw new IllegalStageTransitionError('This workflow instance is no longer in progress');
  }
  if (action === 'SKIP' && !stage.canSkip) {
    throw new IllegalStageTransitionError('This stage cannot be skipped');
  }
}

/** Pure guard — every required `WorkflowStageVariable` must have an answer before a stage may be marked COMPLETE. */
export function assertRequiredVariablesPresent(
  variables: Array<{ key: string; isRequired: boolean }>,
  values: Record<string, unknown> | null | undefined,
): void {
  const missing = variables.filter((v) => {
    if (!v.isRequired) return false;
    const value = values?.[v.key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw new MissingRequiredVariablesError(missing.map((v) => v.key));
  }
}

export class WorkflowNoStagesError extends Error {
  constructor() {
    super('This workflow template version has no stages');
    this.name = 'WorkflowNoStagesError';
  }
}

/**
 * FEATURE-010 (2026-08-14) — the one shared transition core: close the
 * current `StageInstance`, fire its event, then open the next stage or end
 * the instance if there is none. Extracted so `advanceWorkflowInstance`
 * (a manual action) and `createWorkflowInstance`'s design auto-skip (an
 * automatic one, same SKIP semantics, triggered right at creation instead
 * of by a later user click) are never two diverging copies of the same
 * logic — exactly the "لا تخترع آلية موازية" the owner asked for when
 * "Requires Design" was defined.
 */
async function applyStageTransition(
  tx: Prisma.TransactionClient,
  params: {
    instanceId: string;
    currentStageInstanceId: string;
    currentStage: { id: string; name: string; nextStageId: string | null; failureStageId: string | null };
    action: 'COMPLETE' | 'SKIP' | 'FAIL';
    variableValues?: Record<string, unknown>;
    notes?: string;
    performedById: string;
  },
): Promise<{ stageInstanceId: string }> {
  const now = new Date();
  const newCurrentStatus = params.action === 'COMPLETE' ? 'DONE' : params.action === 'SKIP' ? 'SKIPPED' : 'FAILED';
  const destinationStageId =
    params.action === 'FAIL' ? params.currentStage.failureStageId : params.currentStage.nextStageId;

  const currentStageInstance = await tx.stageInstance.findUniqueOrThrow({ where: { id: params.currentStageInstanceId } });
  const updatedCurrent = await tx.stageInstance.update({
    where: { id: params.currentStageInstanceId },
    data: {
      status: newCurrentStatus,
      finishedAt: now,
      actualDurationMinutes: currentStageInstance.startedAt
        ? Math.round((now.getTime() - currentStageInstance.startedAt.getTime()) / 60000)
        : null,
      variableValues: (params.variableValues ?? currentStageInstance.variableValues ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      notes: params.notes ?? currentStageInstance.notes,
    },
  });

  await recordWorkflowEvent(tx, {
    workflowInstanceId: params.instanceId,
    stageInstanceId: updatedCurrent.id,
    eventType: params.action === 'COMPLETE' ? 'STAGE_COMPLETED' : params.action === 'SKIP' ? 'STAGE_SKIPPED' : 'STAGE_FAILED',
    payload: { stageId: params.currentStage.id, stageName: params.currentStage.name },
    performedById: params.performedById,
  });

  if (!destinationStageId) {
    const finalStatus = params.action === 'FAIL' ? 'CANCELLED' : 'COMPLETED';
    await tx.workflowInstance.update({
      where: { id: params.instanceId },
      data: { status: finalStatus, currentStageId: null },
    });
    await recordWorkflowEvent(tx, {
      workflowInstanceId: params.instanceId,
      eventType: finalStatus === 'COMPLETED' ? 'INSTANCE_COMPLETED' : 'INSTANCE_CANCELLED',
      payload: { finalStageId: params.currentStage.id },
      performedById: params.performedById,
    });
    return { stageInstanceId: updatedCurrent.id };
  }

  const nextStage = await tx.workflowStage.findUniqueOrThrow({ where: { id: destinationStageId } });
  const newStageInstance = await tx.stageInstance.create({
    data: {
      workflowInstanceId: params.instanceId,
      stageId: nextStage.id,
      departmentId: nextStage.departmentId,
      status: 'IN_PROGRESS',
      assignedEmployeeId: nextStage.defaultAssignedEmployeeId,
      estimatedDurationMinutes: nextStage.estimatedDurationMinutes,
      startedAt: now,
    },
  });
  await tx.workflowInstance.update({
    where: { id: params.instanceId },
    data: { currentStageId: nextStage.id },
  });
  await recordWorkflowEvent(tx, {
    workflowInstanceId: params.instanceId,
    stageInstanceId: newStageInstance.id,
    eventType: 'STAGE_STARTED',
    payload: { stageId: nextStage.id, stageName: nextStage.name, departmentId: nextStage.departmentId },
    performedById: params.performedById,
  });

  return { stageInstanceId: newStageInstance.id };
}

/**
 * Creates a `WorkflowInstance` starting on a template version's first stage
 * (lowest `order`) plus that stage's `StageInstance`, and records the
 * `INSTANCE_STARTED`/`STAGE_STARTED` events — always called inside the same
 * transaction that creates the owning business record (today: `WorkOrder`).
 *
 * FEATURE-010 (2026-08-14, owner: "عند إنشاء الطلب يجب أن يكون واضحًا هل:
 * Requires Design = نعم / لا") — when the starting stage is a DESIGN-
 * department stage marked `canSkip` and the caller passes
 * `requiresDesign: false`, it's auto-skipped immediately via the same
 * `applyStageTransition` core a manual SKIP uses, landing the instance on
 * whatever comes next. Only ever applies to the very first stage — never a
 * general "skip cascade."
 */
export async function createWorkflowInstance(
  tx: Prisma.TransactionClient,
  params: { templateId: string; workOrderId: string; performedById: string; requiresDesign?: boolean },
): Promise<{ instanceId: string; stageInstanceId: string }> {
  const startingStage = await tx.workflowStage.findFirst({
    where: { templateId: params.templateId },
    orderBy: { order: 'asc' },
    include: { department: { select: { code: true } } },
  });
  if (!startingStage) {
    throw new WorkflowNoStagesError();
  }

  const instance = await tx.workflowInstance.create({
    data: {
      templateId: params.templateId,
      workOrderId: params.workOrderId,
      status: 'IN_PROGRESS',
      currentStageId: startingStage.id,
    },
  });

  const now = new Date();
  const stageInstance = await tx.stageInstance.create({
    data: {
      workflowInstanceId: instance.id,
      stageId: startingStage.id,
      departmentId: startingStage.departmentId,
      status: 'IN_PROGRESS',
      assignedEmployeeId: startingStage.defaultAssignedEmployeeId,
      estimatedDurationMinutes: startingStage.estimatedDurationMinutes,
      startedAt: now,
    },
  });

  await recordWorkflowEvent(tx, {
    workflowInstanceId: instance.id,
    eventType: 'INSTANCE_STARTED',
    payload: { templateId: params.templateId },
    performedById: params.performedById,
  });
  await recordWorkflowEvent(tx, {
    workflowInstanceId: instance.id,
    stageInstanceId: stageInstance.id,
    eventType: 'STAGE_STARTED',
    payload: { stageId: startingStage.id, stageName: startingStage.name, departmentId: startingStage.departmentId },
    performedById: params.performedById,
  });

  if (params.requiresDesign === false && startingStage.department?.code === 'DESIGN' && startingStage.canSkip) {
    const result = await applyStageTransition(tx, {
      instanceId: instance.id,
      currentStageInstanceId: stageInstance.id,
      currentStage: startingStage,
      action: 'SKIP',
      performedById: params.performedById,
    });
    return { instanceId: instance.id, stageInstanceId: result.stageInstanceId };
  }

  return { instanceId: instance.id, stageInstanceId: stageInstance.id };
}

/**
 * The one mutation path for advancing a `WorkflowInstance` (FEATURE-004
 * 02_PLAN.md's Business Rules) — the destination stage is read only from
 * the *current* stage's own `nextStageId`/`failureStageId`; no other code
 * decides "what comes after Design." When neither is configured, the
 * instance ends (`COMPLETED` for COMPLETE/SKIP, `CANCELLED` for FAIL).
 */
export async function advanceWorkflowInstance(
  instanceId: string,
  input: AdvanceWorkflowInstanceInput,
  performedById: string,
): Promise<WorkflowInstanceRecord> {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { currentStage: { include: { variables: true } } },
  });
  if (!instance || instance.isDeleted || !instance.currentStage) {
    throw new IllegalStageTransitionError('Workflow instance or current stage not found');
  }

  const currentStageInstance = await prisma.stageInstance.findFirst({
    where: {
      workflowInstanceId: instance.id,
      stageId: instance.currentStage.id,
      status: { in: ['WAITING', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!currentStageInstance) {
    throw new IllegalStageTransitionError('No open stage instance for the current stage');
  }

  assertLegalStageAction(instance.status, instance.currentStage, input.action);
  if (input.action === 'COMPLETE') {
    assertRequiredVariablesPresent(instance.currentStage.variables, input.variableValues);
  }

  const destinationStageId = input.action === 'FAIL' ? instance.currentStage.failureStageId : instance.currentStage.nextStageId;
  const newCurrentStatus = input.action === 'COMPLETE' ? 'DONE' : input.action === 'SKIP' ? 'SKIPPED' : 'FAILED';

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updatedCurrent = await tx.stageInstance.update({
      where: { id: currentStageInstance.id },
      data: {
        status: newCurrentStatus,
        finishedAt: now,
        actualDurationMinutes: currentStageInstance.startedAt
          ? Math.round((now.getTime() - currentStageInstance.startedAt.getTime()) / 60000)
          : null,
        variableValues: (input.variableValues ?? currentStageInstance.variableValues ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        notes: input.notes ?? currentStageInstance.notes,
      },
    });

    await recordWorkflowEvent(tx, {
      workflowInstanceId: instance.id,
      stageInstanceId: updatedCurrent.id,
      eventType: input.action === 'COMPLETE' ? 'STAGE_COMPLETED' : input.action === 'SKIP' ? 'STAGE_SKIPPED' : 'STAGE_FAILED',
      payload: { stageId: instance.currentStage!.id, stageName: instance.currentStage!.name },
      performedById,
    });

    if (!destinationStageId) {
      const finalStatus = input.action === 'FAIL' ? 'CANCELLED' : 'COMPLETED';
      await tx.workflowInstance.update({
        where: { id: instance.id },
        data: { status: finalStatus, currentStageId: null },
      });
      await recordWorkflowEvent(tx, {
        workflowInstanceId: instance.id,
        eventType: finalStatus === 'COMPLETED' ? 'INSTANCE_COMPLETED' : 'INSTANCE_CANCELLED',
        payload: { finalStageId: instance.currentStage!.id },
        performedById,
      });
      return;
    }

    const nextStage = await tx.workflowStage.findUniqueOrThrow({ where: { id: destinationStageId } });
    const newStageInstance = await tx.stageInstance.create({
      data: {
        workflowInstanceId: instance.id,
        stageId: nextStage.id,
        departmentId: nextStage.departmentId,
        status: 'IN_PROGRESS',
        assignedEmployeeId: nextStage.defaultAssignedEmployeeId,
        estimatedDurationMinutes: nextStage.estimatedDurationMinutes,
        startedAt: now,
      },
    });
    await tx.workflowInstance.update({
      where: { id: instance.id },
      data: { currentStageId: nextStage.id },
    });
    await recordWorkflowEvent(tx, {
      workflowInstanceId: instance.id,
      stageInstanceId: newStageInstance.id,
      eventType: 'STAGE_STARTED',
      payload: { stageId: nextStage.id, stageName: nextStage.name, departmentId: nextStage.departmentId },
      performedById,
    });
  });

  return prisma.workflowInstance.findUniqueOrThrow({
    where: { id: instance.id },
    include: WORKFLOW_INSTANCE_INCLUDE,
  });
}

/**
 * The Queue View capability (FEATURE-004 00_REQUIREMENTS.md §8/§12) —
 * open `StageInstance` rows for one department, ordered by priority then
 * due date. Always internal (production-floor only; no customer caller
 * ever requests a department queue).
 */
export async function getDepartmentQueue(departmentId: string): Promise<WorkflowQueueItem[]> {
  const rows = await prisma.stageInstance.findMany({
    where: { departmentId, status: { in: ['WAITING', 'IN_PROGRESS'] } },
    include: {
      ...STAGE_INSTANCE_INCLUDE,
      workflowInstance: {
        select: {
          workOrderId: true,
          workOrder: {
            select: { workOrderNumber: true, order: { select: { partner: { select: { nameAr: true } } } } },
          },
        },
      },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    ...mapStageInstanceToDto(row, true),
    workOrderId: row.workflowInstance.workOrderId,
    workOrderNumber: row.workflowInstance.workOrder?.workOrderNumber ?? null,
    customerName: row.workflowInstance.workOrder?.order.partner.nameAr ?? null,
  }));
}

const WORKFLOW_INSTANCE_LIST_INCLUDE = {
  ...WORKFLOW_INSTANCE_INCLUDE,
  workOrder: {
    select: { workOrderNumber: true, order: { select: { partner: { select: { nameAr: true } } } } },
  },
} satisfies Prisma.WorkflowInstanceInclude;

type WorkflowInstanceListRecord = Prisma.WorkflowInstanceGetPayload<{ include: typeof WORKFLOW_INSTANCE_LIST_INCLUDE }>;

/**
 * FEATURE-010 (2026-08-14) — لوحة الإنتاج's "الطلبات" tab: every
 * `WorkflowInstance` (default `IN_PROGRESS`, i.e. still active), each with
 * its full ordered `stageInstances[]` (the visual stage chain) plus
 * `workOrderNumber`/`customerName` for display — same "extend the base
 * mapper with display fields" pattern as `getDepartmentQueue`'s
 * `WorkflowQueueItem`. Always internal (`canSeeInternal: true`) — same as
 * `getWorkflowQueue`, no customer caller exists yet.
 */
export async function listWorkflowInstances(status: WorkflowInstanceStatus): Promise<WorkflowInstanceListItem[]> {
  const rows = await prisma.workflowInstance.findMany({
    where: { isDeleted: false, status },
    include: WORKFLOW_INSTANCE_LIST_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row: WorkflowInstanceListRecord) => ({
    ...mapWorkflowInstanceToDto(row, true),
    workOrderNumber: row.workOrder?.workOrderNumber ?? null,
    customerName: row.workOrder?.order.partner.nameAr ?? null,
  }));
}

/**
 * Queue metadata editing (FEATURE-004 Refinement 4) — priority, due date,
 * assignee, waiting/blocking reason on the current, still-open stage
 * instance. Never changes `status` or moves the workflow, so it never
 * writes a `WorkflowEvent` (only real state transitions do — see
 * `advanceWorkflowInstance`).
 */
export async function updateCurrentStageInstance(
  workflowInstanceId: string,
  input: UpdateStageInstanceInput,
): Promise<WorkflowInstanceRecord> {
  const instance = await prisma.workflowInstance.findUnique({ where: { id: workflowInstanceId } });
  if (!instance || instance.isDeleted || !instance.currentStageId) {
    throw new IllegalStageTransitionError('Workflow instance or current stage not found');
  }

  const currentStageInstance = await prisma.stageInstance.findFirst({
    where: {
      workflowInstanceId: instance.id,
      stageId: instance.currentStageId,
      status: { in: ['WAITING', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!currentStageInstance) {
    throw new IllegalStageTransitionError('No open stage instance for the current stage');
  }

  const toDate = (value: string | null | undefined) =>
    value === undefined ? undefined : value ? new Date(value) : null;

  await prisma.stageInstance.update({
    where: { id: currentStageInstance.id },
    data: {
      priority: input.priority,
      dueDate: toDate(input.dueDate),
      assignedEmployeeId: input.assignedEmployeeId,
      waitingReason: input.waitingReason,
      blockingReason: input.blockingReason,
      notes: input.notes,
      assignedSupplierId: input.assignedSupplierId,
      sentDate: toDate(input.sentDate),
      expectedReturnDate: toDate(input.expectedReturnDate),
      actualReturnDate: toDate(input.actualReturnDate),
      externalCost: input.externalCost,
      supplierStatus: input.supplierStatus,
    },
  });

  return prisma.workflowInstance.findUniqueOrThrow({
    where: { id: instance.id },
    include: WORKFLOW_INSTANCE_INCLUDE,
  });
}

/**
 * The Production Dashboard's aggregate read (FEATURE-005 Sprint 2) —
 * covers every representative view VISION.md's Production Dashboard
 * section names (waiting/in-progress/delayed totals, by department, by
 * operator, supplier delays, daily production) from one query pass over
 * the same open `StageInstance` rows `getDepartmentQueue` already reads.
 * `computeIsDelayed` is reused, never recalculated. `departmentIds ===
 * 'all'` mirrors `canAccessDepartment`'s Super Admin/`work-orders.*`/`*`
 * bypass; otherwise the caller's own `accessibleDepartmentIds` scope the
 * query exactly like the per-department queue endpoint already does.
 */
export async function getWorkflowDashboardSummary(
  departmentIds: string[] | 'all',
): Promise<WorkflowDashboardSummary> {
  const departmentFilter: Prisma.StageInstanceWhereInput =
    departmentIds === 'all' ? {} : { departmentId: { in: departmentIds } };

  const rows = await prisma.stageInstance.findMany({
    where: { status: { in: ['WAITING', 'IN_PROGRESS'] }, ...departmentFilter },
    include: {
      department: { select: { id: true, name: true } },
      assignedEmployee: { select: { id: true, name: true } },
      assignedSupplier: { select: { id: true, nameAr: true } },
      workflowInstance: { select: { workOrderId: true } },
    },
  });

  const byDepartment = new Map<string, { departmentId: string; departmentName: string; waiting: number; inProgress: number; delayed: number }>();
  const byOperator = new Map<string, { employeeId: string; employeeName: string; waiting: number; inProgress: number; delayed: number }>();
  const supplierDelays = new Map<string, { supplierId: string; supplierName: string; delayedCount: number }>();
  const activeWorkOrderIds = new Set<string>();
  let waiting = 0;
  let inProgress = 0;
  let delayed = 0;

  for (const row of rows) {
    const isDelayed = computeIsDelayed(row.dueDate, row.status);
    if (row.status === 'WAITING') waiting += 1;
    if (row.status === 'IN_PROGRESS') inProgress += 1;
    if (isDelayed) delayed += 1;
    if (row.workflowInstance.workOrderId) activeWorkOrderIds.add(row.workflowInstance.workOrderId);

    if (row.department) {
      const entry = byDepartment.get(row.department.id) ?? {
        departmentId: row.department.id,
        departmentName: row.department.name,
        waiting: 0,
        inProgress: 0,
        delayed: 0,
      };
      if (row.status === 'WAITING') entry.waiting += 1;
      if (row.status === 'IN_PROGRESS') entry.inProgress += 1;
      if (isDelayed) entry.delayed += 1;
      byDepartment.set(row.department.id, entry);
    }

    if (row.assignedEmployee) {
      const entry = byOperator.get(row.assignedEmployee.id) ?? {
        employeeId: row.assignedEmployee.id,
        employeeName: row.assignedEmployee.name,
        waiting: 0,
        inProgress: 0,
        delayed: 0,
      };
      if (row.status === 'WAITING') entry.waiting += 1;
      if (row.status === 'IN_PROGRESS') entry.inProgress += 1;
      if (isDelayed) entry.delayed += 1;
      byOperator.set(row.assignedEmployee.id, entry);
    }

    if (row.assignedSupplier && isDelayed) {
      const entry = supplierDelays.get(row.assignedSupplier.id) ?? {
        supplierId: row.assignedSupplier.id,
        supplierName: row.assignedSupplier.nameAr,
        delayedCount: 0,
      };
      entry.delayedCount += 1;
      supplierDelays.set(row.assignedSupplier.id, entry);
    }
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dailyProductionCount = await prisma.workflowEvent.count({
    where: {
      eventType: 'STAGE_COMPLETED',
      occurredAt: { gte: todayStart },
      ...(departmentIds === 'all' ? {} : { stageInstance: { departmentId: { in: departmentIds } } }),
    },
  });
  const failedToday = await prisma.workflowEvent.count({
    where: {
      eventType: 'STAGE_FAILED',
      occurredAt: { gte: todayStart },
      ...(departmentIds === 'all' ? {} : { stageInstance: { departmentId: { in: departmentIds } } }),
    },
  });

  return {
    totals: {
      activeWorkOrders: activeWorkOrderIds.size,
      waiting,
      inProgress,
      delayed,
    },
    byDepartment: Array.from(byDepartment.values()),
    byOperator: Array.from(byOperator.values()),
    supplierDelays: Array.from(supplierDelays.values()),
    dailyProductionCount,
    failedToday,
  };
}
