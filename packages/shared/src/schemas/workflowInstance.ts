import { z } from 'zod';

export const workflowInstanceStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const stageInstanceStatusSchema = z.enum(['WAITING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'FAILED']);
export const workflowPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

/**
 * `stageName`/`departmentName` are denormalized display fields (joined at
 * mapping time, not stored columns) — a department queue lists stage
 * instances across many different workflow instances/templates at once,
 * and needs them without an N+1 lookup per row.
 *
 * `isDelayed` is computed (dueDate in the past and status still open),
 * never stored — see FEATURE-004 01_ANALYSIS.md's Queue Metadata
 * reasoning. Internal-only fields (department, assignee, cost, notes,
 * internal reasons) are nulled for a caller without internal visibility —
 * the same `canSeeInternal`-shaped, one-DTO pattern as Quotation/Order.
 */
export const stageInstanceSchema = z.object({
  id: z.string().uuid(),
  workflowInstanceId: z.string().uuid(),
  stageId: z.string().uuid(),
  stageName: z.string(),
  stageType: z.enum(['INTERNAL', 'EXTERNAL']),
  departmentId: z.string().uuid().nullable(),
  departmentName: z.string().nullable(),
  status: stageInstanceStatusSchema,
  assignedEmployeeId: z.string().uuid().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  estimatedDurationMinutes: z.number().int().nullable(),
  actualDurationMinutes: z.number().int().nullable(),
  waitingReason: z.string().nullable(),
  blockingReason: z.string().nullable(),
  notes: z.string().nullable(),
  priority: workflowPrioritySchema,
  dueDate: z.string().nullable(),
  isDelayed: z.boolean(),
  variableValues: z.record(z.string(), z.unknown()).nullable(),
  assignedSupplierId: z.string().uuid().nullable(),
  sentDate: z.string().nullable(),
  expectedReturnDate: z.string().nullable(),
  actualReturnDate: z.string().nullable(),
  externalCost: z.number().nullable(),
  supplierStatus: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workflowInstanceSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  templateName: z.string(),
  templateVersion: z.number().int(),
  workOrderId: z.string().uuid().nullable(),
  status: workflowInstanceStatusSchema,
  currentStageId: z.string().uuid().nullable(),
  stageInstances: z.array(stageInstanceSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * The one mutation path for a `WorkflowInstance`'s current stage — the
 * server resolves the destination from the current stage's own
 * `nextStageId`/`failureStageId`; the caller only states the *outcome*,
 * never a target stage id (that would be a route/frontend encoding "what
 * comes after Design," exactly what the engine must own alone).
 */
export const advanceWorkflowInstanceSchema = z.object({
  action: z.enum(['COMPLETE', 'FAIL', 'SKIP']),
  variableValues: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Queue metadata (FEATURE-004 Refinement 4) and External Supplier Workflow
 * fields (VISION.md) on the current, still-open stage instance —
 * reassignment, priority, due date, waiting/blocking reason, and (for an
 * EXTERNAL stage) supplier/sent-date/return-date/cost/status. Deliberately
 * separate from `advanceWorkflowInstanceSchema`: this never changes
 * `status` or moves the workflow to another stage, so it never writes a
 * `WorkflowEvent` (only state *transitions* do) — it's metadata editing,
 * not a transition.
 */
export const updateStageInstanceSchema = z.object({
  priority: workflowPrioritySchema.optional(),
  dueDate: z.string().nullable().optional(),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
  waitingReason: z.string().trim().max(500).nullable().optional(),
  blockingReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  assignedSupplierId: z.string().uuid().nullable().optional(),
  sentDate: z.string().nullable().optional(),
  expectedReturnDate: z.string().nullable().optional(),
  actualReturnDate: z.string().nullable().optional(),
  externalCost: z.number().nonnegative().nullable().optional(),
  supplierStatus: z.string().trim().max(200).nullable().optional(),
});

/** A department queue row — a `StageInstance` plus enough of its parent job to be useful without a second call. */
export const workflowQueueItemSchema = stageInstanceSchema.extend({
  workOrderId: z.string().uuid().nullable(),
  workOrderNumber: z.string().nullable(),
  /** FEATURE-005 Sprint 2.5 — `Order.partner.nameAr`, nullable to match `workOrderNumber`. */
  customerName: z.string().nullable(),
});

/**
 * FEATURE-005 Sprint 2 — the Production Dashboard's aggregate read.
 * Every count here is a grouping of the same open `StageInstance` rows
 * `getDepartmentQueue` already reads, using the same `computeIsDelayed`
 * — never a second calculation. See `02_PLAN.md`.
 */
export const departmentJobSummarySchema = z.object({
  departmentId: z.string().uuid(),
  departmentName: z.string(),
  waiting: z.number().int(),
  inProgress: z.number().int(),
  delayed: z.number().int(),
});

export const operatorJobSummarySchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  waiting: z.number().int(),
  inProgress: z.number().int(),
  delayed: z.number().int(),
});

export const supplierDelaySummarySchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  delayedCount: z.number().int(),
});

export const workflowDashboardSummarySchema = z.object({
  totals: z.object({
    activeWorkOrders: z.number().int(),
    waiting: z.number().int(),
    inProgress: z.number().int(),
    delayed: z.number().int(),
  }),
  byDepartment: z.array(departmentJobSummarySchema),
  byOperator: z.array(operatorJobSummarySchema),
  supplierDelays: z.array(supplierDelaySummarySchema),
  dailyProductionCount: z.number().int(),
  /** FEATURE-005 Sprint 2.5 — STAGE_FAILED events today, same window/pattern as `dailyProductionCount`. */
  failedToday: z.number().int(),
});

export type WorkflowInstanceStatus = z.infer<typeof workflowInstanceStatusSchema>;
export type StageInstanceStatus = z.infer<typeof stageInstanceStatusSchema>;
export type WorkflowPriority = z.infer<typeof workflowPrioritySchema>;
export type StageInstance = z.infer<typeof stageInstanceSchema>;
export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>;
export type AdvanceWorkflowInstanceInput = z.infer<typeof advanceWorkflowInstanceSchema>;
export type UpdateStageInstanceInput = z.infer<typeof updateStageInstanceSchema>;
export type WorkflowQueueItem = z.infer<typeof workflowQueueItemSchema>;
export type DepartmentJobSummary = z.infer<typeof departmentJobSummarySchema>;
export type OperatorJobSummary = z.infer<typeof operatorJobSummarySchema>;
export type SupplierDelaySummary = z.infer<typeof supplierDelaySummarySchema>;
export type WorkflowDashboardSummary = z.infer<typeof workflowDashboardSummarySchema>;
