# FEATURE-004 — Changelog

## Milestone 1 — Workflow Engine Foundation

Built the generic Workflow Engine VISION.md's Workflow Engine
Architecture / Workflow Templates / Workflow Stage Configuration /
Department-Based Workflow / External Supplier Workflow / Workflow
Versioning / Queue Philosophy / Dynamic Workflow Engine / Workflow
Automation / Workflow Visibility / No Workflow Duplication sections
describe — the engine never knows what a Stamp or Offset Printing is, it
only executes templates authored as data.

Eight new tables (`Department`, `UserDepartmentAccess`,
`WorkflowTemplate`, `WorkflowStage`, `WorkflowStageVariable`,
`WorkflowInstance`, `StageInstance`, `WorkflowEvent`), all RLS-protected
in the same migration that created them. `WorkOrder` becomes the first
real consumer, with its pre-existing, hardcoded
`productionStatus`/`WorkOrderProductionStatus` deprecated in place (kept,
never read or written by new code — a future cleanup milestone removes it
once safe) rather than removed this round.

Four refinements applied throughout, beyond the original plan: (1)
`WorkOrder.productionStatus` deprecated, not removed; (2) Workflow
Variables — per-stage dynamic required/optional fields, so different
business lines reuse the same engine without hardcoded forms; (3)
Workflow Events — an independent, append-only domain-event feed for
future Timeline/Dashboard/Notifications/AI/Reporting consumers, distinct
from `AuditLog`; (4) Department Queue metadata — priority, due date,
computed delay, assignee, and waiting reason, all live on the queue
endpoint.

No production-specific template was built as code, no frontend beyond
what live verification needed, no SLA-breach alerting or automation
execution, no Production Dashboard — all explicitly deferred, per
`00_REQUIREMENTS.md` §3.
