# FEATURE-004 — Workflow Engine — Analysis

## Critical Finding: `WorkOrder` Already Exists, and Its Existing Shape Contradicts This Feature's Own Architecture

`WorkOrder` has existed since Phase 1 (schema-only, "API/UI in Phase 8" per
its own section comment in `schema.prisma`, confirmed by ADR 0010). It
carries a `productionStatus` field typed as `WorkOrderProductionStatus`:

```
WAITING → DESIGN → PREPRESS → PLATE_MAKING → PRINTING → FINISHING
  → QUALITY_CHECK → READY_FOR_DELIVERY → COMPLETED
```

This is not a neutral status field — **it is a hardcoded Offset/Digital
Printing production pipeline, baked into a Postgres enum**, which is
exactly what VISION.md's Dynamic Workflow Engine forbids: "the Workflow
Engine must never contain hardcoded business logic for a specific
business line... Only the workflow template changes. The engine itself
never changes." A Stamp job (Quotation → Approval → Design → Send to
External Supplier → Receive → Quality Check → Delivery) or a Brass Plate
job cannot be expressed by this enum at all — it has no stage for
"External Supplier," no way to skip "Prepress" or "Plate Making" for a job
that never touches a printing press.

**This is safe to correct, not a breaking change**: zero `WorkOrder` rows
exist in any environment (confirmed by direct query — the table has never
been written to, since no application code has ever existed to write to
it) and zero application code anywhere references `WorkOrderProductionStatus`
(confirmed by search — no controller, service, or route touches
`WorkOrder` at all). This milestone is the first code ever written against
this table.

**Approved direction**: `WorkOrder.productionStatus`/
`WorkOrderProductionStatus` are **deprecated, not removed, this
milestone**. `WorkOrder` gains a relation to a Workflow Instance (§
below), which becomes the actual source of truth for "what stage is this
job at" from this milestone forward — `productionStatus` is marked with a
`/// @deprecated` doc comment, excluded from every new code path (no
service or controller written this milestone reads or writes it), and
left in the schema exactly as-is. Removal is explicitly deferred to a
future cleanup milestone, once enough time has passed that nothing could
plausibly still depend on it — not bundled into this one. This keeps the
milestone's migration purely additive (no column/enum removal at all),
simpler and lower-risk than the originally-analyzed alternative.

## What Already Exists and Is Directly Reusable

- **`DocumentSequence`/`DocumentType.WORK_ORDER`** — reserved since Phase
  1, unused until now. `WorkOrder.workOrderNumber` numbering reuses the
  exact `nextQuotationNumber`/`nextInvoiceNumber` pattern
  (`nextWorkOrderNumber`, same shape, third use of this mechanism).
- **`Branch`/`UserBranchAccess`** — the direct precedent for how a
  scoping concept (Branch) is a real, admin-manageable table plus a
  many-to-many access grant, not a hardcoded field. Department-Based
  Workflow's Department needs the identical shape (§ Open Decisions).
- **`Attachment`'s polymorphic-by-nullable-FK pattern** (`partnerId`/
  `quotationId`/`orderId`/`workOrderId`, all optional) — a Stage
  Instance's attachments are a fifth nullable FK on the same table, not a
  new attachment model. `Attachment.category` (added in FEATURE-003 M2)
  already anticipated exactly this kind of use.
- **`quotationService.ts`'s `LEGAL_STATUS_TRANSITIONS` table +
  `assertLegalStatusTransition`** — the direct precedent for stage
  routing (§7 of 00_REQUIREMENTS.md): a single, service-layer-only
  function is asked "is this stage transition legal," reading from data
  (`Next Stage`/`Failure Stage` on the stage configuration) rather than a
  hardcoded switch statement. The same shape, generalized from "one fixed
  enum's legal transitions" to "whatever the current Workflow Version's
  stage graph says."
- **FEATURE-003's non-destructive versioning** (`Quotation.version`/
  `previousVersionId`, a self-referencing `@unique` chain, new version =
  new row) — the direct precedent for Workflow Template versioning
  (00_REQUIREMENTS.md §2/§4): a new template version is a new row: the
  version a running Workflow Instance started on is frozen by FK, never
  mutated by a later publish.
- **`mapQuotationToDto(record, canSeeInternal)`** — the direct precedent
  for Workflow Visibility (00_REQUIREMENTS.md §9): one DTO, one mapping
  function, shaped by an explicit boolean the controller computes from
  the caller's own permissions — never two response types.
