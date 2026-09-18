# Cleopatra AI — Tool Catalog

**Status (updated 2026-09-18):** 24 tools implemented, all READ, zero WRITE tools. This is the actual registry in `apps/api/src/services/ai/tools/index.ts`, verified against source — not a proposal.

**Ground rule (unchanged, and confirmed true by inspection):** every tool is a thin wrapper around an existing service function — check permission → call existing service → shape the result for the model. `grep` for `.create(`/`.update(`/`.delete(`/`.upsert(` across every file in this directory returns nothing.

**Every tool is scoped to the calling user's own permissions and branch access** — `CLEOPATRA_AI_SECURITY.md` §2 defines exactly how; this document defines *which* tools exist.

---

## How to read this catalog

- **Kind:** all 24 current tools are `READ`. No `WRITE` tool exists.
- **Required permission:** the exact `requiredPermission` string checked by the dispatcher before `execute()` ever runs, or `null` if the tool needs no permission beyond being authenticated. `requiresSuperAdmin: true` is called out separately where present.
- **Added by:** the task that introduced the tool (see `CLEOPATRA_AI_IMPLEMENTATION_PLAN.md` for the full task history).

## The 24 tools (apps/api/src/services/ai/tools/index.ts)

| Tool | Required permission | Added by |
|---|---|---|
| `search_customers` | `partners.view` | Phase 1 |
| `get_customer` | `partners.view` | Phase 1 |
| `get_customer_balance` | `orders.view` | Phase 1 |
| `search_leads` | `leads.view` | Phase 1 |
| `search_orders` | `orders.view` | Phase 1 |
| `get_order` | `orders.view` | Phase 1 |
| `get_work_order` | `work-orders.view` | Phase 1 |
| `get_production_status` | `work-orders.view` | Phase 1 |
| `get_treasury_summary` | `treasury.view` | Phase 1 |
| `search_inventory` | `inventory.view` | Phase 1 |
| `get_inventory_item` | `inventory.view` | Phase 1 |
| `calculate_price` | *(none — `null`; matches the composer's own unrestricted preview)* | Phase 1 |
| `search_call_logs` | `call-logs.view` | Phase 1 |
| `get_reorder_due` | `orders.view` | Phase 1 |
| `get_dashboard_summary` | *(none at its own level — `null`; composes several summaries, each individually permission-checked inside)* | Phase 1 |
| `get_employee_payroll` | *(none as a normal permission string — `requiresSuperAdmin: true` instead)*, matching `EmployeeProfilePage.tsx`'s own gate exactly | Phase 1 |
| `search_quotations` | `quotations.view` | Task 1 (2026-09-10) |
| `get_quotation` | `quotations.view` | Task 1 |
| `search_production_by_customer` | `work-orders.view` | Task 3 |
| `search_suppliers` | `suppliers.view` | Task 4 |
| `get_supplier_statement` | `suppliers.view` | Task 4 |
| `get_purchase_requests_due` | `inventory.view` | Task 5 |
| `get_machine_status` | `machines.view` | Task 6 |
| `search_help_topics` | *(none — `null`; pure static in-memory string match, no Prisma import, no data that could differ per caller)* | Task 14.1 |

Two tools received hardening fixes after shipping, with no permission change: `search_quotations`/`search_suppliers` (Task 7 — customer-name matching, supplier-name prefix tolerance), and `get_machine_status` (an additive description-text clarification distinguishing "machine/equipment status" from "work order," steering the model to `search_production_by_customer`/`get_work_order` instead when a query is actually about a production job).

## Tool routing (which subset the model is actually offered)

Not every request offers all 24 tools — `toolRouting.ts` narrows the offered set per request via keyword/domain matching, conversation-context carry-over, and a HELP-intent whitelist. See `CLEOPATRA_AI_ARCHITECTURE.md` §4 for the full routing design. This is orthogonal to permission checking: routing decides what the model is *offered*; the dispatcher's permission check decides what may actually *execute*, and always applies regardless of what routing offered.

## Write tools — not implemented

**No write tool exists.** The original proposal below sequenced future low/medium/high-risk write tools (`create_lead`, `advance_workflow_instance`, `create_treasury_entry`, etc.) behind a confirmation-token architecture. None of that has been built. This section is kept only as a historical record of what was proposed — not as a current or scheduled roadmap — per the standing rule that AI scope stays 100% read-only until the owner gives separate, explicit approval for write capability.

If that approval is ever given, the same shape the proposal described remains the reasonable starting point: risk-tiered, one tool at a time, each requiring its own confirmation step and its own audit trail — but none of this is in progress, and nothing in the current implementation depends on it existing.

## Tool Definition Shape (actual, from a real tool file)

```typescript
// apps/api/src/services/ai/tools/getMachineStatus.ts — real, current code.
export const getMachineStatusTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_machine_status',
  description:
    "List machines and their current equipment status (RUNNING/STOPPED/MAINTENANCE), optionally filtered to one branch. Use this tool ONLY when the user is asking about physical machine/equipment status. It is NOT for work orders, production jobs, or work-order details ...",
  requiredPermission: 'machines.view',
  inputSchema,
  inputJsonSchema: { /* ... */ },
  async execute(input, ctx) {
    // calls the existing machine service function — zero new business logic
  },
};
```

Every tool follows this same shape: a declared permission (checked by the dispatcher before `execute` ever runs, not inside it — `CLEOPATRA_AI_SECURITY.md` §2), a strict Zod input schema, and an `execute` that calls exactly one existing service function.
