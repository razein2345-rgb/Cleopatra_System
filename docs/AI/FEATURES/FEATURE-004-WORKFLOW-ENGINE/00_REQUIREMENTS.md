# FEATURE-004 — Workflow Engine — Requirements

## 0. Context and Priority

FEATURE-002 (Business Partners) is paused after Milestone 6. FEATURE-003
(Quotation Engine) has shipped Milestone 1 (Foundation) and Milestone 2
(Order Conversion) — Quotations can be created, accepted, and converted
into Orders. The Security Foundation (last-active-administrator
protection, Row Level Security as Defense-in-Depth, Backend-Only Database
Access) is done.

**This is now the highest priority — explicitly ahead of the Pricing
Engine.** No new feature module may be started before the Workflow Engine
exists, because every production-facing module planned after this one
(Production, Manufacturing, Marketing, Video, Design, Maintenance,
Service Requests, Customer Portal, Supplier Portal) is meant to run on
top of it rather than invent its own process logic. Building any of them
first would mean rebuilding them once the engine exists.

This document covers **only the generic engine foundation** — never a
specific business line's production process. Offset Printing, Digital
Printing, Stamp, T-Shirt, Acrylic Sign, and Brass Plate are examples used
throughout this document to illustrate what the engine must be capable of
expressing; none of them are implemented as code. See §3.

## 1. Purpose

