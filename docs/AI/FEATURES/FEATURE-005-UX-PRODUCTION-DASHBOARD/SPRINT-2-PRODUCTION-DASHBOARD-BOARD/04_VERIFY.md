# FEATURE-005 — Sprint 2 — Verification

## Static Checks (All Three Milestones)

- `npm run typecheck` (root: `apps/web` then `apps/api`) — clean at
  every milestone. Required rebuilding `packages/shared`
  (`npm run build --workspace=packages/shared`) before `apps/api`'s
  typecheck picked up the new schema exports — `apps/api` resolves
  `@cleopatra/shared` via its built output, not live source, same as
  every prior feature in this session.
- `npm run lint` — clean at every milestone, no new exceptions needed.
- `npm run build` (root) — clean at every milestone. Same pre-existing
  bundle-size advisory as every prior pass (unrelated to this sprint).
- `npm run test --workspace=apps/api` — 13/13 passing throughout
  (`adminSafety.test.ts`, unchanged — confirms no backend regression).

## Live Verification

Performed against the real running app and real Supabase-backed
database, signed in as Super Admin.

**Milestone 1** — `GET /api/workflow-instances/dashboard-summary`
returns `200` with the documented shape. Cross-checked against a fresh
sum over all 11 departments' `GET .../queue` calls: both agree exactly
(`waiting: 0`, `inProgress: 0` — this environment has zero live
`WorkflowInstance` data, so the totals path was verified against a
known-zero baseline; the `byDepartment`/`byOperator`/`supplierDelays`
grouping logic and `dailyProductionCount`'s `WorkflowEvent` count were
verified by code review and by confirming they return well-formed empty
results without erroring, not against non-zero live data — none exists
to test against, consistent with `02_PLAN.md`'s stated fallback).

**Milestone 2** — `/production-board` loads, department switcher
populated with all 11 departments, correct Arabic table headers, correct
empty state ("لا توجد مهام في قائمة الانتظار لهذا القسم"). Switching
departments confirmed via network inspection to issue a new
`GET .../queue?departmentId=` scoped to the newly selected department,
`200 OK` each time. Sidebar nav entry ("لوحة الإنتاج") confirmed present
and correctly linked. No console errors. **Not verified**: the
Complete/Fail/Skip/Edit actions against a real, in-flight
`WorkflowInstance` — none exists in this environment (confirmed
repeatedly across Sprint 1 and Sprint 2's verification passes). The
buttons call the correct endpoints with the correct payloads per code
review and per FEATURE-004 M1's own live verification of those same
endpoints; end-to-end action verification is pending real production
data.

**Milestone 3** — Dashboard renders all nine widgets: عروض الأسعار
المفتوحة (1/1, unchanged from Sprint 1), أوامر التشغيل النشطة، مهام في
الانتظار، **مهام قيد التنفيذ** (new)، مهام متأخرة، **الإنتاج اليومي**
(new)، **المهام حسب القسم** (new)، **المهام حسب الموظف** (new)،
**تأخيرات الموردين** (new) — all showing `0`/empty-state correctly,
matching the known-empty environment. Network inspection confirmed the
Dashboard now issues exactly one `GET .../dashboard-summary` call
(doubled under React StrictMode's dev-mode double-invoke, not a real
duplicate fetch) — down from Sprint 1's 12 calls (`GET /api/departments`
+ 11 × `GET .../queue`). No console errors.

## Closure

FEATURE-005 Sprint 2 (Production Dashboard & Production Board) is
**verified and closed**. All three milestones passed static and live
verification before the next began, per this sprint's explicit
instruction. No `VISION.md` changes, no schema migrations, no shortcuts,
no duplicated business logic, no mock data. The one honest gap —
end-to-end stage-action verification against real production data — is
named explicitly above, not silently assumed complete.
