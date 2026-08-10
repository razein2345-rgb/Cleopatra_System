# FEATURE-005 — Sprint 2 (Production Dashboard & Production Board) — Requirements

## 0. Context

Sprint 1 (UX Foundation) is closed. This sprint is exactly the scope
Sprint 1's own `02_PLAN.md` named as Milestone 2, plus the widget-based
Dashboard groundwork Sprint 1 already built. Per the architecture-freeze
instruction: implementation now takes priority over `VISION.md`; nothing
in this sprint proposes a new architectural rule — everything below cites
the section of `VISION.md` it implements.

**Constraints carried forward from every prior milestone this session:**

- Additive changes only.
- Backend first where a change touches both layers.
- No duplicated business logic — reuse `workflowInstanceService.ts`'s
  existing `computeIsDelayed`, `mapStageInstanceToDto`, and
  `getDepartmentQueue`, never a second implementation of any of them.
- No mock data, no placeholder calculations.
- Every milestone verified (typecheck/lint/build/test + live) before the
  next starts.

## 1. Production Dashboard — Aggregate Endpoint

Per `VISION.md`'s [Production Dashboard](../../../VISION.md#production-dashboard)
section (verbatim scope): Jobs waiting, Jobs in progress, Delayed jobs,
Jobs by department, Jobs by operator, Supplier delays, Daily production —
"never a parallel calculation of its own."

Sprint 1's `WorkflowQueueSummaryProvider` proved this data is needed but
worked around the absence of an aggregate endpoint by fanning out one
`GET /api/workflow-instances/queue?departmentId=` call per department
client-side — acceptable under Sprint 1's "no new API unless absolutely
required" constraint, not acceptable as the permanent shape once this
sprint is building the aggregate endpoint anyway (Sprint 1
`01_ANALYSIS.md` Open Decision #1, resolved in principle, deferred to
this sprint to build).

**New, single, read-only endpoint**: `GET /api/workflow-instances/
dashboard-summary`. Every number in the response is read from state the
Workflow Engine already computes (`computeIsDelayed`, existing
`StageInstance`/`WorkflowEvent` rows) — grouping and counting, never a
new business rule.

## 2. Production Board

Per `VISION.md`'s [Queue Philosophy](../../../VISION.md#queue-philosophy)
and [Department-Based Workflow](../../../VISION.md#department-based-workflow):
a department's queue is the entire interface between an employee and
their work. FEATURE-004 M1 built the queue endpoint and the stage-action
endpoints; nothing has rendered them as a screen yet (FEATURE-004 M1 was
verified entirely via direct HTTP calls, deliberately).

- A department switcher showing only departments the signed-in user can
  access (`canAccessDepartment`, already enforced server-side by
  `GET /api/workflow-instances/queue`).
- Each queue row shows what the endpoint already returns: work order
  number, stage name, priority, computed delay, assignee, waiting
  reason — no new field.
- Stage actions (`COMPLETE`/`FAIL`/`SKIP`, `PUT .../advance`) and queue
  metadata edits (priority/due date/assignee/waiting reason,
  `PUT .../current-stage`) become real buttons/forms — the same two
  endpoints FEATURE-004 M1 already built and secured, not new business
  logic.

## 3. Explicitly Out of Scope

- Workflow Template authoring UI — still deferred (Sprint 1
  `01_ANALYSIS.md` Architectural Tension, unchanged).
- Any change to `VISION.md`, the Workflow Engine schema, or its core
  routing logic (`advanceWorkflowInstance`, `assertLegalStageAction`) —
  this sprint consumes that engine, it does not modify it.
- Smart Search / Settings — Sprint 1 territory, not reopened here.

## 4. Documentation

Requirements → Analysis → Plan → Implementation → Verification →
Documentation → Changelog, per `MASTER_PROMPT.md`. Three milestones
(M1 backend endpoint, M2 Production Board, M3 Dashboard widgets), each
verified before the next begins, per this sprint's explicit instruction
to continue implementing without a stop-and-wait gate between them
(unlike Sprint 1's original milestone framing) — a genuine architectural
conflict, if one appears, is still a stop-and-ask, not a judgment call.
