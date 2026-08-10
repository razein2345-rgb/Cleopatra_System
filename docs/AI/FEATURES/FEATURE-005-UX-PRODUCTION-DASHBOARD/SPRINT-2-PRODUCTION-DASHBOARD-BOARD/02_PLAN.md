# FEATURE-005 — Sprint 2 — Plan

Three milestones, each fully verified (typecheck/lint/build/test + live)
before the next begins, per this sprint's explicit instruction.

## Milestone 1 — `dashboard-summary` Aggregate Endpoint (Backend)

**Shared schema** (`packages/shared/src/schemas/workflowInstance.ts`):

```ts
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
});
```

**Service** (`getWorkflowDashboardSummary(accessibleDepartmentIds: string[] | 'all')`
in `workflowInstanceService.ts`): one query for open (`WAITING`/
`IN_PROGRESS`) `StageInstance` rows (scoped to the department set, or
unscoped for `'all'`), grouped in application code the same way
`getDepartmentQueue` already maps rows — reusing `computeIsDelayed`, not
reimplementing it; one `count()` on `WorkflowEvent` where
`eventType: 'STAGE_COMPLETED'` and `occurredAt >= todayStart` for
`dailyProductionCount`.

**Controller/route**: `getWorkflowDashboardSummary` handler on
`workflowInstancesRouter`, `GET /dashboard-summary`, registered *before*
`GET /:id` (same ordering reason `/queue` already documents — Express
would otherwise match `dashboard-summary` as an `:id`). Gated
`work-orders.view`; resolves the caller's department scope the same way
`getWorkflowQueue` resolves `canAccessDepartment` — Super Admin/
`work-orders.*`/`*` get `'all'`, everyone else gets their
`accessibleDepartmentIds`.

**Verification**: `typecheck`/`lint`/`build`/`test` (root), then a live
authenticated call to `GET /api/workflow-instances/dashboard-summary`
cross-checked against the same per-department queue calls Sprint 1's
live verification already used, confirming the aggregate total matches
the sum of the per-department calls.

## Milestone 2 — Production Board (Frontend)

New route `/production-board` (top-level Sidebar entry, `work-orders.view`
— the same permission the Dashboard's job widgets already require),
new page `ProductionBoardPage.tsx`:

- Department switcher (`Select`, Cleopatra-wrapped if reused a second
  time) populated from `GET /api/departments`.
- Queue table (existing `Table` shadcn primitive, first real consumer of
  it) rendering `GET /api/workflow-instances/queue?departmentId=`'s
  response: work order number, stage, `StatusBadge` for priority and for
  delayed/on-time, assignee, waiting reason.
- Row actions: Complete/Fail/Skip buttons (`PUT .../advance`) and an
  "Edit" action opening a `Dialog` for queue metadata
  (`PUT .../current-stage`) — priority, due date, assignee, waiting
  reason, and (only when the stage is `EXTERNAL`) the supplier fields.
- Errors (`ILLEGAL_STAGE_TRANSITION`, `MISSING_REQUIRED_VARIABLES`)
  surface inline, per-row — not a silent failure.

**Verification**: `typecheck`/`lint`/`build`, then live: switch
departments, confirm `canAccessDepartment` scoping (a department outside
the signed-in user's access isn't offered), advance a real stage end to
end if a live `WorkOrder`/`WorkflowInstance` exists in the environment
(if none exists, verification documents that explicitly rather than
fabricating one that doesn't reflect real usage).

## Milestone 3 — Dashboard Widgets on `dashboard-summary`

- `WorkflowQueueSummaryProvider` rewritten to call
  `GET /api/workflow-instances/dashboard-summary` once instead of
  `GET /api/departments` + N × `GET .../queue`. `ActiveWorkOrdersWidget`/
  `WaitingJobsWidget`/`DelayedJobsWidget` are unchanged — they read the
  provider's context, not its fetch mechanism.
- New widgets, registered in `DASHBOARD_WIDGETS` the same way Sprint 1's
  four already are: **Jobs by Department**, **Jobs by Operator**,
  **Supplier Delays**, **Daily Production** — each a small table/list
  inside the existing `DashboardWidget`/`Card` shape, reading
  `byDepartment`/`byOperator`/`supplierDelays`/`dailyProductionCount`
  directly from the shared provider (a second context value, or a
  second provider — decided during implementation based on whether the
  by-department/operator/supplier arrays are large enough to warrant a
  separate fetch; default to reusing one provider unless a real reason
  emerges not to).

**Verification**: `typecheck`/`lint`/`build`, then live: confirm every
new widget's numbers match the same live API response Milestone 1's
verification already captured (one source of truth, checked twice from
two different UI surfaces).

## Business Rules

**None.** Every number is a read of `WorkflowInstance`/`StageInstance`/
`WorkflowEvent` state the Workflow Engine already computes; every
mutation Production Board performs goes through
`advanceWorkflowInstance`/`updateCurrentStageInstance`, unchanged.

## Remaining Work (Explicitly Not This Sprint)

- Workflow Template authoring UI.
- Instance timeline view (FEATURE-004 `02_PLAN.md`'s original, still
  deferred, separately-scoped Milestone content — not named in this
  sprint's request).
- Any Marketing/AI Advisor capability from the just-approved `VISION.md`
  extension — documentation only, no implementation authorized yet.
