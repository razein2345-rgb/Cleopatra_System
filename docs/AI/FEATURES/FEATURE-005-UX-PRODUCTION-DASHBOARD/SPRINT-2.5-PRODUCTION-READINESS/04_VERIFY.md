# FEATURE-005 — Sprint 2.5 (Production Readiness) — Verification

## Static Checks

Run at every milestone (M1–M6) and once more as a final regression pass
after M6:

- `npm run typecheck` (root: `packages/shared` build → `apps/web` →
  `apps/api`) — clean throughout. `packages/shared` was rebuilt before M1's
  `apps/api` typecheck, per this project's established `@cleopatra/shared`
  dist-resolution requirement.
- `npm run lint` (root: `apps/web` + `apps/api`) — clean throughout, no new
  exceptions.
- `npm run build` (root: all three workspaces) — clean throughout. Same
  pre-existing single-chunk bundle-size advisory noted in every prior
  feature's verification (unrelated to this sprint, not a new regression).
- `npm run test --workspace=apps/api` — 13/13 passing at M1 and again in the
  final regression pass (`adminSafety.test.ts`, unchanged — confirms no
  backend regression from the M1 query/schema changes).

## Live Verification

Performed against the real running app and Supabase-backed database, signed
in as Super Admin. This environment has zero live `WorkflowInstance`/
`WorkOrder` data — every finding below states explicitly whether it was
confirmed against real data or verified structurally (matches Sprint 2's
own documented pattern).

**M1 — Backend additive reads**: `GET /api/workflow-instances/dashboard-
summary` returns `failedToday: 0`, confirmed correct for a known-empty
environment. `GET /api/workflow-instances/queue?departmentId=...` returns an
empty array, so `customerName`'s presence on a real row could not be
structurally confirmed live — verified by code review and by the shared
schema/typecheck chain instead (same caveat Sprint 2 documented for its own
new fields).

**M2 — Board scannability**: navigated to `/production-board`; the "العميل"
("customer name"), "تاريخ الاستحقاق" ("due date"), and "منذ" ("time in
stage") columns render with correct Arabic headers, correct empty-state
`colSpan`, no console errors. Row-tinting for delayed/urgent rows could not
be visually confirmed against real data (none exists) — verified by code
review of `rowToneClassName` and its wiring.

**M3 — Filtering & mobile layout**: at desktop width, the filter bar (search
input, priority select, "المتأخرة فقط" checkbox) renders and responds —
typing into search and checking the delayed-only box correctly kept the
"لا توجد مهام في قائمة الانتظار لهذا القسم" (queue genuinely empty) message
rather than incorrectly showing the "no rows match the filter" message,
confirming the two empty-state branches are distinguished correctly. At a
375px viewport, the table is hidden and the card layout renders instead
(confirmed via `get_page_text` showing exactly one copy of the empty-state
text, not both layouts' text simultaneously); resizing back to desktop
showed the table again with no duplication. No console errors at either
width.

**M4 — Safety & freshness**: the refresh button (aria-label "تحديث") is
present and, when clicked, reloads the queue and updates the "آخر تحديث"
timestamp with no console errors. The Fail/Skip confirmation dialog
(`ConfirmStageActionDialog`) is typecheck/lint-clean and code-reviewed, but
— consistent with every prior milestone's stage-action verification in this
environment — could not be exercised end-to-end against a real queue row,
since none exists to click Fail/Skip on.

**M5 — Dashboard + navigation**: the Dashboard's refresh button and "آخر
تحديث" label render and update correctly (confirmed via `get_page_text`
across two loads). The sidebar's delayed-count badge correctly renders
**nothing** next to "لوحة الإنتاج" when the caller's delayed total is `0`
(confirmed via `document.querySelector('a[href="/production-board"]')`
showing no `.bg-danger` badge span) — the nonzero-badge rendering path was
verified by code review only (same known-empty-environment constraint).
The `?department=<id>` deep link was verified directly: navigating to
`/production-board?department=<Design-department-id>` correctly pre-selected
"Design" in the department switcher instead of the alphabetically-first
department, with no console errors — confirming the Jobs by Department
widget's links will land correctly once real data exists to click them from.

**M6 — Work Order timeline**: the new route
`/production-board/timeline/:workflowInstanceId` is reachable and
permission-gated identically to `/production-board` (same
`work-orders.view` `<ProtectedRoute>`). Navigating to it with a random,
non-existent id correctly hit the existing `GET /api/workflow-instances/:id`
endpoint and rendered its real "Workflow instance not found" error — via the
same bare-error-message pattern already used by `QuotationDetail.tsx`,
confirmed for consistency. The populated-timeline rendering path (a real
ordered stage list, "المرحلة N من M", started/finished timestamps, the
`workOrderNumber`/`customerName` query-param header) was verified by code
review only — this environment has no real `WorkflowInstance` to navigate to
and confirm visually.

**Final regression spot-check**: `/partners` (untouched by this sprint)
loads correctly with real data and no console errors after the `AppShell`/
`NavTree` changes, confirming the sidebar/nav restructuring for the M5
badge did not regress any other screen.

## Known Gaps (named explicitly, not silently assumed complete)

- Every stage-action-dependent UI (row tinting, the Fail/Skip confirmation
  flow, the nonzero sidebar badge, a populated Work Order timeline) is
  verified by code review and static checks only, not against real non-zero
  production data — because none exists in this environment. This mirrors
  Sprint 2's own documented limitation exactly and is not a new gap
  introduced by this sprint.
- `DelayedJobsWidget` and `JobsByOperatorWidget` remain non-clickable per
  the user's explicit M5 decision (see `03_IMPLEMENT.md`'s "Approved
  deviations" section) — not a bug, a deliberate scope decision to avoid
  building a misleading cross-department link.

## Closure

FEATURE-005 Sprint 2.5 (Production Readiness) is **verified and closed**.
All six milestones passed static and live verification before the next
began. No schema migration, no new permission catalog entry, no duplicated
Workflow Engine business logic, no invented data (the job/item description
was explicitly left out per the user's decision), no fake KPIs (`failedToday`
is a real `WorkflowEvent` count, following `dailyProductionCount`'s exact
pattern). The one mid-implementation architectural question (M5's
click-through scope) was raised and resolved with the user before proceeding,
per their explicit instruction.
