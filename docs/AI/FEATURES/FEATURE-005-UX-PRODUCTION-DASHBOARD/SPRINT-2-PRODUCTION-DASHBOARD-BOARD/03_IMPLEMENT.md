# FEATURE-005 — Sprint 2 — Implementation

## Milestone 1 — `dashboard-summary` Aggregate Endpoint

**Shared** (`packages/shared/src/schemas/workflowInstance.ts`):
`departmentJobSummarySchema`, `operatorJobSummarySchema`,
`supplierDelaySummarySchema`, `workflowDashboardSummarySchema` + inferred
types, exported via the package's existing barrel.

**Backend**:

- `authContext.ts` gained `accessibleDepartmentScope(user)` —
  `canAccessDepartment`'s exact bypass rule (`SUPER_ADMIN`,
  `work-orders.*`, `*`), restated as a scope (`string[] | 'all'`) instead
  of a single yes/no check, for a query that needs "every department this
  caller may see" rather than one department at a time.
- `workflowInstanceService.ts` gained
  `getWorkflowDashboardSummary(departmentIds)` — one `stageInstance.
  findMany` over open (`WAITING`/`IN_PROGRESS`) rows (optionally
  department-filtered), reducing them into totals/by-department/
  by-operator/supplier-delay breakdowns in application code, reusing
  `computeIsDelayed` per row (never recalculated); one
  `workflowEvent.count()` for today's `STAGE_COMPLETED` rows
  (`dailyProductionCount`).
- `workflowInstances` controller/route gained
  `GET /dashboard-summary` (`getWorkflowDashboardSummaryHandler`),
  registered before `/:id` for the same Express route-ordering reason
  `/queue` already documents. Gated `work-orders.view`, same as `/queue`.

No schema migration — every field read already existed on
`StageInstance`/`WorkflowEvent`/`Department`/`StaffProfile`/
`BusinessPartner`.

## Milestone 2 — Production Board

New route `/production-board` (`src/pages/production-board/`):

- `ProductionBoardPage.tsx` — department switcher (`GET /api/
  departments`), queue table (`GET /api/workflow-instances/queue?
  departmentId=`) using the shadcn `Table` primitive (first real
  consumer of it — Sprint 1 only generated it), `StatusBadge` for stage
  status/priority/delay. Row actions (`work-orders.edit`-gated):
  Complete/Skip (`PUT .../advance`), Fail (`PUT .../advance`), Edit
  (opens the metadata dialog). Assigned-employee names resolved via
  `GET /api/users`, matched client-side (same pattern `UsersPage.tsx`
  already uses for branch names).
- `EditQueueItemDialog.tsx` — queue metadata form (priority, due date,
  assignee, waiting/blocking reason), plus External Supplier fields
  (supplier, expected return date, cost, status) only when
  `stageType === 'EXTERNAL'`. Calls `PUT .../current-stage`.
- `productionBoardLabels.ts` — Arabic labels for `StageInstanceStatus`
  and `WorkflowPriority`, plus a `priorityTone()` helper reusing
  `StatusBadge`'s five-tone vocabulary.
- Sidebar entry ("لوحة الإنتاج", `Factory` icon) added to `AppShell.tsx`'s
  `NAV_ITEMS`, gated `work-orders.view`; route added to `App.tsx`.

**Scope note**: the Complete action passes through whatever
`variableValues` the stage instance already has; it does not build a
dynamic form for filling in required `WorkflowStageVariable` answers.
This environment has zero live `WorkflowInstance` data to design that
form against with any confidence, and the plan's own fallback ("document
explicitly rather than fabricate") applies — if the server rejects with
`MISSING_REQUIRED_VARIABLES`, the specific missing keys surface in the
inline error, which is honest and functional without inventing an
untested UI.

## Milestone 3 — Dashboard Widgets on `dashboard-summary`

- `WorkflowQueueSummaryProvider.tsx` rewritten: one call to
  `GET /api/workflow-instances/dashboard-summary` instead of
  `GET /api/departments` + N × `GET .../queue?departmentId=`. Context
  value changed from a bespoke `{activeWorkOrders, waitingJobs,
  delayedJobs}` shape to the shared `WorkflowDashboardSummary` type
  directly — one real response shape, not a hand-maintained subset of it.
  Gate dropped from `work-orders.view && settings.view` to
  `work-orders.view` alone, since the new endpoint doesn't need
  `GET /api/departments` client-side any more — incidentally fixing the
  permission-mapping wrinkle Sprint 1 `01_ANALYSIS.md` flagged (a
  `work-orders.view`-only user can now see these widgets).
- `ActiveWorkOrdersWidget`/`WaitingJobsWidget`/`DelayedJobsWidget`:
  one-line field-path updates (`summary?.activeWorkOrders` →
  `summary?.totals.activeWorkOrders`, etc.) and permission simplified to
  `'work-orders.view'`. No architectural change.
- Five new widgets registered in `DASHBOARD_WIDGETS`
  (`registry.ts`): `JobsInProgressWidget`, `DailyProductionWidget`
  (same `DashboardWidget` single-number shape as Sprint 1's four), and
  `JobsByDepartmentWidget`/`JobsByOperatorWidget`/`SupplierDelaysWidget`
  (small `Card`-based breakdown lists — a different shape than a single
  number, each with its own empty state).
- `DashboardWidgetDefinition` gained an optional `span?: 'sm' | 'lg'`
  layout hint; `DashboardPage.tsx` applies it generically
  (`sm:col-span-2` when `'lg'`) — it still contains no widget-specific
  knowledge, only a data-driven layout rule.

All seven VISION.md Production Dashboard representative views (Jobs
waiting, Jobs in progress, Delayed jobs, Jobs by department, Jobs by
operator, Supplier delays, Daily production) are now real widgets, plus
Sprint 1's Open Quotations and Active Work Orders.
