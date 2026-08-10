# FEATURE-005 — Sprint 2.5 (Production Readiness) — Requirements

## Context

`PRODUCTION_READINESS_REVIEW.md` (feature root) reviewed the live Sprint 1/2
product as a printing-business owner would use it and found 30 numbered gaps,
grouped into Quick Wins / Sprint 2.5 / Future. This sprint implements the
user-approved subset of that review — the 12 items below — prioritizing the
ones that turn the Dashboard and Production Board from "you can count problems"
into "you can find and act on problems." Trend analytics, push notifications,
capacity planning, and advanced alerting are explicitly excluded (see Out of
Scope) unless analysis proves one is a hard dependency of an in-scope item — it
does not (see `01_ANALYSIS.md`).

## Requirements

Numbered to match the review's finding IDs where one exists (`Fn`), for
traceability back to the review.

1. **Department queue counts in the switcher** (review F6). The Production
   Board's department switcher must show each department's
   waiting/in-progress/delayed counts, not just its name, so a supervisor can
   see which departments need attention without opening each one.
2. **Due date and time-in-stage visibility** (review F8). Each queue row must
   show its due date and how long it has sat in its current stage — not just a
   delayed/on-time badge.
3. **Clear visual indication for delayed/urgent jobs** (review F10). A
   delayed or urgent row must be visually distinguishable at a glance (color),
   not only via a small badge in one cell.
4. **Safe confirmation for destructive stage actions** (review F11). Fail
   (and, as the same class of action, Skip) must require an explicit
   confirmation step before executing — Complete stays low-friction since it's
   the common, low-risk path.
5. **Delayed-count indicator in navigation** (review F23/F29). The sidebar's
   "لوحة الإنتاج" entry must show the total delayed-job count the caller can
   see, so a problem is visible without opening the Dashboard or the board.
6. **Manual refresh** (review F5, manual-refresh half only — auto-poll is
   explicitly out of scope for this sprint). Both the Dashboard and Production
   Board must offer a manual refresh action and show when data was last
   loaded.
7. **Customer/job identity on Production Board rows** (review F9). Each queue
   row must show the customer name it belongs to, not only an internal work
   order number.
8. **Click-through from Dashboard widgets to the relevant jobs** (review F1).
   Dashboard widgets that represent a set of jobs (delayed, by department, by
   operator) must link into Production Board pre-filtered to that set.
9. **Queue filtering/search** (review F7). A department's queue must be
   filterable by priority and "delayed only," and searchable by order number
   or customer name.
10. **Cross-department view/timeline for a Work Order** (review F16). There
    must be a way to see one order's full journey across every department and
    stage it has passed through or is waiting on — not only its position in
    today's single department queue.
11. **Failed/reworked job visibility and a basic failure metric** (review
    F21). A stage instance marked `FAILED` must not simply vanish from the
    product. There must be at least one visible count of failures (e.g. "today"
    or "this week"), sourced the same way `dailyProductionCount` already is.
12. **Proper mobile Production Board layout** (review F26). The queue must be
    usable on a narrow (≈375px) screen without horizontal scrolling to reach
    the status or action columns — a real layout, not a scroll workaround.

## Explicitly Out of Scope

- Trend analytics / historical comparisons / sparklines (review F2, F22).
- Push notifications, email/SMS alerting, or any notification center beyond
  the sidebar count in Requirement 5 (review F23's "full alerting" half).
- Capacity planning / workload-vs-capacity indicators (review F18) — this is
  explicitly anticipated in VISION.md's future Capacity-Aware Marketing work,
  not this sprint's.
- Auto-refresh/polling (only manual refresh is in scope — see Requirement 6).
- Bulk queue actions (review F15).
- Stage-position indicator ("3 of 7") (review F12) — folds naturally into
  Requirement 10's timeline view if it turns out to be near-free there;
  otherwise deferred. Decided in `01_ANALYSIS.md`, not promised here.
- Any change to Workflow Engine business rules, routing logic, or the
  `advance`/`current-stage` transition semantics (FEATURE-004 stays frozen).
- Any Prisma schema migration — this sprint's scope, per the initial
  architectural inspection, does not require one (confirmed in
  `01_ANALYSIS.md`; if analysis had found otherwise, this would have been a
  stop-and-ask point).
- Any new permission catalog entry — every item reuses `work-orders.view` /
  `work-orders.edit`, already the gate for the whole Workflow Engine surface.

## Non-Negotiable Constraints (carried from the review approval)

- Single-source-of-truth stays intact: no widget, badge, or filter may
  calculate its own count — every number renders a value already computed by
  an existing service function (`getWorkflowDashboardSummary`,
  `getDepartmentQueue`) or a trivial client-side filter over data those
  functions already returned.
- No business logic duplicated into the frontend — delay computation, stage
  transition legality, and required-variable checks stay exactly where
  FEATURE-004 put them.
- No invented data. Where a requirement wants information the schema doesn't
  cleanly provide (e.g. a single-line "job description" for a multi-item
  order), the analysis says so explicitly and the plan does not fabricate a
  substitute.
- No fake/placeholder KPIs. Requirement 11's failure metric is a real count
  from real `WorkflowEvent` rows, following the exact pattern
  `dailyProductionCount` already established — not an estimate.
- Existing department-scoped access rules (`canAccessDepartment`,
  `accessibleDepartmentScope`) are reused as-is, never bypassed or
  re-implemented.
- The existing priority → due date → age queue ordering
  (`getDepartmentQueue`'s `orderBy`) is not changed by client-side filtering —
  a filter narrows the visible set, it never re-sorts it.
- The Dashboard widget/provider registry architecture
  (`DASHBOARD_WIDGETS`/`DASHBOARD_DATA_PROVIDERS`, `DashboardWidgetDefinition`)
  is extended, not replaced — new capability is new widgets/providers
  registered into it, same as every widget added in Sprint 1/2.
- Arabic RTL correctness (logical CSS properties, `*:text-start` table-header
  fix, the two documented `dir="ltr"` exceptions) is preserved in every new
  or changed screen.
- Mobile is a first-class layout target for the Production Board specifically
  (Requirement 12), not a horizontal-scroll accommodation.

## Documentation Lifecycle

This folder follows the same lifecycle as every prior feature/sprint in this
project: `00_REQUIREMENTS.md` (this file) → `01_ANALYSIS.md` → `02_PLAN.md` →
implementation → `03_IMPLEMENT.md` → `04_VERIFY.md` → `CHANGELOG.md`. Per the
user's explicit instruction, this turn stops after `02_PLAN.md` — no code is
written, and `03_IMPLEMENT.md`/`04_VERIFY.md`/`CHANGELOG.md` do not exist yet.
