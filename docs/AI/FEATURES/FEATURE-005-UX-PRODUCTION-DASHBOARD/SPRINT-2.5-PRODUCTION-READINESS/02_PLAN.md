# FEATURE-005 — Sprint 2.5 (Production Readiness) — Plan

Six milestones, backend first where a milestone needs it (M1), then frontend
work ordered so each milestone only depends on milestones already complete.
Every milestone is independently verifiable (typecheck/lint/build + live
browser check) before the next begins, matching this project's established
discipline.

```
M1  Backend additive reads (customer name, failedToday)      [backend]
M2  Board scannability (due date, time-in-stage, customer,   [frontend, needs M1]
    color coding)
M3  Board filtering + mobile layout                          [frontend]
M4  Board safety + freshness (confirm Fail/Skip, refresh)     [frontend]
M5  Dashboard + nav actionability (click-through, nav badge,  [frontend, needs M3]
    Dashboard refresh)
M6  Cross-department Work Order timeline                     [frontend, standalone]
```

---

## Milestone 1 — Backend Additive Reads

**Scope**: Requirement 7 (backend half), Requirement 11 (backend half). No
migration; two additive Zod fields and two additive Prisma query changes.

**`packages/shared/src/schemas/workflowInstance.ts`**:

```ts
export const workflowQueueItemSchema = stageInstanceSchema.extend({
  workOrderId: z.string().uuid().nullable(),
  workOrderNumber: z.string().nullable(),
  customerName: z.string().nullable(), // new — Order.partner.nameAr, nullable to match workOrderNumber
});
```

```ts
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
  failedToday: z.number().int(), // new — same STAGE_FAILED/today-window pattern as dailyProductionCount
});
```

**`apps/api/src/services/workflowInstanceService.ts`**:

- `getDepartmentQueue`: extend the `workflowInstance` select to
  `workOrder: { select: { workOrderNumber: true, order: { select: { partner:
  { select: { nameAr: true } } } } } }`; map `customerName:
  row.workflowInstance.workOrder?.order.partner.nameAr ?? null`.
- `getWorkflowDashboardSummary`: add a second `prisma.workflowEvent.count()`
  next to the existing `dailyProductionCount` query, identical shape with
  `eventType: 'STAGE_FAILED'`; return it as `failedToday`.

**No controller/route change** — both endpoints already return their full
service result; new fields ride along automatically.

**Verification**:
- `npm run typecheck` (both workspaces) — requires `npm run build
  --workspace=packages/shared` first, per this project's established
  `@cleopatra/shared` dist-resolution requirement.
- `npm run lint`, `npm run build`, `npm run test --workspace=apps/api`
  (regression: `adminSafety.test.ts` unaffected).
- Live: `GET /api/workflow-instances/queue?departmentId=...` returns
  `customerName` (or `null` if no live orders exist); `GET /api/
  workflow-instances/dashboard-summary` returns `failedToday` (`0` in this
  environment's known-empty state — same known-zero verification approach
  Sprint 2 used).

---

## Milestone 2 — Production Board: Scannability

**Scope**: Requirements 2, 3, 7 (frontend half). Depends on M1.

**`apps/web/src/pages/production-board/ProductionBoardPage.tsx`**:
- Add a "العميل" column reading `item.customerName ?? '—'`, placed before
  "أمر التشغيل" (customer identity is the primary "what is this row" cue per
  the review; order number is secondary).
- Add "تاريخ الاستحقاق" column: `item.dueDate` formatted, `'—'` if null.
- Add "منذ" (time-in-stage) column: relative duration from `item.startedAt ??
  item.createdAt` to now, computed client-side (display-only, not a stored or
  re-derived business value — same category as any other date formatting
  already done in this codebase, not new business logic).
- `<TableRow>` gains a conditional className: a subtle background tint when
  `item.isDelayed`, a different tint when `item.priority === 'URGENT'` (delay
  tint wins if both apply — a delayed job is more urgent than an on-time
  urgent one).

**`apps/web/src/pages/production-board/productionBoardLabels.ts`**: add a
small relative-time formatter helper (e.g. `formatTimeInStage(iso: string):
string`) — pure display formatting, no new dependency needed (native `Date`
math is sufficient at this precision, no library required).

