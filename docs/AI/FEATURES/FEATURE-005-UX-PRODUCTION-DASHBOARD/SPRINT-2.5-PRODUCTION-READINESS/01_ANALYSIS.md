# FEATURE-005 — Sprint 2.5 (Production Readiness) — Analysis

This analysis is based on reading the current implementation, not assumption:
`workflowInstanceService.ts`, `workflowInstances` controller/routes,
`authContext.ts`, the full `StageInstance`/`WorkflowInstance`/`WorkOrder`/
`Order`/`WorkflowEvent` Prisma models, `ProductionBoardPage.tsx`,
`EditQueueItemDialog.tsx`, the Dashboard widget/provider registry, `Sidebar`/
`NavTree`/`nav-types.ts`, and `CommandPalette.tsx`.

## Existing Data Already Available

Every field below already exists on a model or is already returned by an
existing endpoint — none of this requires a migration.

- **`StageInstance`** (via `stageInstanceSchema`, returned as part of
  `WorkflowQueueItem`): `priority`, `dueDate`, `isDelayed` (computed),
  `startedAt`, `createdAt`, `status`, `waitingReason`, `blockingReason`,
  `assignedEmployeeId`, `stageType`. This alone covers Requirements 2
  (due date + `startedAt`/`createdAt` for time-in-stage) and 3 (color coding
  reads `isDelayed`/`priority`, both already present).