Every business document in Cleopatra ERP already follows a workflow in
principle (`docs/AI/VISION.md`'s Workflow Philosophy), and the shape that
workflow must take has already been specified in detail in VISION.md's
Workflow section — Workflow Engine Architecture, Workflow Templates,
Workflow Stage Configuration, Department-Based Workflow, External
Supplier Workflow, Workflow Versioning, Queue Philosophy, Dynamic
Workflow Engine, Workflow Automation, Workflow Visibility, and No
Workflow Duplication. This feature is where that architecture stops being
a promise and becomes a real, running system.

**The engine must never know what a Stamp or Offset Printing is. It only
executes templates.** A template is data (rows in tables an administrator
can edit), never a code path written for one business line.

## 2. Scope for This Milestone (Foundation Only)

- Define **Workflow Templates**: an ordered set of stages, describing a
  complete production lifecycle for one kind of work.
- Support **Workflow Versioning**: templates are versioned; a running job
  keeps the version it started with; a new job always starts on the
  newest published version; publishing a new version never touches a job
  already in progress.
- Define **Workflow Stages** with the configuration VISION.md's Workflow
  Stage Configuration and this request specify: stage name, order,
  stage type, department assignment, employee assignment, external
  supplier assignment, SLA (estimated/actual time), waiting reasons,
  blocking reasons, notes, attachments, internal vs. customer visibility,
  a hook point for future automation, and its own set of **Workflow
  Variables** (§10) for business-line-specific data capture.
- Execute a template against a real unit of work: create a running
  instance of a template (a **Workflow Instance**) attached to a
  business record, advance it stage by stage, and record what happened
  at each stage (**Stage Instance** / status history / timeline).
- Support **Department-Based Queues**, including the queue metadata §12
  specifies (Priority, SLA, Due Date, Estimated Duration, Delay, Assigned
  Employee, Waiting Reason): a department sees only the stage instances
  currently assigned to it; an employee works from their department's
  queue, not a global list.
- Support **External Supplier stages** as first-class stages — tracked
  the same way internal stages are, with supplier-specific fields layered
  on top (see VISION.md's External Supplier Workflow).
- Support **Internal vs. Customer Visibility** per stage/field, following
  the same "one object, multiple views" rule already used for Quotation
  and Order (`canSeeInternal`), not a second visibility mechanism.
- Provide the API surface needed to author templates/versions/stages,
  create and advance a Workflow Instance, and read a department's queue
  and a given instance's timeline.
- `WorkOrder` (Phase 1, schema-only, zero application code — confirmed in
  01_ANALYSIS.md) is the first real consumer: this milestone connects it
  to the engine rather than to its own hardcoded status field. See
  01_ANALYSIS.md's Critical Finding.

## 3. Explicitly Out of Scope for This Milestone

- **Any production-specific logic.** No Offset Printing workflow, no
  Stamp workflow, no T-Shirt workflow is implemented as code. These
  remain examples used to validate that the generic engine *can* express
  them, authored later as data (Workflow Templates), by an administrator,
  through the API this milestone builds — not by this milestone itself.
- **The Pricing Engine.** Explicitly deprioritized by this request in
  favor of this feature. Nothing here calculates a price.
- **SLA breach alerting, deadline notifications, escalation.** The SLA
  *fields* (estimated/actual duration, started/finished at, delayed flag,
  delay reason) are in scope to store; automated alerting on them is not
  (see VISION.md's Workflow Automation — "not built yet, designed for").
- **Automation execution.** Automation Hooks are in scope as an
  attachment point on a stage (something a future automation rule could
  bind to); actually running automatic assignment, reminders, escalation,
  or notifications is not.
- **The Production Dashboard.** VISION.md's Production Dashboard is
  explicitly "only a visualization layer over Workflow Engine data" — it
  has nothing to render until the engine exists. A future milestone.
- **A Queue *UI*.** The Queue View requirement in this milestone is an
  API-level capability (a department can be asked "what's in my queue,
  in order") — a real frontend queue screen is future work, the same way
  FEATURE-003 M1 shipped the Quotation API and a minimal UI, not a fully
  polished screen.
- **Customer Portal / Supplier Portal.** Named as *future consumers* of
  this engine's Customer Visibility and External Supplier capabilities,
  not built now.
- **Removing `WorkOrder.productionStatus`.** Approved direction: it is
  **deprecated**, not removed, this milestone — marked with a doc comment,
  excluded from every new code path (the Workflow Engine is the source of
  truth from this milestone forward), and left in the schema until a
  future cleanup milestone removes it once nothing could possibly still
  reference it. See 01_ANALYSIS.md's Critical Finding.

## 4. Workflow Template — Core Fields

Per VISION.md's Workflow Templates and Dynamic Workflow Engine:

- Name (e.g. "Offset Printing" — a data value, never a code identifier).
- Description.
- Active/published state.
- Version number, with a self-referencing chain so a template's version
  history is queryable (the same non-destructive versioning shape
  FEATURE-003 already uses for Quotations — a new version is a new row).
- Its ordered set of Workflow Stages (§5).

## 5. Workflow Stage — Core Fields

Every field VISION.md's Workflow Stage Configuration and this request
specify:

- Stage Name.
- Stage Order (position within the template version).
- Stage Type (internal / external — see VISION.md's External Supplier
  Workflow).
- Department assignment.
- Assigned Employee (a default/suggested assignee; a running instance may
  still be reassigned).
- External Supplier assignment (only meaningful for an external stage).
- Estimated Duration (SLA).
- Required Files / Required Attachments.
- Required Approval.
- Required Cost Entry.
- Required Time Tracking.
- Optional or Mandatory.
- Can Skip.
- Next Stage / Failure Stage (the engine's routing — see §7).
- Internal Visibility / Customer Visibility.

## 6. Workflow Instance & Stage Instance — Core Fields

The running counterpart to a Template/Stage — one Workflow Instance per
business record going through production, one Stage Instance per stage it
passes through:

- Which Workflow Template **version** it started on (frozen at creation —
  see §2's Versioning requirement).
- Which business record it belongs to (e.g. a `WorkOrder` — generic
  enough that a future Marketing/Design/Video job attaches the same way).
- Current stage.
- Per stage instance: status, assigned employee, assigned external
  supplier, started at, finished at, actual duration, waiting reason,
  blocking reason, notes, attachments, sent date / expected return date /
  actual return date / external cost / supplier status (external stages
  only — VISION.md's External Supplier Workflow), and the full status
  history / timeline of what happened, in order.

## 7. Stage Routing

The engine decides legal movement between stages from each stage's own
`Next Stage`/`Failure Stage` configuration — the same "service-layer-only
transition table" discipline FEATURE-003 already established for
`QuotationStatus` (`LEGAL_STATUS_TRANSITIONS` in `quotationService.ts`),
applied here to workflow stages instead of document statuses. No route,
controller, or frontend code may encode "what comes after Design" —
that answer lives only in the stage configuration the engine reads.

## 8. Department-Based Queues

Per VISION.md's Department-Based Workflow and Queue Philosophy:

- A Department is configurable data (an administrator-managed list), not
  a hardcoded enum — new departments (e.g. a future Marketing department)
  must not require a code change.
- A Stage Instance belongs to exactly one department at a time (from its
  stage's Department assignment).
- An employee's queue is every open Stage Instance assigned to their
  department(s) — "the next available item," not a global work-order
  list they search through.

## 9. Visibility

- **Internal (production employees) see**: internal stages, costs,
  materials/notes, internal-only fields.
- **Customers see**: design approval, order status, delivery status —
  never internal workflow detail. Enforced the same way FEATURE-003
  enforces it for Quotations (`canSeeInternal` parameter, one DTO shape,
  shaped by value) — not a second, parallel response type.
- No Customer Portal caller exists yet; this is forward compatibility
  (VISION.md's Portal Architecture), not portal delivery, same as
  FEATURE-003 M1's Customer View.

## 10. Workflow Variables

**Each Workflow Stage must be able to define required and optional
dynamic fields.** This is what lets different business lines (Offset,
Digital, Stamp, Brass Plate, Acrylic, T-Shirt, and whatever comes after)
reuse the same engine without hardcoded forms — a stage like "Collect
Customer Text" (Brass Plate) or "Determine Size" (Acrylic Sign) needs to
capture data no generic `StageInstance` column could predict in advance,
and the engine must never grow a new column per business line to
accommodate it.

- A stage defines zero or more variable definitions: a key, a label, a
  data type, and whether it's required or optional.
- A running Stage Instance holds the answered values for its stage's
  variables.
- **A stage instance with unanswered required variables cannot be
  advanced** — the same "required before proceeding" discipline
  `requiresFiles`/`requiresApproval` already express for fixed fields,
  extended to dynamic ones.
- The engine validates that required variables are present; it never
  interprets what a variable *means* — that stays entirely inside the
  template's own data (a `size` variable on an Acrylic Sign stage is
  meaningless to the engine beyond "required, unanswered, cannot
  proceed").

## 11. Workflow Events

**Every state transition must generate a business event.** Future
Timeline, Dashboard, Notifications, AI, Reporting, and Analytics
consumers must read this event stream instead of inspecting workflow
state directly — none of them re-derive "what happened" by diffing
`StageInstance` rows or polling current status.

- An event is recorded for at least: a Workflow Instance starting, a
  stage starting, a stage completing, a stage being skipped, a stage
  failing, and a Workflow Instance completing or being cancelled.
- An event carries enough structured detail (which instance, which
  stage, department, timing) that a downstream consumer never needs to
  join back to current, mutable state to make sense of it — it's a
  record of what happened at that moment, not a pointer to look it up
  later.
- This is a distinct concept from `AuditLog` (security/compliance:
  "who did what") — Workflow Events are a domain-event feed purpose-built
  for the consumers named above. Both may be written for the same
  transition; neither replaces the other. See 01_ANALYSIS.md.

## 12. Department Queue Metadata

Every Department Queue must support, as queue metadata — **not new
business logic, just the data a queue needs to be usable**:

- Priority
- SLA
- Due Date
- Estimated Duration
- Delay
- Assigned Employee
- Waiting Reason

Most of these already follow from §5/§6 (Estimated Duration, Assigned
Employee, Waiting Reason); Priority and Due Date are additive queue-
ordering fields; Delay is a signal the queue surfaces (derived from Due
Date/timing), not a rule engine deciding what to do about it — no
escalation, no automation action is implied or built here (that remains
Workflow Automation, explicitly future work per §3).

## 13. Permissions

Follow the existing permission architecture (ADR 0022) — new permission
catalog entries for whatever this milestone's endpoints actually need
(template authoring vs. instance/queue operations are likely different
concerns), decided in 02_PLAN.md, not invented ad hoc during
implementation. `work-orders.*` already exists (Phase 2, currently
unused) and is a candidate for the execution side; template
administration likely needs its own module, the same way `roles`/
`permissions` are separate from the entities they govern.

## 14. Documentation

Follow the mandatory Feature Development Standard lifecycle (Requirements
→ Analysis → Planning → Implementation → Verification → Documentation →
Changelog). Per MASTER_PROMPT.md Step 5: **if the change is large, STOP
and wait for approval — do not implement until approved.** This document,
01_ANALYSIS.md, and 02_PLAN.md are that stop; no code, schema, or
migration is part of this submission.