**Verification**:
- `npm run typecheck`/`lint`/`build` (web).
- Live: all 11 departments render the new columns without error in this
  known-empty environment (structural check, per Sprint 2's own documented
  gap — no live delayed/urgent rows exist to visually confirm tinting
  against; this is named explicitly in `04_VERIFY.md` when implementation
  happens, not silently assumed).
- RTL check: new columns respect `text-start`/logical properties, no new
  physical-direction classes introduced.

---

## Milestone 3 — Production Board: Filtering & Mobile Layout

**Scope**: Requirements 9, 12. No backend dependency.

**`apps/web/src/pages/production-board/ProductionBoardPage.tsx`**:
- New local filter state: `priorityFilter: WorkflowPriority | 'ALL'`,
  `delayedOnly: boolean`, `search: string`. Applied via `Array.prototype
  .filter` over the already-fetched `queue` array, in the array's existing
  order (never re-sorted) — satisfies the "preserve priority → due date → age
  ordering" constraint exactly, since filtering a pre-sorted array preserves
  relative order.
- Search matches `workOrderNumber` and `customerName` (case-insensitive
  substring).
- A new responsive rendering path: below the `sm` breakpoint, render a list
  of cards (one per queue row: order number, customer, stage, status/priority
  badges, due date, a primary action button) instead of `<Table>`; at `sm`
  and above, the existing table (now with M2's columns) renders unchanged.
  Both paths read the same filtered array — no duplicated fetch or filter
  logic, only the presentation branches.

**Verification**:
- `npm run typecheck`/`lint`/`build` (web).
- Live at desktop width: filter controls narrow the visible rows correctly;
  order is preserved (spot-checked against the unfiltered list).
- Live at 375px width: card layout renders, no horizontal scroll needed to
  reach status or the primary action; empty state still renders correctly at
  this width.

---

## Milestone 4 — Production Board: Safety & Freshness

**Scope**: Requirements 4, 6 (board half). No backend dependency.

**`apps/web/src/pages/production-board/ProductionBoardPage.tsx`**:
- Fail and Skip buttons open a confirmation `Dialog` (reusing the same
  primitive `EditQueueItemDialog` already uses) naming the stage and the
  action before calling `advance`; Complete is unchanged (single click, no
  new friction on the common path, per the review's explicit reasoning).
- A refresh button next to the department switcher, calling the existing
  `loadQueue`; a "آخر تحديث: HH:MM" label tracking the last successful load
  timestamp (local component state, not persisted).

**Verification**:
- `npm run typecheck`/`lint`/`build` (web).
- Live: Fail/Skip open a confirmation and only mutate on explicit confirm;
  Cancel leaves the queue unchanged; Complete still single-click. Refresh
  button reloads the queue and updates the timestamp label. (End-to-end
  advance behavior against a real stage instance remains structurally
  verified only, per the same known-empty-environment caveat Sprint 2
  documented — this milestone doesn't change that constraint, only the UI
  around it.)

---

## Milestone 5 — Dashboard + Navigation: Actionability

**Scope**: Requirements 1, 5, 6 (Dashboard half), 8. Depends on M3 (Production
Board's filter/department-switch state must exist for links to target it).

**`apps/web/src/pages/production-board/ProductionBoardPage.tsx`**:
- Reads `useSearchParams` on mount: `?department=<id>` sets the initial
  department selection (overriding the current "first department in the
  list" default); `?delayed=1` sets M3's `delayedOnly` filter; `?employeeId=`
  reserved for the operator-widget link but only applied if present (no
  employee-level queue filter exists yet beyond this — see note below).
- Also fetches `dashboard-summary`'s `byDepartment` (already permission-gated
  the same as the rest of the page) to annotate the department `<select>`
  with counts — Requirement 1.

**`apps/web/src/lib/dashboard/widgets/DelayedJobsWidget.tsx`,
`JobsByDepartmentWidget.tsx`, `JobsByOperatorWidget.tsx`**: wrap the existing
content in a `<Link>` to `/production-board?delayed=1` (Delayed Jobs),
`/production-board?department=<id>` (each department row), and
`/production-board?department=<id>&employeeId=<id>`* (each operator row) —
*the employee-level filter is a param the board reads but does not yet apply
as a queue filter (no per-employee filter exists in M3's scope); if
`employeeId` narrowing is wanted precisely, it is a one-line addition to M3's
filter predicate at implementation time, not a new milestone.

**`apps/web/src/pages/dashboard/DashboardPage.tsx`**: a refresh button
re-triggering the mount effect inside `WorkflowQueueSummaryProvider` (small
prop/callback addition, not a provider redesign) plus a "last updated" label,
mirroring M4's board refresh.

**`apps/web/src/components/AppShell.tsx`** (or a small new hook it calls):
implements the Architecture Decision from `01_ANALYSIS.md` (option B) — an
independent fetch of `GET /api/workflow-instances/dashboard-summary`,
gated on `can('work-orders.view')` exactly like the existing provider, reading
only `totals.delayed`. Rendered as a small numeric badge next to the "لوحة
الإنتاج" `NavLink`. This requires `NavLink`'s render (`NavTree.tsx`) to accept
an optional badge count — the smallest version of this is passing a
`badgeCount?: number` prop computed in `AppShell.tsx` and threaded through
`NAV_ITEMS` → `Sidebar` → `NavTree` for the one entry that needs it, rather
than making every `NavEntry` badge-aware speculatively (YAGNI on the other
seven nav items until one of them needs it too).

**Verification**:
- `npm run typecheck`/`lint`/`build` (web).
- Live: clicking each linked widget lands on Production Board with the
  correct department pre-selected and/or delayed filter pre-applied. Sidebar
  badge count matches `dashboard-summary.totals.delayed` exactly (cross-check
  the same way Sprint 2's M1 verification cross-checked totals). Dashboard
  refresh reloads and updates its timestamp.

---

## Milestone 6 — Cross-Department Work Order Timeline

**Scope**: Requirement 10. Standalone — depends on nothing above except the
existing, unchanged `GET /api/workflow-instances/:id`.

**New route** `apps/web/src/pages/production-board/WorkOrderTimelinePage.tsx`,
registered in `App.tsx` as `/production-board/timeline/:workflowInstanceId`
under the existing `work-orders.view`-gated `<ProtectedRoute>`:
- Fetches `GET /api/workflow-instances/${workflowInstanceId}`.
- Renders `stageInstances` (already creation-ordered by the API) as a
  vertical timeline: stage name, department, status, started/finished
  timestamps, and — for free, per `01_ANALYSIS.md`'s Missing Data note —
  each stage's position ("المرحلة N من M") derived from its index in the
  same array, not a separate field.
- No mutation actions on this page — it is a read-only journey view, distinct
  from Production Board's queue-editing surface, matching VISION.md's
  Workflow Visibility framing of "see the status" as separate from "act on
  the queue."

**`apps/web/src/pages/production-board/ProductionBoardPage.tsx`**: each row
gains a "عرض المسار الكامل" action (icon button, always visible — read-only,
so not gated behind `work-orders.edit` the way Complete/Skip/Fail/Edit are)
linking to the new route using the row's existing `workflowInstanceId`.

**Verification**:
- `npm run typecheck`/`lint`/`build` (web).
- Live: navigating from a board row (once any live data exists) or directly
  by id renders the ordered stage list correctly; a `work-orders.view`-only
  (non-edit) caller can still reach the page (read-only) but sees no
  Complete/Skip/Fail affordance anywhere on it, consistent with the rest of
  the app's `canSeeInternal`/edit-gating pattern.
- Confirms the pre-existing, non-department-scoped read behavior of `GET
  /:id` (documented in `01_ANALYSIS.md`'s Permissions/Security section) by
  checking that a `work-orders.view` caller whose department access does
  *not* include every stage the timeline shows can still see the full
  timeline — expected and correct per that section's reasoning, not a bug to
  fix in this milestone.

---

## Explicit Non-Goals (repeated from Requirements, so this plan is
self-contained)

No trend charts, no push/email/SMS alerting, no capacity indicators, no
auto-poll/background refresh, no bulk actions, no new permission catalog
entries, no Prisma migration, no change to FEATURE-004's transition/routing
logic. If implementation at any milestone discovers one of these is actually
required, that is a stop-and-ask moment per the user's own standing
instruction, not a silent scope expansion.
