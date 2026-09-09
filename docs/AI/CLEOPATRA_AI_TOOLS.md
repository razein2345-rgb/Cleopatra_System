# Cleopatra AI — Tool Catalog

**Status:** Proposal / Phase 0 audit output. No tool listed here is implemented.

**Ground rule (from `CLEOPATRA_AI_ARCHITECTURE.md` §1):** every tool is a thin wrapper around an existing service function. A tool's own code should be close to: check permission → call existing service → shape the result for the model. If a tool's implementation is starting to look like new business logic, that is a sign the tool is wrong, not a sign the service layer needs a new function written *for* the AI.

**Every tool below is scoped to the calling user's own permissions and branch access** — never a superset. `CLEOPATRA_AI_SECURITY.md` §2 defines exactly how that check is made per tool; this document defines *which* tools exist and what each one does.

---

## How to read this catalog

- **Kind:** `READ` (queries data, no side effect, never needs confirmation) or `WRITE` (creates/changes a real record, always a confirmation candidate — see `CLEOPATRA_AI_SECURITY.md` §4 for exactly which WRITE tools require confirmation vs. which are low-risk enough not to).
- **Phase:** which `CLEOPATRA_AI_IMPLEMENTATION_PLAN.md` phase first ships this tool. Phase 1 is READ-only by design (per the user's own stated preference: ship Q&A + real data first, prove it before adding execution).
- **Wraps:** the exact existing function/endpoint it calls — nothing here invents new service logic.

## Phase 1 — Read tools (no confirmation ever needed)

| Tool | Kind | Required permission | Wraps |
|---|---|---|---|
| `search_customers` | READ | `partners.view` | `businessPartnerService.ts` list/search (same as `PartnersPage.tsx`'s own search) |
| `get_customer` | READ | `partners.view` | `businessPartnerService.ts::getPartnerById` |
| `get_customer_balance` | READ | `orders.view` | `GET /api/orders?partnerId=` + the exact `remainingBalance` math already in `orderService.ts::mapOrderToDto` — **never re-derived**, see `CLEOPATRA_AI_ARCHITECTURE.md` §7 |
| `search_leads` | READ | `leads.view` | `leadService.ts` list/search |
| `search_orders` | READ | `orders.view` | `orderService.ts::listOrders` filters (status, partner, date range, branch) |
| `get_order` | READ | `orders.view` | `orderService.ts::getOrderById` (returns items, payments, returns, computed balance) |
| `get_work_order` | READ | `work-orders.view` | `workOrderService.ts::getWorkOrderById` |
| `get_production_status` | READ | `work-orders.view` | `workflowInstanceService.ts::getWorkflowDashboardSummary` / `getWorkflowInstance` (current stage, delayed flag, per-department counts) |
| `get_treasury_summary` | READ | `treasury.view` | `treasuryService.ts::getTreasuryBalance` (branch-scoped — the tool must pass the caller's own `accessibleBranchIds`, never `'all'`, unless the caller is SUPER_ADMIN, identically to how `treasuryEntries` controller already scopes it) |
| `search_inventory` | READ | `inventory.view` | `inventoryService.ts` list/search by name or barcode |
| `get_inventory_item` | READ | `inventory.view` (cost price fields additionally require `inventory.costPrice`, same as the existing UI) | `inventoryService.ts::getInventoryItemById` |
| `calculate_price` | READ | *(none beyond being logged in — pricing preview is not currently permission-gated in the composer UI either)* | `pricingEngineService.ts`'s preview path — the **exact same function** `NewOrderPage.tsx`'s live preview calls. Never persists an item. This is the one tool that touches the Pricing Engine, and it is read-only by construction — see rule 3/4 discussion in `CLEOPATRA_AI_ARCHITECTURE.md` §7 |
| `search_call_logs` | READ | `call-logs.view` | `callLogService.ts::listCallLogs` |
| `get_reorder_due` | READ | `orders.view` | `lib/reorderPrediction.ts` — the same computation `/reorder-due` already renders |
| `get_dashboard_summary` | READ | *(whatever each underlying widget already requires — the tool composes several existing summaries, each individually permission-checked)* | `getWorkflowDashboardSummary` + `getCompanyFinancialSummary`, branch-scoped |
| `get_employee_payroll` | READ | **SUPER_ADMIN only** — hard-coded check, not a normal permission string, matching `EmployeeProfilePage.tsx`'s own gate exactly | `employeePayrollService.ts::computeEmployeePayroll` / `computePreviousClosedPeriod` |

Deliberately **excluded** from Phase 1 even as read tools, pending a real need: full campaign/content-calendar listings, supplier ledger detail, full audit-log search. Nothing stops adding these later; they are omitted now because nothing in the request or the system's actual daily-use pattern (per this session's own history) suggests staff will ask an AI about them on day one, and every tool added is one more thing to keep in sync with its underlying service and to security-review.

## Phase 2+ — Write tools (require confirmation, see `CLEOPATRA_AI_SECURITY.md` §4)

Ordered by risk, lowest first. **Phase 2 ships only the first group** (low-risk, easily reversible, soft-deletable); the higher-risk groups are separate later phases per the implementation plan, each requiring its own explicit sign-off before being enabled.

### Low risk (Phase 2 candidates)

| Tool | Required permission | Wraps | Why low risk |
|---|---|---|---|
| `create_lead` | `leads.create` | `leadService.ts::createLead` | Purely additive, soft-deletable, no financial/production effect |
| `log_call` | `call-logs.create` | `callLogService.ts::createCallLog` | Same — additive record of something that already happened |
| `update_lead_field` | `leads.edit` | `leadService.ts::updateLead` (single field, e.g. source/stage) | Matches the existing inline-edit UI exactly; no destructive path |

### Medium risk (later phase)

| Tool | Required permission | Wraps | Why it needs confirmation |
|---|---|---|---|
| `create_order` | `orders.create` | `orderService.ts::createOrder` | Real invoice, real stock deduction, real work orders spawned — but soft-deletable and correctable afterward like any manually-entered order |
| `advance_workflow_instance` | `work-orders.edit` | `workflowInstanceService.ts::advanceWorkflowInstance` | Moves real production state; reversible via `revertWorkflowInstance` (تكملة 85), which lowers — but does not remove — the risk |
| `record_payment` | `orders.edit` | `orderService.ts::addPayment` | Real money recorded against a real invoice |

### High risk (later phase, most conservative confirmation copy — see `CLEOPATRA_AI_SECURITY.md` §4)

| Tool | Required permission | Wraps | Why high risk |
|---|---|---|---|
| `create_treasury_entry` | `treasury.create` | `treasuryService.ts::createManualTreasuryEntry` | Directly represents real cash movement |
| `close_treasury_day` | `treasury.*` (matches the existing route's own gate) | `treasuryService.ts::closeTreasuryDay` | Financial reconciliation checkpoint, branch-wide effect |
| `delete_order` / any `DELETE`-shaped tool | matches the underlying route's own delete permission | the existing soft-delete service function | Even soft-deleted, a delete is the single most consequence-bearing action class — see rule 19 |

**Never a tool, at any phase:** anything that would change the Pricing Engine's output formula, anything that writes directly to `Setting` fields that gate other business rules (thresholds, VAT rate, etc.) without going through the existing Settings screens' own validation, and anything that touches `AuditLog` itself (the AI is audited, it does not get to edit its own trail).

## Tool Definition Shape (illustrative)

```typescript
// apps/api/src/services/ai/tools/searchOrders.ts — illustrative, not final.
export const searchOrdersTool: AiToolDefinition = {
  name: 'search_orders',
  kind: 'READ',
  requiredPermission: 'orders.view',
  inputSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
      query: { type: 'string', description: 'free-text match on item name or invoice number' },
    },
    additionalProperties: false,
  },
  async execute(input, ctx: AiToolContext) {
    // ctx carries the resolved req.auth — same shape every controller already gets.
    return listOrders({ ...input, branchIds: ctx.accessibleBranchIds });
  },
};
```

Every tool follows this same three-part shape: declared permission (checked by the dispatcher before `execute` ever runs, not inside it — see `CLEOPATRA_AI_SECURITY.md` §2), a strict input schema (Zod, reusing `packages/shared` schemas wherever one already exists for the equivalent API input — e.g. `createLeadSchema` for `create_lead`'s input shape, never a hand-rolled duplicate), and an `execute` that calls one existing service function.