- **`getDepartmentQueue`'s existing `orderBy`** (`priority desc, dueDate asc,
  createdAt asc`) already matches the mental model Requirement 9's filter
  needs to preserve — filtering must narrow this list, never re-sort it.
- **`WorkflowDashboardSummary.byDepartment`** (`departmentId`, `departmentName`,
  `waiting`, `inProgress`, `delayed`): exactly the three counts Requirement 1
  needs per department, already computed by `getWorkflowDashboardSummary` and
  already fetched once by `WorkflowQueueSummaryProvider`. Zero new backend
  work for the *numbers themselves* — the work is in reaching them from the
  department switcher and the sidebar (see Required Frontend Changes).
- **`GET /api/workflow-instances/:id`** (`getWorkflowInstance`, existing since
  FEATURE-004 M1, currently called by nothing in the frontend): returns the
  full `WorkflowInstance` including every `stageInstance` in creation order,
  each with its own `departmentName`, `status`, `startedAt`/`finishedAt`. This
  is Requirement 10's entire data need — a per-order, cross-department
  timeline is a read the API has supported since M1 and the frontend has
  never used.
- **`WorkflowEvent.eventType`** already includes `STAGE_FAILED`, written by
  `advanceWorkflowInstance` on every FAIL action (`workflowInstanceService.ts`
  line ~274). `getWorkflowDashboardSummary`'s `dailyProductionCount` already
  demonstrates the exact query pattern Requirement 11 needs — same
  `prisma.workflowEvent.count()` shape, different `eventType`.
- **`Order.partnerId → BusinessPartner`**: a direct, single relation. A
  `WorkOrder`'s customer is unambiguous — `stageInstance.workflowInstance
  .workOrder.order.partner`. Requirement 7's customer name is a real,
  clean field, not an approximation.

## Missing Data

- **A single-line "job description."** `Order` has many `OrderItem` rows
  (`kind`, `modelName`, a JSON `breakdown`) — there is no one authoritative
  "what is this job" string for a multi-item order the way there is for the
  customer. **Decision: do not invent one.** Requirement 7 ships the customer
  name only, which is real and unambiguous. An item-level label (e.g. "3
  items" or the first item's `modelName` as a hint) is a nice-to-have that can
  be added later without a schema change if wanted, but is not promised by
  this plan — adding it now risks the exact "invented data" failure mode the
  user ruled out (a first-item's `modelName` silently mislabeling a
  multi-item job as if it were the whole order).
- **A failure/rework count field.** `workflowDashboardSummarySchema` has no
  `failedCount` (or equivalent) today — this is genuinely missing and is the
  one clearly required additive schema field in this sprint (see Required API
  Changes). It is not a migration; it's a new field on an existing Zod schema
  and a new grouped count in an existing service function, following
  `dailyProductionCount`'s established pattern exactly.
- **Stage-position context ("stage 3 of 7").** The `WorkflowInstance`'s
  `stageInstances` array (already returned by `GET /:id`) gives this for
  free once Requirement 10's timeline view exists — the timeline itself *is*
  the ordered list of stages. No separate "position" field is needed; this is
  a Requirement 10 rendering detail, not new data. Confirmed **not deferred**
  — it falls out of Requirement 10 at no extra cost.

## Required API Changes

Two additive changes, both in `packages/shared` + `apps/api`, **no migration**:

1. **`workflowQueueItemSchema` gains a nullable customer-name field**
   (Requirement 7). `getDepartmentQueue`'s Prisma query adds
   `workOrder: { select: { workOrderNumber: true, order: { select: { partner:
   { select: { nameAr: true } } } } } }` and maps it into the new field,
   nullable to match every other optional relation in this DTO (a
   `WorkflowInstance` not yet linked to a `WorkOrder`, or a `WorkOrder`
   without an `Order` — shouldn't happen given the schema's `@unique
   orderId`, but the DTO stays defensive the same way `workOrderNumber`
   already is nullable).
2. **`workflowDashboardSummarySchema` gains a `failedToday` count**
   (Requirement 11), computed in `getWorkflowDashboardSummary` via a second
   `prisma.workflowEvent.count()` scoped the same way `dailyProductionCount`
   already is (`eventType: 'STAGE_FAILED'`, `occurredAt: { gte: todayStart }`,
   same department filter). Named `failedToday` (not `failedThisWeek`) to
   match `dailyProductionCount`'s existing "today" window exactly — a
   "this week" variant would need a second, differently-windowed query and
   isn't required by Requirement 11's "basic failure metric" bar.

No other requirement needs a backend change — seven of the twelve
requirements (2, 3, 4, 6, 9, 10, 12) are frontend-only, reading data the API
already returns. Requirements 1, 5, 8 need zero *new* data (item's numbers
already exist in `dashboard-summary`) but do need a frontend *reach* decision
— see below.

## Required Frontend Changes

- **Requirement 1 (department counts)**: `ProductionBoardPage.tsx`'s
  department `<select>` needs each option's counts. It already calls
  `GET /api/departments` separately from `dashboard-summary`; the cleanest
  fix is for the Production Board to also read `dashboard-summary`'s
  `byDepartment` (one extra fetch, already permission-gated identically) and
  merge counts into the department list — no new endpoint.
- **Requirement 2/3 (due date, time-in-stage, color)**: `ProductionBoardPage.tsx`
  table gains two columns and a row-level conditional class; `EditQueueItemDialog`
  is unaffected.
- **Requirement 4 (confirmation)**: a confirmation dialog (reuse the existing
  shadcn `Dialog` primitive, same one `EditQueueItemDialog` already uses) gates
  the Fail and Skip buttons specifically; Complete stays a single click.
- **Requirement 5 (nav badge)**: this is the one real **architecture
  decision** in this sprint — see "Architecture Decision: Nav Badge Data
  Source" below.
- **Requirement 6 (manual refresh)**: a refresh button + "last updated" label
  on both `DashboardPage.tsx` (wrapping `DASHBOARD_DATA_PROVIDERS`'s existing
  fetch, re-triggerable) and `ProductionBoardPage.tsx` (re-invokes the
  existing `loadQueue`).
- **Requirement 7 (customer name)**: one new table column, once M1's backend
  field exists.
- **Requirement 8 (click-through)**: Dashboard widgets that represent a job
  set (`DelayedJobsWidget`, `JobsByDepartmentWidget`, `JobsByOperatorWidget`)
  become links into `/production-board` carrying a department id and/or a
  `delayed=1` query flag; `ProductionBoardPage.tsx` reads that on mount to set
  its initial department selection and filter state (built in Requirement 9).
  This makes Requirement 8 **dependent on Requirement 9's filter state
  existing first** — reflected in the milestone order below.
- **Requirement 9 (filter/search)**: a filter bar in `ProductionBoardPage.tsx`
  — priority dropdown, "delayed only" toggle, free-text search — applied
  client-side over the array `loadQueue` already fetched. **Explicit
  assumption**: a department's open queue is expected to be small (tens of
  rows, not thousands) at this business's scale, matching FEATURE-004's own
  queue-view assumption. If a department queue grows large enough for
  client-side filtering to matter, that's a server-side-filter/pagination
  problem for a future sprint, not this one — flagged, not solved here.
- **Requirement 10 (timeline)**: a new page/route reading `GET /api/
  workflow-instances/:id`. **Entry point decision**: no Work Order list/detail
  screen exists anywhere in the frontend today (confirmed — no `/orders` or
  `/work-orders` route in `App.tsx`). The only place a user currently
  encounters a `workflowInstanceId` is a Production Board row. The plan adds
  a "عرض المسار الكامل" (view full path) action per row, linking to a new
  route (e.g. `/production-board/timeline/:workflowInstanceId`), rather than
  inventing a Work Orders module this sprint doesn't otherwise need.
- **Requirement 12 (mobile layout)**: `ProductionBoardPage.tsx`'s table
  becomes a responsive component — a card layout below the `sm` breakpoint
  (order number + customer + stage + status/priority badges + a visible
  primary action), the existing table at `sm` and above. This is the same
  breakpoint pattern already used throughout the App Shell (`hidden lg:block`,
  `sm:col-span-2`, etc.), applied to one more component. No other table in the
  app gets this treatment in this sprint — Production Board is the one
  screen the review flagged as floor/mobile-critical (see
  `PRODUCTION_READINESS_REVIEW.md` F26's reasoning); back-office tables
  (Partners, Quotations) are out of scope here.

### Architecture Decision: Nav Badge Data Source

`Sidebar`/`NavTree` render from a plain `NavEntry[]` (`nav-types.ts`) with no
data-fetching of their own — by design, they're presentational. The existing
`WorkflowQueueSummaryProvider` that already holds the delayed count is
mounted *inside* `DashboardPage.tsx`, wrapping only the widget grid — it does
not wrap `Sidebar`, which lives as `AppShell.tsx`'s sibling of `<Outlet />`
and is always mounted, on every route.

Two options:

- **(A) Lift the provider to `AppShell.tsx`**, wrapping both `<Sidebar>` and
  `<Outlet>`, and have `DashboardPage.tsx` consume the same context instead of
  mounting its own copy. Single fetch app-wide; larger, riskier change (moves
  a Sprint 2 architectural decision, touches `AppShell.tsx` and
  `DashboardPage.tsx`'s composition).
- **(B) A second, independent, lightweight fetch** scoped to just the badge
  count, living in `AppShell.tsx` (or a small hook it calls), reading the
  same `GET /api/workflow-instances/dashboard-summary` endpoint on its own.
  Slight duplication of one GET call per page load; matches an existing
  precedent already in this codebase (`Topbar.tsx` independently fetches
  `GET /api/branches` rather than sharing a context with anything else).

**Recommendation: (B).** It's smaller, lower-risk, doesn't touch Sprint 2's
already-verified `DashboardPage`/provider composition, and one extra
lightweight GET on navigation is not a meaningful cost at this data volume
(see Performance Implications). This is flagged for explicit approval since
it's the one place this sprint makes a real architectural call rather than
just wiring up existing data — the milestone plan proceeds on (B) unless told
otherwise.

## Permissions / Security Impact

**No new permission catalog entries.** Every read in this sprint is gated by
the existing `work-orders.view`; every write (none of these 12 requirements
add a new write) stays under `work-orders.edit`. Department scoping is
unchanged: `getDepartmentQueue` stays keyed to one `canAccessDepartment`-
checked department per call; `getWorkflowDashboardSummary` stays keyed to
`accessibleDepartmentScope`.

**One pre-existing behavior this sprint relies on for the first time, and
therefore is calling out explicitly rather than silently leaning on**:
`getWorkflowInstance` (`GET /api/workflow-instances/:id`) does **not**
department-scope its result the way `getWorkflowQueue` does — any caller with
`work-orders.view` can already read any `WorkflowInstance` by id, seeing every
stage instance across every department that instance has touched (internal
fields are still redacted for a caller without `work-orders.edit`, via the
existing `canSeeInternal` gate — only the *department-boundary* check is
absent, not the internal/external field redaction). This is not a new hole
introduced by this sprint — it has been true since FEATURE-004 M1 — but
Requirement 10 is the first frontend feature to make this endpoint reachable
and prominent. Read as intentional (a single order's own journey isn't
department-confidential the way a *department's whole queue* is; VISION.md's
Workflow Visibility section treats an order's own status as broadly visible),
but flagged here as a confirm-don't-silently-inherit point for approval,
since Requirement 10 is what turns this from "an unused endpoint" into "a
linked, discoverable screen."

## Database / Migration Impact

**None.** Every requirement in this sprint reads through relations that
already exist (`WorkOrder → Order → BusinessPartner`) or an enum value that's
already written (`WorkflowEventType.STAGE_FAILED`). No new column, table,
index, or RLS policy is needed. This was confirmed by reading the full
`WorkOrder`, `Order`, `OrderItem`, `StageInstance`, `WorkflowEvent`, and
`Department` models before writing this analysis — not assumed.

## Performance Implications

- **`getDepartmentQueue`'s new customer-name select** adds one more joined
  table (`Order` → `BusinessPartner`) to a query already joining `stage`,
  `department`, and `workflowInstance.workOrder`. Negligible at
  department-queue volume (tens of open rows per department, not a
  full-table scan).
- **`getWorkflowDashboardSummary`'s new `failedToday` count** is a second
  `prisma.workflowEvent.count()` alongside the existing `dailyProductionCount`
  one — same table, same index (`@@index([workflowInstanceId, occurredAt])`
  doesn't cover this filter shape by `eventType`+`occurredAt` alone; neither
  does the existing `dailyProductionCount` query, so this introduces no new
  performance class, just one more query shaped like one already in
  production). Not a regression; worth a future index review only if this
  table's row count becomes large, which is unrelated to this sprint.
- **The nav badge (Architecture Decision, option B)** means
  `GET /dashboard-summary` — an unbounded `findMany` over every open
  `StageInstance` the caller can see — now runs once per authenticated page
  load app-wide, not just when `DashboardPage` mounts. At this business's
  expected data volume (open stage instances across all departments,
  realistically dozens to low hundreds at any time) this is not a concern.
  If department queues grow large enough that this becomes measurable, the
  fix is scoping/paginating `getWorkflowDashboardSummary` itself — a
  backend change orthogonal to this sprint, not something to design around
  speculatively now.
- **Client-side filtering (Requirement 9)** is O(n) over an already-fetched,
  already-small array — no measurable cost at expected scale (see Required
  Frontend Changes' explicit assumption above).

## Items That Can Be Implemented Without Any Schema Change

Requirements 1, 2, 3, 4, 5, 6, 8, 9, 10, 12 — ten of twelve. Only
Requirements 7 and 11 touch `packages/shared`'s Zod schemas (additive fields,
not a migration) and `apps/api`'s service queries.

## Items That Should Be Postponed

- **A synthetic job/item description beyond the customer name** (part of the
  original Requirement 7 ambition in the review) — postponed per "Missing
  Data" above; not invented.
- **Stage-position indicator as a standalone feature** — not postponed
  exactly, but explicitly folded into Requirement 10 rather than built
  separately (see Missing Data).
- **Everything in `00_REQUIREMENTS.md`'s Out of Scope section** (trend
  analytics, push/email/SMS alerting, capacity planning, auto-refresh/polling,
  bulk actions) — confirmed by this analysis to be non-dependencies of every
  one of the 12 in-scope requirements. Nothing here needed to reach into
  those areas to be implementable.

## Business Rules

None. This sprint changes no Workflow Engine transition logic, no routing
rule, no required-variable validation, no queue ordering rule — it only adds
read paths and frontend presentation over data the engine already produces.
