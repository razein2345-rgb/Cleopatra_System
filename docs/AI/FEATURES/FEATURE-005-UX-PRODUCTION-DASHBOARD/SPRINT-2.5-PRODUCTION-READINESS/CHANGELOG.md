# FEATURE-005 — Sprint 2.5 (Production Readiness) — Changelog

Implements the highest-value findings from `PRODUCTION_READINESS_REVIEW.md`
(Quick Wins + top Sprint 2.5 items), turning the Dashboard and Production
Board from "you can count problems" into "you can find and act on them."

**Backend** (additive only, no migration): `GET /api/workflow-instances/
queue` rows now include `customerName` (via the existing `WorkOrder → Order
→ BusinessPartner` relation); `GET /api/workflow-instances/dashboard-summary`
gained `failedToday`, following the exact `dailyProductionCount` pattern
against `WorkflowEvent`'s existing `STAGE_FAILED` events.

**Production Board**: due date, time-in-stage, and customer-name columns;
delayed/urgent row tinting; a priority/delayed-only/search filter bar over
the already-sorted queue; a real mobile card layout (no horizontal scroll)
below the `sm` breakpoint; a confirmation step before Fail/Skip (Complete
stays one click); a manual refresh button with a last-updated timestamp; a
"عرض المسار الكامل" link on every row into a new read-only, cross-department
Work Order timeline (`/production-board/timeline/:workflowInstanceId`,
reading the existing, unchanged `GET /workflow-instances/:id`).

**Dashboard & navigation**: the Jobs by Department widget's rows now link
into Production Board pre-filtered to that department (`?department=<id>`);
a manual refresh button and last-updated label; a delayed-job count badge on
the sidebar's "لوحة الإنتاج" entry, via an independent lightweight fetch
(same pattern `Topbar.tsx` already uses for branches) rather than lifting
the Dashboard's own provider.

**Deliberately not done this sprint** (see `03_IMPLEMENT.md`/`04_VERIFY.md`
for the reasoning): `DelayedJobsWidget` and `JobsByOperatorWidget` were not
made clickable — both are cross-department aggregates Production Board's
per-department queue view cannot represent without landing on an arbitrary
department, which would have been misleading. No job/item description
beyond the customer name — nothing was approximated from `OrderItem`. No
trend analytics, alerting beyond the sidebar badge, capacity planning, or
auto-refresh — all explicitly out of scope per the approved plan.

Zero `VISION.md` changes, zero new permission catalog entries, zero
duplicated Workflow Engine logic in the frontend. All six milestones
verified — typecheck/lint/build/test plus live — before the next began, plus
a final full-repo regression pass after M6. Verified and closed.
