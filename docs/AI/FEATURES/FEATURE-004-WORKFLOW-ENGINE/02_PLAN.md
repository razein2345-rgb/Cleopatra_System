# FEATURE-004 — Workflow Engine — Plan

**Status: Approved, with four refinements applied throughout this
document** (see each section below): (1) `WorkOrder.productionStatus` is
deprecated in place, not removed, this milestone; (2) Workflow Variables
— per-stage dynamic required/optional fields; (3) Workflow Events — an
append-only domain-event feed, distinct from `AuditLog`; (4) Department
Queue metadata — Priority, SLA, Due Date, Estimated Duration, Delay,
Assigned Employee, Waiting Reason.

This plan covers **Milestone 1 — Workflow Engine Foundation**: the
generic engine's schema and API, backend-only, with `WorkOrder` as its
first real consumer. No production-specific template is authored as
code; no frontend beyond what's needed to verify the API live is built
this milestone.

## Database

### `Department` (new)

The admin-manageable list VISION.md's Department-Based Workflow describes
as examples, not a hardcoded enum — same shape as `Role`:

- `id`, `name` (editable label), `code` (stable, unique, machine-referenced
  — the `Role.name` pattern), `description`.
- Soft-delete triad.
- Seeded with the representative list from VISION.md (Sales, Design,
  Offset Printing, Digital Printing, Plate Preparation, Finishing,
  Warehouse, Purchasing, External Supplier, Delivery, Customer Service) as
  **starting data an administrator can rename, add to, or remove** — not
  `isSystem`-protected, since unlike `Role`, no code ever branches on a
  specific department's identity.

### `UserDepartmentAccess` (new)

Direct precedent: `UserBranchAccess`. `StaffProfile` gains an optional
`departmentId` (home department) plus this many-to-many table for
additional department access — the same "home + explicit grants" shape
Branch access already uses, reused rather than reinvented.

### `WorkflowTemplate` (new)

