# FEATURE-004 — Workflow Engine — Verification

> Executed against real records created and then cleaned up through the
> real API (and, where no API exists yet — e.g. `WorkflowEvent` has no
> delete endpoint by design — directly via Prisma) in this session, not
> simulated.

## Milestone 1 (Workflow Engine Foundation)

### Build / Typecheck / Lint

- [x] `npx prisma format`/`validate`/`generate` — clean.
- [x] Migration reviewed before applying (Migration Safety Rule) — purely
      additive: 6 new enums, 8 new tables, one nullable column each on
      `Attachment`/`StaffProfile`. **No `DROP`, no column removal** — the
      approved Refinement 1 direction (deprecate, don't remove) kept this
      milestone's migration simpler and lower-risk than the originally
      analyzed alternative.
- [x] RLS `ENABLE` + `backend_only_deny_direct_access` policy included in
      the same migration for all 8 new tables (Database Checklist) —
      confirmed live via direct introspection: all 8 tables
      `rowsecurity = true`, all 8 with exactly the standard policy.
- [x] `apps/api`/`apps/web` typecheck, lint, and `npm run build`
      (shared → api → web) — all clean.
- [x] Existing `vitest` suite (Safety Fix's `AdminSafetyService` tests) —
      13/13 still passing, untouched by this feature.

### Backend — verified live (real records, real HTTP requests via the
running dev API, all test data soft-deleted or removed afterward)

- [x] **Template authoring + versioning**: created a draft
      `WorkflowTemplate` (4 stages: Design → Offset Printing → External
      Finishing, with Offset Printing's failure path routing to a
      "Reprint Needed" stage) using `tempKey`-based stage references —
      confirmed the failure stage's real id was correctly resolved from
      its `tempKey` in the response. Published it.
- [x] **`WorkOrder` creation starts the exact published version**:
      `POST /api/work-orders` against a real converted Order → `201`,
      `WorkflowInstance` created on the published template, current
      stage `Design` — confirmed via response inspection, not assumed.
- [x] **`WorkOrder.productionStatus` genuinely untouched**: direct DB
      query after the instance had advanced through two real stage
      transitions still showed `WAITING` (its default) — proving the
      deprecated field is dead code, not just documented as such.
- [x] **Required Workflow Variable enforced**: `PUT .../advance` with
      `action: COMPLETE` and no `variableValues` → `400
      MISSING_REQUIRED_VARIABLES` naming the missing key. Same call with
      the variable answered → `200`, moved to Offset Printing.
- [x] **Illegal stage transition rejected**: `SKIP` on a stage with
      `canSkip: false` → `400 ILLEGAL_STAGE_TRANSITION`.
- [x] **Queue metadata**: `PUT .../current-stage` set `priority: URGENT`
      and a past `dueDate` on the open stage instance → `200`, response
      showed `isDelayed: true` (computed, not stored) and the
      `waitingReason` set.
- [x] **Department queue, correctly scoped**: `GET .../queue?departmentId=`
      for Offset Printing returned exactly the one open stage instance,
      carrying its priority/delay/`workOrderNumber` — and the *same*
      stage instance was confirmed **absent** from the Design
      department's queue (no cross-department leakage).
- [x] **Advanced into the External stage**: completing Offset Printing
      moved the instance to "External Finishing" (`stageType: EXTERNAL`).
- [x] **Versioning immutability — the single most important behavior this
      milestone had to prove**: published a second template version
      (`version: 2`) for the same `code` *while the first instance was
      still mid-flight on the External Finishing stage*. Re-fetched the
      running instance: still `templateId`/`templateVersion` pointing at
      version 1, completely unaffected. A **second**, independent
      `WorkOrder` created immediately afterward (a real second
      Quotation → Order → conversion cycle) correctly started on version
      2 — confirmed via `templateVersion: 2` in its response.
- [x] **`WorkflowEvent` audit trail matches exactly**: a direct query for
      the first instance returned precisely 6 events in order —
      `INSTANCE_STARTED`, `STAGE_STARTED`×3, `STAGE_COMPLETED`×2 — one
      per real transition performed, **zero** for the two rejected
      attempts (missing variable, illegal skip), matching the "a
      rejected mutation never happened" precedent already established
      for `AuditLog` elsewhere in this project.
- [x] Test data (2 partners' worth of quotations/orders/work orders/
      instances, both template versions) cleaned up afterward — soft
      deletes via existing endpoints where they exist, direct Prisma
      updates where no delete endpoint exists yet by design
      (`WorkflowInstance`, `WorkOrder`, `Order` have none — out of scope
      per `00_REQUIREMENTS.md` §3).

### Known Limitations (M1)

- [ ] Customer View (`canSeeInternal: false`) — verified by code
      inspection only (`mapWorkflowInstanceToDto`'s `customerVisible`
      filtering and `mapStageInstanceToDto`'s field nulling mirror the
      already-live-verified `mapQuotationToDto`/`mapOrderToDto` pattern
      exactly), not live-tested with a second, non-privileged account —
      same limitation and justification as every prior milestone this
      session.
- [ ] `canAccessDepartment`'s non-Super-Admin, non-`work-orders.edit`
      branch (a caller scoped to only their own department) was verified
      by code inspection only — the only real account in this
      environment is `SUPER_ADMIN`, which bypasses department scoping
      entirely by design.
- [ ] No frontend UI exists yet (deliberately deferred — see
      `02_PLAN.md`'s proposed Milestone 2).
- [ ] SLA-breach alerting, automation-hook execution, and the Production
      Dashboard remain explicitly out of scope, per `00_REQUIREMENTS.md`
      §3.
- [ ] No automated tests added specifically for this milestone's logic
      (`assertLegalStageAction`/`assertRequiredVariablesPresent`/
      `computeIsDelayed` are pure functions and good unit-test
      candidates — not written this round; the existing `vitest`
      infrastructure from the Safety Fix could host them).

---

## Status

**Ready for Review.** Build, typecheck, and lint are clean; the existing
test suite is unaffected. Every business rule this milestone introduces —
non-destructive template versioning (with running instances genuinely
unaffected by a later publish, not just declared so), service-layer-only
stage routing, required-variable enforcement, department-scoped queues,
and the independent `WorkflowEvent`/`AuditLog` trails — was verified
against the real, live system, including the one behavior most likely to
have been wrong if implemented carelessly (versioning immutability),
proven with two independently created `WorkOrder`s on two different
template versions running side by side correctly.
