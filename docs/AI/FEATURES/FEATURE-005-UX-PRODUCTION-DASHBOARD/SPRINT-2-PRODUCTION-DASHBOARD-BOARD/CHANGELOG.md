# FEATURE-005 — Sprint 2 (Production Dashboard & Production Board) — Changelog

**Backend**: one new read-only aggregate endpoint,
`GET /api/workflow-instances/dashboard-summary` — waiting/in-progress/
delayed/active-work-order totals, jobs by department, jobs by operator,
supplier delays, and today's completed-stage count, all from a single
query pass reusing the existing `computeIsDelayed` logic. Department
scope mirrors `canAccessDepartment`'s exact bypass rule via a new
`accessibleDepartmentScope()` helper. No schema change.

**Frontend — Production Board**: a new `/production-board` screen — the
first real UI over FEATURE-004's Workflow Engine, which was until now
verified entirely through direct HTTP calls. A department switcher,
a queue table (`StatusBadge` for status/priority/delay), and working
Complete/Fail/Skip/Edit actions against the existing `advance` and
`current-stage` endpoints.

**Frontend — Dashboard**: `WorkflowQueueSummaryProvider` now calls the
new aggregate endpoint once instead of fanning out across every
department client-side (Sprint 1's stand-in, now replaced by the
endpoint it was always waiting for) — cutting the Dashboard's own
network calls from 12 to 1. Five new widgets complete VISION.md's full
seven-view Production Dashboard: Jobs in Progress, Daily Production,
Jobs by Department, Jobs by Operator, Supplier Delays.

Zero `VISION.md` changes. All three milestones (backend endpoint,
Production Board, Dashboard widgets) verified — typecheck/lint/build/
test plus live — before the next began. Verified and closed.