- `id`, `code` (stable identity shared across a template's versions —
  e.g. `OFFSET_PRINTING` — how "start a new job on the current Offset
  Printing template" resolves without walking a version chain),
  `name` (display label), `description`.
- `version` (Int), `previousVersionId` (self-referencing, `@unique`,
  same non-destructive chain as `Quotation.previousVersionId`).
- `publishedAt` (nullable — null means draft/editable; once set, this
  version's stages are immutable — see Business Rules).
- `@@unique([code, version])`. "Latest published version for code X" is a
  plain query (`where: { code, publishedAt: { not: null } }, orderBy: {
  version: 'desc' }, take: 1`), not a chain walk.
- Soft-delete triad.

### `WorkflowStage` (new)

Belongs to one `WorkflowTemplate` version. Every field from
00_REQUIREMENTS.md §5: `templateId`, `order` (Int, position within the
version), `name`, `stageType` (`INTERNAL`/`EXTERNAL` — a Prisma enum is
fine here since "what a stage type is" is a structural engine concept,
not a business line, unlike `QuotationItem.itemType`), `departmentId`,
`defaultAssignedEmployeeId` (nullable), `estimatedDurationMinutes`,
`requiresFiles`, `requiresApproval`, `requiresCostEntry`,
`requiresTimeTracking`, `isMandatory` (vs. optional), `canSkip`,
`nextStageId`/`failureStageId` (nullable self-references within the same
template version — the routing graph), `internalVisible`,
`customerVisible`, and its ordered set of `WorkflowStageVariable`
definitions (below).

### `WorkflowStageVariable` (new — Refinement 2)

A stage's dynamic-field definitions — how a Brass Plate's "Collect
Customer Text" or an Acrylic Sign's size/options gets captured without a
hardcoded column per business line (01_ANALYSIS.md's Workflow Variables
reasoning):

- `id`, `stageId`, `key` (machine name, unique within its stage —
  e.g. `customer_text`), `label` (display name), `dataType`
  (`TEXT`/`NUMBER`/`BOOLEAN`/`DATE`/`SELECT` — a small, fixed, structural
  enum; the *options* for `SELECT` are data, not a schema concern),
  `selectOptions` (`Json?`, only meaningful for `SELECT`), `isRequired`,
  `order`.
- Belongs to the same immutable-once-published stage its parent
  `WorkflowStage` does — no separate publish state of its own.

### `WorkflowInstance` (new)

The running counterpart to a template version. Owner linkage follows
`Attachment`'s established multi-nullable-FK pattern (rather than a
generic `ownerType`/`ownerId` pair) — real FK integrity, and a future
module (e.g. a Marketing Job) adds its own nullable column the same way
`Attachment` already has four:

- `id`, `templateId` (the exact version this instance started on —
  frozen forever, per Workflow Versioning), `workOrderId` (nullable,
  `@unique` — one instance per work order this milestone), `status`
  (`IN_PROGRESS`/`COMPLETED`/`CANCELLED` — structural, not business-line),
  `currentStageId`.
- Soft-delete triad, `createdAt`/`updatedAt`.

### `StageInstance` (new)

One row per stage a `WorkflowInstance` passes through:

- `id`, `workflowInstanceId`, `stageId` (which `WorkflowStage` this is),
  `departmentId` (denormalized from `stageId.departmentId` at creation —
  immutable, since the source stage is immutable once published; queue
  lookups filter on this column directly rather than joining through
  `WorkflowStage` on every query, the same "snapshot for query
  performance" reasoning as `OrderItem.breakdown`).
- `status` (`WAITING`/`IN_PROGRESS`/`DONE`/`SKIPPED`/`FAILED`),
  `assignedEmployeeId` (mutable — reassignment happens),
  `assignedSupplierId`/supplier fields (external stages only — see
  below), `startedAt`, `finishedAt`, `estimatedDurationMinutes`
  (copied from the stage at creation, same snapshot reasoning),
  `actualDurationMinutes` (computed or stored at completion),
  `waitingReason`, `blockingReason`, `notes`.
- **Queue metadata (Refinement 4)**: `priority`
  (`WorkflowPriority` — `LOW`/`NORMAL`/`HIGH`/`URGENT`, default `NORMAL`;
  a structural ranking, not a rules engine) and `dueDate` (`DateTime?`).
  `isDelayed` is **not** a stored column — computed at read time in the
  queue/instance DTO (`dueDate` in the past and status still open), per
  01_ANALYSIS.md's Queue Metadata reasoning (no stale flag to maintain).
  SLA/Estimated Duration/Assigned Employee/Waiting Reason are already
  covered by the fields above — queue metadata reuses them rather than
  duplicating.
- **`variableValues` (`Json?`, Refinement 2)** — the answered values for
  its stage's `WorkflowStageVariable` definitions, keyed by `key`.
  Validated for required-variable presence in the routing function (§
  Business Rules), not at the database level.
- External-stage fields (VISION.md's External Supplier Workflow,
  populated only when the stage is `EXTERNAL`): `sentDate`,
  `expectedReturnDate`, `actualReturnDate`, `externalCost`,
  `supplierStatus`. No separate "external stage instance" table —
  external stages behave exactly like internal ones everywhere else in
  the engine (00_REQUIREMENTS.md §2), so the fields live on the same
  `StageInstance` row, simply unused for internal stages.
- `createdAt`/`updatedAt` (the row's own timestamps are part of the
  timeline alongside `WorkflowEvent`, below).

### `WorkflowEvent` (new — Refinement 3)

The append-only domain-event feed 01_ANALYSIS.md's Workflow Events
reasoning describes — distinct from, and written alongside, `AuditLog`:

- `id`, `workflowInstanceId`, `stageInstanceId` (nullable — instance-level
  events like `INSTANCE_COMPLETED` have none), `eventType`
  (`INSTANCE_STARTED`/`STAGE_STARTED`/`STAGE_COMPLETED`/`STAGE_SKIPPED`/
  `STAGE_FAILED`/`INSTANCE_COMPLETED`/`INSTANCE_CANCELLED` — structural,
  fixed, an engine concept the same way `StageType`/`InstanceStatus` are),
  `payload` (`Json` — a structured snapshot: department, assignee,
  duration, whatever that event type needs, so a consumer never joins
  back to current state), `performedById` (nullable — future automation
  may write events with no human actor), `occurredAt` (`DateTime @default(now())`).
- Append-only: no `UPDATE`/`DELETE` path in this milestone's API —
  correcting history is a future concern, not this one's.

### `Attachment` (extended)

One new nullable FK: `stageInstanceId`, following the exact pattern
`orderId`/`quotationId`/`workOrderId` already established.

### `WorkOrder` (changed — Refinement 1)

Per the approved direction: `productionStatus`/`WorkOrderProductionStatus`
are **kept, marked `/// @deprecated — superseded by WorkflowInstance;
do not read or write from new code`, and touched by nothing this
milestone writes.** `WorkOrder` gains the reverse relation to its
`WorkflowInstance`, which is the real source of truth from this milestone
forward. Everything else (`workOrderNumber`, `orderId`, `branchId`,
`attachments`, soft-delete triad) is unchanged. This makes the migration
**purely additive** — no column or enum is removed, simpler and lower-risk
than the originally-proposed removal. Actually deleting the field is
explicitly deferred to a future cleanup milestone.

### Permission Catalog

Two new modules (ADR 0022's pattern — a `Permission` row + seed grant per
action, no code-level role checks):

- `workflow-templates` — `view`/`create`/`edit`/`delete`/`publish`
  (publish is separate from edit: editing a draft and publishing a
  version — making it immutable and available for new instances — are
  different-weight actions, the same reasoning `quotations.convert` is
  separate from `quotations.edit`).
- `work-orders` — reuse existing `view`/`edit`/`delete` unchanged;
  `edit` already means "update work order production status" per its
  Phase 2 label — stage advancement fits this label exactly, no new
  permission key needed.
- `departments` — folded into `settings.*` (Department is reference data,
  the same category as `SheetType`/`SizeFamily`), not a new module.

### Row Level Security (ADR 0029/0030)

Every new table is backend-only, like every existing one — `ENABLE ROW
LEVEL SECURITY` + the standard `backend_only_deny_direct_access` policy
on `Department`, `UserDepartmentAccess`, `WorkflowTemplate`,
`WorkflowStage`, `WorkflowStageVariable`, `WorkflowInstance`,
`StageInstance`, and `WorkflowEvent`, per VISION.md's now-mandatory rule
and MASTER_PROMPT.md's Database Checklist. Part of this milestone's own
Database Checklist, not a follow-up task.

## API

- `GET/POST /api/workflow-templates`, `GET /api/workflow-templates/:id`
  — list/create/read. Create starts a new **draft** (`publishedAt: null`).
- `PUT /api/workflow-templates/:id` — edit a draft's own fields
  (name/description) and its stages (full replace-set, matching
  `updateQuotationSchema`'s items-replace-not-patch precedent). Rejected
  once `publishedAt` is set (see Business Rules).
- `POST /api/workflow-templates/:id/publish` — sets `publishedAt`,
  making this version immutable and eligible for new instances.
  `workflow-templates.publish`.
- `POST /api/workflow-templates/:id/versions` — new draft version, copying
  the current stage set (mirrors `POST /api/quotations/:id/versions`
  exactly).
- `GET/POST /api/departments`, `PUT/DELETE /api/departments/:id` — under
  `settings.*`, alongside the existing reference-data screens.
- `POST /api/work-orders` — creates a `WorkOrder` for an `Order` plus its
  `WorkflowInstance` on the requested template's latest published
  version, in one transaction (mirrors quotation-conversion's
  create-plus-link transaction shape).
- `GET /api/work-orders/:id` — inlines its `WorkflowInstance` and current
  `StageInstance` list, the same way a Quotation inlines its items.
- `PUT /api/workflow-instances/:id/advance` — the one mutation path for
  moving a `WorkflowInstance`'s current stage forward (or to its failure
  stage), enforcing the routing table server-side. `work-orders.edit`.
- `PUT /api/workflow-instances/:id/current-stage` — queue metadata editing
  (priority/due date/assignee/waiting reason, Refinement 4) on the current,
  still-open stage instance. Deliberately separate from `.../advance`:
  never changes `status`, never writes a `WorkflowEvent` (only real
  transitions do). `work-orders.edit`.
- `GET /api/workflow-instances/queue?departmentId=` — open `StageInstance`
  rows for a department, ordered by priority then due date (Refinement
  4), each row carrying its queue metadata (priority, due date, estimated
  duration, computed delay, assigned employee, waiting reason) — the
  Queue View capability (00_REQUIREMENTS.md §8/§12), API-level only this
  milestone.
- `GET /api/workflow-instances/:id` — full timeline (every `StageInstance`
  for that instance, in order) for a single job.

## Business Rules

- **A published `WorkflowTemplate` version (and its stages) is
  immutable.** `PUT .../:id` on a published template is rejected —
  changes go through `POST .../:id/versions` instead, mirroring
  Quotation's own versioning discipline exactly.
- **Stage routing is service-layer-only.** A `WorkflowStage`'s own
  `nextStageId`/`failureStageId` is the only source of legal movement;
  `assertLegalStageTransition` (or equivalently named) is the one place
  this is decided, matching `assertLegalStatusTransition`. No
  route/controller/frontend code encodes "what comes after Design."
- **A new `WorkOrder` always starts on the latest published version** of
  its requested template; **a running `WorkflowInstance` keeps the exact
  version it started on forever** — publishing a new version has zero
  effect on it (00_REQUIREMENTS.md §2, directly verified in testing —
  see Verification Plan).
- **A `StageInstance`'s department is frozen at creation** (denormalized
  from its stage) — a department's queue composition never silently
  changes because an unrelated template got a new version.
- **Visibility follows the `canSeeInternal` precedent exactly** — one
  `WorkflowInstance`/`StageInstance` DTO shape, internal-only fields
  (department, assignee, cost, internal notes) nulled for a caller
  without the relevant grant, never a second response type.
- **No new `AuditAction` enum value** — stage transitions and instance
  creation reuse `CREATE`/`STATUS_CHANGE` (`entityType: 'WorkflowInstance'`
  or `'StageInstance'`), matching this session's established "reuse the
  generic values unless a genuinely new relationship concept exists"
  discipline; nothing about a stage transition is a new *kind* of
  relationship the way `PIN`/`CATEGORY_CHANGED` were.
- **Every transition also writes a `WorkflowEvent` (Refinement 3),
  independent of the `AuditLog` entry above** — both are written in the
  same transaction as the state change itself, never as an afterthought;
  a transition that fails to advance never produces either.
- **A stage instance with an unanswered required `WorkflowStageVariable`
  cannot advance** (Refinement 2) — `assertLegalStageTransition` checks
  variable completeness the same call it checks routing legality, one
  guard, not two independent checks that could disagree.
- **`WorkOrder.productionStatus` is never read or written by any code
  this milestone adds** (Refinement 1) — `WorkflowInstance`/
  `StageInstance` are the only source of truth `WorkOrder`'s own new
  controller/service consult.

## Frontend

**None this milestone**, beyond what live verification needs (a thin
JSON/API exercise, not a screen) — deliberately deferred. This plan's
scope is already large (six new tables, a routing engine, a queue query,
retrofitting `WorkOrder`); bundling a template-authoring UI and a queue UI
into the same milestone would violate the "small, independently
verifiable slices" discipline FEATURE-003 itself used to split M1/M2.
Proposed (not decided) as a separate Milestone 2, once this foundation is
verified and approved:

- A template/stage authoring screen (admin-only, `workflow-templates.*`).
- A department queue screen (the actual Queue View, per Queue Philosophy
  — "an employee simply works from the next available item").
- A `WorkflowInstance` timeline view, inlined into `WorkOrder` detail.

## Verification Plan

Same standard as every milestone this session: `prisma format`/
`validate`/`generate`, review the generated migration (purely additive —
no column/enum removal, per Refinement 1), typecheck/lint/build across
`shared`/`api`/`web`, then live verification against the running dev
environment:

- Create a Department, a draft `WorkflowTemplate` with several stages
  (including one `EXTERNAL` stage and one stage with a required
  `WorkflowStageVariable`) and a routing graph with a branch (a failure
  stage), publish it.
- Create a `WorkOrder` (against a real converted Order) on that template
  — confirm its `WorkflowInstance` starts on the exact published version,
  and confirm `WorkOrder.productionStatus` is untouched (still its
  default) — proving the deprecated field really is dead code, not just
  documented as such.
- Attempt to advance past the stage with a required variable **before**
  answering it — confirm rejected. Answer it, then advance — confirm
  accepted.
- Advance through stages via `PUT .../advance`; confirm an illegal
  transition (skipping to a stage not reachable from the current one) is
  rejected server-side.
- Confirm a `WorkflowEvent` row exists for every successful transition
  (and none for the rejected attempts above — a rejected mutation never
  happened, same precedent as every prior milestone's illegal-transition
  tests).
- Confirm the department queue (`GET .../queue?departmentId=`) reflects
  exactly the open `StageInstance` rows for that department and only that
  department, correctly ordered by priority/due date, with delay computed
  correctly for a stage instance given a past due date.
- **Publish a second template version and confirm the already-running
  `WorkflowInstance` is completely unaffected** — the single most
  important behavior this milestone must prove, directly from
  00_REQUIREMENTS.md §2.
- Confirm internal fields are actually absent from a response shaped for
  a caller without `work-orders.edit`/`workflow-templates.view`-equivalent
  grant (not just hidden in a UI that doesn't exist yet).
- Confirm every new table has RLS enabled with the standard deny policy
  (Database Checklist), and that Prisma/the Express API are unaffected
  (`postgres`/`service_role` bypass, per ADR 0029 — same live-verification
  method already used for the RLS Finalization work).
- Clean up all test data afterward (soft-delete), consistent with every
  prior milestone.

## Remaining Work (Explicitly Not This Plan)

- Milestone 2 — the frontend listed above.
- Milestone 3 — SLA breach alerting, automation-hook execution, the
  Production Dashboard (VISION.md is explicit these are designed-for, not
  built, until their own milestone).
- Authoring the real production-line templates (Offset Printing, Digital
  Printing, Stamp, T-Shirt, Acrylic Sign, Brass Plate) as **data**,
  through the API this milestone builds — not code, and not this
  milestone's job to create.
- The Pricing Engine — deprioritized by this request, unaffected by
  anything in this plan.

---

**Approved.** Proceeding to Milestone 1 implementation against this plan,
with the four refinements applied throughout. See `03_IMPLEMENT.md` and
`04_VERIFY.md` for what was actually built and how it was verified.