- **Soft-delete triad, `AuditLog`, `RolePermission`/`Permission`
  catalog** — every mechanical convention this session has used
  repeatedly (ADR 0007, ADR 0022) applies here exactly as everywhere
  else; no new convention needed for these.
- **`work-orders.view/edit/delete`** — already seeded (Phase 2), unused
  until now. Candidate for the execution side of this feature (§ Open
  Decisions resolves the split between this and template administration).

## What's Present but Needs a Decision, Not Just Reuse

- **`WorkOrder.productionStatus`/`WorkOrderProductionStatus`** — see
  Critical Finding above. Deprecated in place; a relation to a Workflow
  Instance becomes the real source of truth.
- **No `Department` model exists at all.** VISION.md's Department-Based
  Workflow lists representative departments (Sales, Design, Offset
  Printing, ...) as *examples*, the same way Workflow Templates lists
  Offset Printing/Stamp/etc. as examples — neither is meant to become a
  hardcoded list. `Department` needs to be a real, admin-manageable
  table, following the `Branch` precedent exactly.
- **No employee-to-department relationship exists.** `StaffProfile` has
  `branchId`/`UserBranchAccess` for branch scoping; nothing analogous
  exists for departments yet.

## Real Gaps (What This Milestone Actually Needs to Add)

Everything the two sections above don't already cover:

1. `WorkflowTemplate` (+ versioning fields/relation).
2. `WorkflowStage` (belongs to a specific template version, ordered,
   carries the full configuration list from 00_REQUIREMENTS.md §5).
3. `Department` (+ an employee/department relationship, shape TBD in
   02_PLAN.md — likely a primary `departmentId` on `StaffProfile` plus a
   `UserDepartmentAccess` join table, mirroring `UserBranchAccess`
   exactly, since VISION.md never suggests an employee belongs to only
   one department forever, and the Branch precedent already solved this
   exact "primary + additional access grants" shape).
4. `WorkflowInstance` (a template version being executed against a real
   business record — `WorkOrder` first, generic enough for a future
   Marketing/Design/Video job to attach the same way per
   00_REQUIREMENTS.md §6).
5. `StageInstance` (one row per stage a `WorkflowInstance` passes
   through — status, assignment, timing, waiting/blocking reasons, notes,
   external-supplier fields, priority/due-date/delay queue metadata, and
   the audit trail of what happened).
6. `WorkflowStageVariable` (a stage's dynamic-field definitions) — see
   Workflow Variables below.
7. `WorkflowEvent` (the domain-event feed) — see Workflow Events below.
8. The routing function (`assertLegalStageTransition` or equivalent) and
   the queue query (open `StageInstance` rows for a department, ordered
   by the new queue metadata).
9. New permission catalog entries — see § Permission Mapping.
10. `WorkOrder`'s own first-ever application code (controller/service/
    routes) — it has never had any — scoped to what this milestone
    actually needs (creation + reading), not a full CRUD surface.

## Workflow Variables — Design Reasoning

VISION.md's own Ready Product Workflow examples already contain data no
fixed `StageInstance` column could hold — Brass Door Plate's "Collect
Customer Text"/"Determine Size"/"Determine Options" stages, Acrylic
Sign's vinyl/acrylic handoff details. Without a dynamic-field mechanism,
the engine would face the exact pressure that produced
`WorkOrder.productionStatus` in the first place: add a business-line
column when a business line needs one. `WorkflowStageVariable` (definition
— key/label/dataType/required, belongs to the immutable published stage)
plus a single `StageInstance.variableValues` JSON column (the answers)
avoids that pressure entirely, and mirrors a pattern already proven in
this codebase: `QuotationItem.breakdown`/`OrderItem.breakdown` are the
same "structured-enough definition, flexible JSON payload" shape, reused
rather than reinvented. The engine validates *presence* of required
variables before allowing a stage to advance; it never interprets what a
variable *means* — that stays entirely inside template data.

## Workflow Events — Design Reasoning

`AuditLog` already exists and already gets a `STATUS_CHANGE` entry per
this plan's Business Rules — so why a second table? Because the intended
consumers are different. `AuditLog` answers "who did what, for security
and compliance review" — generic `entityType`/`action`/`previousValue`/
`newValue`, designed to be read by a person investigating an incident.
`WorkflowEvent` answers "what happened in this job's production, for
Timeline/Dashboard/Notifications/AI/Reporting/Analytics to consume" —
purpose-built rows (`eventType`, structured `payload`, the specific
instance/stage/department/timing those consumers actually need) so none
of them has to reverse-engineer meaning from a generic audit diff or poll
mutable `StageInstance` state. Both are written for the same transition;
neither is a duplicate of the other — the same way this project already
has both `AuditLog` and a business object's own status field without
treating one as redundant with the other.

