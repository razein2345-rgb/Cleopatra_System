# FEATURE-005 — Sprint 2 — Analysis

## What Already Exists and Is Directly Reusable

- **`computeIsDelayed`, `mapStageInstanceToDto`, `getDepartmentQueue`**
  (`apps/api/src/services/workflowInstanceService.ts`) — the aggregate
  endpoint groups/counts `StageInstance` rows using the same delay
  computation and the same Prisma include shape already proven correct
  by FEATURE-004 M1's live verification. No second implementation.
- **`canAccessDepartment`/`accessibleDepartmentIds`**
  (`apps/api/src/services/authContext.ts`) — the aggregate endpoint
  scopes its query to the same department set the per-department queue
  endpoint already enforces; a Super Admin or `work-orders.*`/`*` holder
  sees every department, exactly like `canAccessDepartment`'s existing
  bypass.
- **`WorkflowEvent`** (FEATURE-004 M1) — already an append-only feed of
  `STAGE_COMPLETED`/`STAGE_STARTED`/etc. events with `occurredAt`. Daily
  production is a `count()` of today's `STAGE_COMPLETED` rows — reading
  a feed that already exists, not a new one.
- **`PUT .../advance` and `PUT .../current-stage`**
  (`apps/api/src/controllers/workflowInstances.ts`) — Production Board's
  action buttons/forms call these unchanged; no new mutation endpoint.
- **`src/lib/dashboard/` registry + `WorkflowQueueSummaryProvider`
  pattern** (Sprint 1 Refinement 2) — the Dashboard's widget-registry
  architecture already supports "a data provider several widgets share."
  `WorkflowQueueSummaryProvider` is rewritten to call the new endpoint
  once instead of fanning out per department; the widgets that consume
  it (`ActiveWorkOrdersWidget`, `WaitingJobsWidget`, `DelayedJobsWidget`)
  don't change at all — they already read from the provider's context,
  not from the fetch mechanism inside it.
- **`src/lib/search/`, `src/components/cleopatra/StatusBadge.tsx`**
  (Sprint 1) — Production Board's status/priority/delay badges use
  `StatusBadge` (five tones already defined), not a new badge component.

## Design Decisions

- **One new backend endpoint, not a new module.** Per `01_ANALYSIS.md`'s
  own precedent (Sprint 1 Open Decision #1, resolved in principle),
  `GET /api/workflow-instances/dashboard-summary` is a read/aggregation
  on the existing `workflowInstancesRouter`, gated by `work-orders.view`
  — the same permission the queue endpoint already requires. No new
  permission-catalog entry.
- **Response shape covers all seven VISION.md representative views in
  one call**: totals (waiting/in-progress/delayed/active work orders),
  by-department breakdown, by-operator breakdown, supplier-delay
  breakdown, and today's completed-stage count. One call, one shared
  response — Sprint 1's own "shared provider" pattern applied at the
  network layer, not just the React layer.
- **Production Board is one screen with a department switcher**, not one
  route per department. The switcher's options are the departments the
  signed-in user can access — read from a new lightweight call to the
  existing `GET /api/departments` (already used by Settings' Printing
  category and, before that, `WorkflowQueueSummaryProvider`), filtered
  client-side isn't needed since `GET /api/departments` itself isn't
  department-scoped (it's `settings.view`-gated reference data, same as
  Sprint 1 already relies on) — the *queue* call per selected department
  is what enforces `canAccessDepartment`, same as today.
- **Stage actions surface the same errors FEATURE-004 M1's live
  verification already exercised** (`ILLEGAL_STAGE_TRANSITION`,
  `MISSING_REQUIRED_VARIABLES`) — Production Board displays these, it
  does not reinterpret or soften them.

## Business Object Architecture Applied

Production Board and the Dashboard's job widgets are two more *views*
over `WorkflowInstance`/`StageInstance` — the same Business Objects
FEATURE-004 already owns. Neither view adds a field, a status, or a
calculation the engine doesn't already track.

## Permission Mapping

No new permission-catalog entries.

- `GET /api/workflow-instances/dashboard-summary` — `work-orders.view`
  (matches the queue endpoint).
- Production Board's stage actions — `work-orders.edit` (matches
  `PUT .../advance` and `PUT .../current-stage`, unchanged).
- Department switcher — reads `GET /api/departments`
  (`settings.view`, unchanged) for the department list; the queue call
  per selection is what's actually access-controlled.
