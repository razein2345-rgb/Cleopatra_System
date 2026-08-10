# FEATURE-005 — Sprint 2.5 (Production Readiness) — Implementation

All six milestones from `02_PLAN.md` implemented in order, each verified
(typecheck/lint/build/test + live) before the next began, per the user's
explicit instruction.

## Approved deviations from the plan (decided before/during implementation)

Three points were flagged in `02_PLAN.md`'s report and resolved by the user
before implementation started:

1. **M5 sidebar badge**: uses the independent `dashboard-summary` fetch
   (Architecture Decision option B), not a lifted provider. Approved as-is.
2. **M6 timeline**: uses the existing, unchanged `GET /workflow-instances/:id`
   with no broadening of its (pre-existing, non-department-scoped) access
   behavior. Approved as-is.
3. **Job description**: left out. Only `customerName` ships; nothing is
   approximated from `OrderItem`. Approved as-is.

A fourth point surfaced **during** M5 implementation and was not pre-decided
in `02_PLAN.md` — flagged and resolved via a stop-and-ask before proceeding:

4. **M5 widget click-through scope**: `02_PLAN.md` named `DelayedJobsWidget`,
   `JobsByDepartmentWidget`, and `JobsByOperatorWidget` as candidates for
   linking into Production Board. Implementation found that only
   `JobsByDepartmentWidget`'s rows are genuinely accurate to link — each row
   is one department's own counts. `DelayedJobsWidget` (a global total) and
   `JobsByOperatorWidget` (an operator's jobs, which can span departments)
   are cross-department aggregates that Production Board's per-department
   queue view cannot represent without landing on an arbitrary, and
   therefore potentially misleading, department. **User decision: link only
   Jobs by Department; leave the other two informational-only this
   milestone.** No misleading UI was built.

## Milestone 1 — Backend Additive Reads

**`packages/shared/src/schemas/workflowInstance.ts`**:
- `workflowQueueItemSchema` gained `customerName: z.string().nullable()`.
- `workflowDashboardSummarySchema` gained `failedToday: z.number().int()`.

**`apps/api/src/services/workflowInstanceService.ts`**:
- `getDepartmentQueue`'s Prisma query extended to select
  `workOrder.order.partner.nameAr`, mapped into `customerName`.
- `getWorkflowDashboardSummary` gained a second `workflowEvent.count()`
  (identical shape to the existing `dailyProductionCount`, filtered
  `eventType: 'STAGE_FAILED'`), returned as `failedToday`.

No controller/route change — both endpoints already return their full
service result. No migration.

## Milestone 2 — Production Board: Scannability

**`apps/web/src/pages/production-board/productionBoardLabels.ts`**: added
`formatDueDate`, `formatTimeInStage` (relative time since `startedAt` /
`createdAt`, display-only), `rowToneClassName` (delayed → danger tint, else
urgent → warning tint).

**`ProductionBoardPage.tsx`**: added "العميل", "تاريخ الاستحقاق", "منذ"
columns; row-level `className` via `rowToneClassName`; empty-state `colSpan`
updated.

## Milestone 3 — Production Board: Filtering & Mobile Layout

**`ProductionBoardPage.tsx`**: `priorityFilter`/`delayedOnly`/`search` state,
applied via `Array.prototype.filter` over the already-fetched, already-sorted
`queue` array (order preserved, never re-sorted, never re-fetched). A filter
bar (priority select, delayed-only checkbox, search input) above the queue.
Two parallel render paths sharing the same `filteredQueue`: the existing
`<Table>` under `hidden sm:block`, and a new `sm:hidden` card list (one
`Card` per row: customer/order/stage, status/priority badges, due date, time
in stage, employee/waiting reason, actions) — no horizontal scroll on mobile.

## Milestone 4 — Production Board: Safety & Freshness

**`ConfirmStageActionDialog.tsx`** (new): a confirmation dialog for Fail/Skip,
reusing the shadcn `Dialog` primitive `EditQueueItemDialog` already uses.

**`ProductionBoardPage.tsx`**: Fail/Skip buttons now open
`ConfirmStageActionDialog` via `confirmAction` state instead of calling
`advance()` directly; Complete is unchanged (single click). A refresh button
(`RefreshCw` icon) re-invokes `loadQueue`; a "آخر تحديث: HH:MM" label tracks
`lastUpdated`, set on every successful load.

## Milestone 5 — Dashboard + Navigation: Actionability

**`ProductionBoardPage.tsx`**: reads `?department=<id>` from
`window.location.search` once at mount to override the default first-
department selection — the entry point for Jobs by Department's links.

**`lib/dashboard/widgets/JobsByDepartmentWidget.tsx`**: each row wrapped in a
`<Link to="/production-board?department=<id>">` (react-router). Per the
approved-narrower scope, `DelayedJobsWidget` and `JobsByOperatorWidget` were
**not** changed.

**`lib/dashboard/providers/WorkflowQueueSummaryProvider.tsx`**: gained a
second, small context (`WorkflowDashboardRefreshContext` /
`useWorkflowQueueSummaryRefresh()`) exposing `{ refresh, lastUpdated }` —
additive; the existing `useWorkflowQueueSummaryContext()` and all eight
widgets reading it are untouched.

**`lib/dashboard/DashboardRefreshBar.tsx`** (new): a small, deliberately
non-generic component reading `useWorkflowQueueSummaryRefresh()` directly —
documented as `DashboardPage`'s one acknowledged exception to "no
widget-specific knowledge," since today there is exactly one data provider
to refresh (see the component's own doc comment for the reasoning against
building a speculative multi-provider refresh registry now).

**`pages/dashboard/DashboardPage.tsx`**: renders `<DashboardRefreshBar />`
inside the existing `DASHBOARD_DATA_PROVIDERS` composition, above the widget
grid.

**`components/cleopatra/nav-types.ts`**: `NavLink` gained an optional
`badgeCount?: number` (an attention count, explicitly documented as a
different concept from `StatusBadge`'s state-tone vocabulary).

**`components/cleopatra/NavTree.tsx`**: renders a small `bg-danger` pill next
to a nav link's label (or absolutely positioned in collapsed/icon-rail mode)
when `badgeCount` is truthy — `0`/`undefined` render nothing.

**`components/AppShell.tsx`**: new `useDelayedJobsBadge(canView)` hook — an
independent `GET /api/workflow-instances/dashboard-summary` fetch (the
approved option B), gated on `can('work-orders.view')`, mirroring
`Topbar.tsx`'s existing independent `GET /api/branches` fetch. `NAV_ITEMS`
is mapped into a `navItems` `useMemo` that injects `badgeCount` onto the
`/production-board` entry only; `Sidebar`, `MobileNavDrawer`, and
`CommandPalette` all now read `navItems` instead of the static `NAV_ITEMS`
(the mobile drawer gets the badge for free, from the same data).

## Milestone 6 — Cross-Department Work Order Timeline

**`productionBoardLabels.ts`**: added `stageStatusTone` (maps all five
`StageInstanceStatus` values to a `StatusBadge` tone).

**`WorkOrderTimelinePage.tsx`** (new): fetches `GET /api/workflow-instances/
:id` (existing, previously unused by the frontend — no change to that
endpoint). Renders `stageInstances` (already creation-ordered by the API) as
a numbered vertical list: stage name, status badge, department, "المرحلة N
من M" (derived from the array index — no new field), started/finished
timestamps. Read-only — no mutation actions. `workOrderNumber`/`customerName`
are optional display-only query params passed by the linking row, not
fetched or computed by this page.

**`App.tsx`**: new route `/production-board/timeline/:workflowInstanceId`,
inside the existing `work-orders.view`-gated `<ProtectedRoute>` block —
same gate as `/production-board` itself, no new permission.

**`ProductionBoardPage.tsx`**: every row (table and mobile card) gained a
"المسار الكامل" link to the new route, carrying the row's `workOrderNumber`/
`customerName` as query params. Always visible — unlike Complete/Skip/Fail/
Edit, this is read-only and not gated behind `work-orders.edit`. Table
header/empty-state `colSpan` updated for the new always-present column.

## Final Regression Pass

After M6, a full-repo `typecheck`/`lint`/`build` (root, all three workspaces)
and `apps/api`'s test suite were re-run once more as a closing gate, plus a
live spot-check of `/partners` (untouched by this sprint) to confirm the
`AppShell`/`NavTree` changes introduced no regression elsewhere. All clean.