## Queue Metadata — Design Reasoning

Priority and Due Date are new `StageInstance` columns (queue-ordering
data, no ranking algorithm implied — VISION.md's Budget-Aware Planning's
"Priority 1/2/3" framing is a future recommendation *engine* concern, not
this milestone's). Delay is **derived at read time**
(`dueDate < now() && status is open`), not a stored column — a stored
flag would need active maintenance (a job or trigger keeping it current)
that this milestone doesn't build, and a stale delay flag is worse than
none. This keeps the addition genuinely "queue metadata, not business
logic," per the instruction: no scheduler, no escalation, just data the
queue query can sort and filter on, plus one honest computed signal.

## Architectural Tension: Workflow Engine Architecture vs. a Single `WorkOrder` Type

VISION.md's Business Object Architecture says a Business Object exists
once, with multiple views. This feature introduces a second business
record type implicitly — is a future Marketing job also a `WorkOrder`, or
its own type that also attaches to a Workflow Instance?

**Resolved for this plan**: a Workflow Instance's link to "the business
record it belongs to" must not be a hardcoded FK to `WorkOrder` alone, or
every future module (Marketing, Design, Video) would need its own copy of
the Workflow Instance concept — the exact duplication VISION.md's No
Workflow Duplication forbids. 02_PLAN.md proposes the generic-owner shape
(polymorphic, `Attachment`-style nullable FKs, or a `sourceType`/
`sourceId` pair) so `WorkOrder` is this milestone's only real consumer,
without hardcoding the relation to only ever mean `WorkOrder`.

## Business Object Architecture Applied

- **Workflow Template** — one object, versioned, never a second parallel
  "template draft" table.
- **Workflow Instance** — one object per running job, viewed differently
  by production staff (full detail) vs. a future customer/portal caller
  (status only), via `canSeeInternal`, per Workflow Visibility.
- **`WorkOrder`** — after this milestone, a thin identity/numbering
  record whose production state is *read from* its Workflow Instance, not
  a second copy of that state.

## Service Boundaries (Reuse Before Create)

Following FEATURE-003's own reasoning ("top-level resource, not nested
under partners, since a Quotation references a partner but isn't owned by
it"): `WorkflowTemplate` is owned by nothing — top-level
`/api/workflow-templates`. A `WorkflowInstance` is created *for* a
`WorkOrder`, but is queried independently (a department's queue spans
every `WorkOrder`) — top-level `/api/workflow-instances`, with
`/api/work-orders/:id` exposing its own instance inline, the same way
`GET /api/quotations/:id` inlines its items rather than requiring a
second call.

## Permission Mapping

Two distinct concerns, following the `roles`/`permissions` split
precedent (administering the rules vs. operating within them):

- **`workflow-templates.*`** (new module) — authoring
  templates/versions/stages. An administrative concern, not a
  production-floor one.
- **`work-orders.*`** (existing, unused) — creating/viewing a `WorkOrder`
  and advancing its Workflow Instance through stages. `work-orders.edit`
  ("Update work order production status," already labeled exactly this
  in the Phase 2 seed) is the natural fit for stage advancement — no
  label change needed, the seed already anticipated this.
- **Department-scoped queue access** is a data-scoping question (which
  department's queue can this caller see), not a new permission action —
  resolved the same way Branch scoping already is (`canAccessBranch`),
  via a `canAccessDepartment`-shaped check in 02_PLAN.md, not a
  proliferation of per-department permission keys.

## Open Decisions Resolved for the Plan (not left ambiguous)

- **Department is global, not per-branch.** A Branch already answers
  "where"; Department answers "what kind of work" — the two axes are
  independent (a "Design" department exists the same way at every
  branch that has one), so `Department` is not itself branch-scoped.
  Which branch's queue a `StageInstance` belongs to is read from its
  owning business record's existing `branchId`, not a new
  Department-Branch relationship.
- **`WorkOrder.productionStatus` is deprecated, not removed**, this
  milestone — a relation to its `WorkflowInstance` becomes the real
  source of truth alongside it. See Critical Finding.
- **Versioning mechanism mirrors Quotation's exactly** — self-referencing
  chain, new version = new row, no separate "draft" concept — reusing a
  pattern already proven in this codebase rather than inventing a second
  versioning shape.
- **Stage-instance-to-owner linkage is generic** (not a hardcoded
  `workOrderId`), specifically so `WorkOrder` isn't secretly the only
  thing this engine can ever attach to — see Architectural Tension above.
