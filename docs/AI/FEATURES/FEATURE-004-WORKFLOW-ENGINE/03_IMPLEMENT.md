# FEATURE-004 — Workflow Engine — Implementation

> See `00_REQUIREMENTS.md`, `01_ANALYSIS.md`, and `02_PLAN.md` for what was
> requested, what already existed, and what was decided before any code was
> written — including the four refinements applied throughout (see each
> document's own notes).

## Milestone 1 — Workflow Engine Foundation

**Status: Implemented.** The generic engine only — no production-specific
template exists as code (00_REQUIREMENTS.md §3).

### As Implemented

- **Eight new tables**: `Department`, `UserDepartmentAccess`,
  `WorkflowTemplate`, `WorkflowStage`, `WorkflowStageVariable`,
  `WorkflowInstance`, `StageInstance`, `WorkflowEvent`. All RLS-enabled
  with the standard `backend_only_deny_direct_access` policy in the same
  migration that created them (Database Checklist).
- **`WorkOrder.productionStatus` deprecated, not removed** (Refinement
  1) — marked `/// @deprecated` in the schema, untouched by any new code,
  confirmed live still at its default `WAITING` after a full instance ran
  through three stages. `WorkOrder.workflowInstance` is the real state.
- **Workflow Templates are versioned exactly like Quotations**: `code`
  (stable identity across versions) + `version` + `previousVersionId`
  chain; `publishedAt` null = draft (freely editable, full stage
  replace-set on every `PUT`), non-null = immutable. `POST .../versions`
  copies the current stage graph into a new draft, resolving
  `nextStageId`/`failureStageId` via each stage's own id (not tempKeys,
  since the source stages already have real ids).
- **Stage authoring uses request-scoped `tempKey`s** to let a stage
  reference a sibling authored later in the same request
  (`nextStageTempKey`/`failureStageTempKey`) — `replaceTemplateStages`
  creates every stage first, then resolves temp keys to real ids in a
  second pass. Deliberately not a unique constraint on
  `nextStageId`/`failureStageId` — a branching or converging graph may
  have more than one stage point at the same destination.
- **Workflow Variables (Refinement 2)**: `WorkflowStageVariable` holds
  each stage's dynamic-field definitions (key/label/dataType/required);
  answers live in `StageInstance.variableValues` (a single JSON column,
  not a per-value table — mirrors `OrderItem.breakdown`'s "structured
  definition, flexible payload" shape). `assertRequiredVariablesPresent`
  rejects a `COMPLETE` action with any required variable unanswered —
  verified live (see `04_VERIFY.md`).
- **Workflow Events (Refinement 3)**: every transition
  (`INSTANCE_STARTED`/`STAGE_STARTED`/`STAGE_COMPLETED`/`STAGE_SKIPPED`/
  `STAGE_FAILED`/`INSTANCE_COMPLETED`/`INSTANCE_CANCELLED`) writes a
  `WorkflowEvent` inside the same transaction as the state change,
  independent of the `AuditLog` entry the same transition also produces.
  A rejected attempt (missing variable, illegal skip) writes neither —
  same "nothing happened, nothing to record" precedent as
  `IllegalStatusTransitionError` elsewhere.
- **Queue metadata (Refinement 4)**: `StageInstance.priority`/`dueDate`
  are real columns; `isDelayed` is computed at read time
  (`computeIsDelayed`), never stored — no stale flag to maintain.
  `PUT /api/workflow-instances/:id/current-stage` edits queue metadata
  *and* External Supplier fields on the current, still-open stage
  instance — deliberately separate from `.../advance`: it never changes
  `status`, so it never writes a `WorkflowEvent`.
- **Stage routing is service-layer-only**: `advanceWorkflowInstance`
  reads the *current* stage's own `nextStageId` (on `COMPLETE`/`SKIP`) or
  `failureStageId` (on `FAIL`) — no route, controller, or frontend code
  encodes "what comes after Design." When neither is configured, the
  instance ends (`COMPLETED` or `CANCELLED`).
- **Department queues**: `StageInstance.departmentId` is denormalized
  from its stage at creation (immutable once the source stage is
  published) — the queue query filters on this column directly, never
  joining through `WorkflowStage`. `canAccessDepartment` (mirroring
  `canAccessBranch` exactly) scopes `GET .../queue` — Super Admin and
  `work-orders.edit` holders see any department; everyone else only their
  home department or an explicit `UserDepartmentAccess` grant.
- **External Supplier stages** behave exactly like internal stages
  everywhere in the engine — the same `StageInstance` row, external
  fields simply unused for `INTERNAL` stages. `assignedSupplierId`
  reuses `BusinessPartner` (a SUPPLIER-role partner), not a parallel
  Supplier model — the same reuse `SupplierPurchase`/`SupplierPayment`
  already established.
- **Visibility**: `mapWorkflowInstanceToDto`/`mapStageInstanceToDto`
  mirror `mapQuotationToDto`/`mapOrderToDto`'s `canSeeInternal` pattern
  exactly — a caller without internal visibility sees only
  `stage.customerVisible` stages at all, and even within those,
  department/assignee/cost/notes/reasons/variable-answers are nulled.
- **`WorkOrder`'s first-ever application code**: minimal —
  `POST /api/work-orders` (creates the `WorkOrder` + its `WorkflowInstance`
  on the requested template's latest published version, in one
  transaction) and `GET /api/work-orders/:id` (inlines its
  `WorkflowInstance`). No list/edit/delete — a full Work Order module is
  future work.
- **New permission module**: `workflow-templates.*`
  (view/create/edit/delete/publish) — administering templates is kept
  separate from operating within them (`work-orders.edit`, reused
  unchanged — its Phase 2 label, "Update work order production status,"
  already anticipated stage advancement exactly).
- **`Department`** is reference data (11 seeded defaults from VISION.md's
  Department-Based Workflow list), same lightweight `settings.*`-gated
  CRUD pattern as `SheetType`/`SizeFamily` — no audit logging, matching
  that precedent.
- **`authContext.ts` extended**: `AuthenticatedUser.accessibleDepartmentIds`
  (home department + `UserDepartmentAccess` grants) and
  `canAccessDepartment()`, the direct department-scoping counterpart to
  `accessibleBranchIds`/`canAccessBranch`.

### Known Limitation Surfaced (Consistent With Every Prior Milestone)

Customer View (`canSeeInternal: false`) was verified by code inspection
only, not live with a second, non-privileged account — same limitation
and justification as every milestone this session (creating a second
real account sends a genuine Supabase invite email).

### Explicitly Out of Scope (00_REQUIREMENTS.md §3, Unchanged by the Refinements)

No production-specific template exists as code. No frontend beyond what
live verification needed. No SLA-breach alerting, automation execution,
or Production Dashboard. No Customer/Supplier Portal. The Pricing Engine
remains deprioritized.
