# Cleopatra AI — Architecture

**Status:** Proposal / Phase 0 audit output. Nothing described here is implemented. No schema, migration, route, or dependency has been added to the repository as part of this document.

**Scope:** This document answers "how would Cleopatra AI fit into the existing system" — the module map, the request-flow architecture, the LLM-provider abstraction, and the knowledge/RAG question. Tool catalog is in `CLEOPATRA_AI_TOOLS.md`, the security/permission/confirmation/audit design is in `CLEOPATRA_AI_SECURITY.md`, and the phased build-out is in `CLEOPATRA_AI_IMPLEMENTATION_PLAN.md`.

---

## 1. The one rule everything else follows: ADR 0030

> "Business tables are never accessed directly by frontend applications. Every business operation must always pass through the ERP REST API... a future Customer Portal, Mobile Apps, a public Website, **AI agents**, or third-party integrations all reach business data exactly the same way every existing client does today: through the REST API, subject to its authentication, RBAC (ADR 0021/0022), and audit logging in full."
> — `adr/0030-backend-only-database-access.md` (Accepted, predates this proposal)

This is not a constraint Cleopatra AI introduces — the project already decided, before any AI feature was proposed, that an AI agent is just another API consumer. Every design choice below is a direct consequence of that one sentence:

- Cleopatra AI **never imports Prisma** and never runs raw SQL.
- Cleopatra AI **never gets a service-role key** or a database connection string of its own.
- Every "tool" the AI can call is a thin wrapper around an **existing service function** (`orderService.ts`, `treasuryService.ts`, `inventoryService.ts`, ...) — the same functions the existing REST controllers already call. This is also ADR 0022/rule 5 (no duplicate business logic) applied to a new client type, not a new principle.
- RLS (ADR 0029) already denies `anon`/`authenticated` direct table access — Cleopatra AI inherits that Defense-in-Depth for free by construction, since it never holds a Postgres role that could bypass it.

## 2. Request-flow architecture

```
Staff member (logged in, has a real session/JWT)
    │
    ▼
AI Chat UI  (new React component, embedded in the existing apps/web app —
             not a separate app, not a separate deploy)
    │  POST /api/ai/chat  { message, conversationId? }
    │  Authorization: <the user's own existing JWT, same as every other request>
    ▼
apps/api  — new route file, same requireAuth middleware every other route uses
    │
    ▼
AI Orchestrator (new service, e.g. apps/api/src/services/aiAgentService.ts)
    │   - builds the system prompt (see §4, Knowledge Architecture)
    │   - holds req.auth (the caller's resolved permissions/branch access — already
    │     computed by the existing auth middleware, not recomputed)
    │   - calls the Anthropic Messages API with the tool catalog (see CLEOPATRA_AI_TOOLS.md)
    ▼
Claude (via Anthropic SDK)
    │   tool_use blocks ("call search_orders with {...}")
    ▼
Tool dispatcher (new, e.g. apps/api/src/services/aiTools/*.ts)
    │   - looks up the requested tool
    │   - checks req.auth against that tool's declared required permission
    │     (same hasPermission() function every controller already uses)
    │   - if the tool is a write action: returns a requiresConfirmation
    │     response instead of executing (see CLEOPATRA_AI_SECURITY.md §3)
    │   - calls the EXISTING service function (orderService.createOrder,
    │     treasuryService.getTreasuryBalance, ...) — never a new implementation
    │   - wraps the result as a tool_result block
    ▼
Claude (continues the loop until it has enough information to answer)
    ▼
AI Chat UI — renders Claude's final text answer, plus a "confirm" button
             if a tool call is pending confirmation
```

Two things to notice:

1. **The dispatcher calls services, not routes.** Going through actual HTTP (the AI orchestrator making a real `fetch()` back into its own API) was considered and rejected: it would work and technically satisfy ADR 0030's literal wording, but it means a self-inflicted network hop, a second copy of auth-header plumbing, and no real benefit — the *reason* ADR 0030 exists (never bypass the service layer / validation / RBAC / audit) is fully satisfied by calling the same service functions the routes call, in-process. If a future reviewer wants the literal-HTTP version instead, that is a small, mechanical change to the dispatcher only — nothing else in this design depends on which one is chosen.
2. **The orchestrator lives inside `apps/api`**, not as a separate microservice. Cleopatra AI is a new *module* of the existing backend (new routes + one new service + a tools folder), not a second backend architecture. This directly satisfies the project rule "Do NOT introduce a second backend architecture."

## 3. LLM Provider Abstraction

```
Chat route / Orchestrator
        │
        ▼
LlmProvider interface   (apps/api/src/services/ai/llmProvider.ts)
        │
        ├── AnthropicProvider   (apps/api/src/services/ai/providers/anthropicProvider.ts)
        └── (future) OllamaProvider, if ever pursued — see §5
```

```typescript
// Illustrative shape only — not final code.
export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmProvider {
  /** One turn: send the conversation + tool catalog, get back either a final
   * text answer or one/more tool calls to execute. The orchestrator loops
   * until it gets a final answer. */
  converse(params: {
    system: string;
    messages: LlmMessage[];
    tools: LlmToolDefinition[];
  }): Promise<{ text: string | null; toolCalls: LlmToolCall[] }>;
}
```

The orchestrator, the tool dispatcher, the confirmation flow, and the audit logging **never import `@anthropic-ai/sdk` directly** — only `AnthropicProvider` does. Switching providers later (a different hosted model, or a self-hosted one) means writing a new class behind the same interface; it does not touch a single line of Cleopatra's actual business logic. This satisfies the explicit requirement: "the LLM provider can be changed later without rewriting Cleopatra's business logic."

## 4. Knowledge Architecture

Two genuinely different kinds of "knowledge," never mixed:

| | System Knowledge | Live Data |
|---|---|---|
| What it answers | "How does Offset production work?" / "What does العهدة النقدية mean?" / "What's the difference between عرض سعر and فاتورة?" | "Where is order #125?" / "How much does customer X owe?" / "Is machine 3 running?" |
| Source | A curated, static **system prompt** — module purposes, terminology, workflow shapes, permission model. Written once, updated when the system changes materially (a new تكملة). | A **tool call** to a real service function, executed at answer time, scoped to the caller's own permissions/branch. |
| Freshness | Frozen at prompt-authoring time — never queried per-request. | Always current — the whole point of going through a tool instead of baking numbers into the prompt. |
| Failure mode if confused | The AI answers a "where is my order" question from stale prompt text instead of a real lookup → **hallucination**, the exact failure this design exists to prevent. | — |

**System Knowledge content** (a new, hand-maintained file, e.g. `apps/api/src/services/ai/systemKnowledge.ts` or a `.md` file loaded at boot):

- One paragraph per module (Orders, Work Orders, Production/Workflow, Treasury, Inventory, Customers/Leads, Pricing, Call Center, Content Calendar, Campaigns, Payroll/Attendance, Settings) — purpose, key terms, how it relates to the others. This is a condensed, LLM-facing rewrite of what already exists in `CLAUDE.md` §1–5 and `ARCHITECTURE.md` — not a new source of truth, a *distillation* of the existing one.
- The permission model shape (so the AI can explain *why* it can't do something, not just refuse silently).
- An explicit, repeated instruction: **numbers, statuses, names, balances — anything that could be "wrong" about a real record — must come from a tool call. Never state a specific figure from memory.**

**Rule enforced at the prompt level, not just documented:** the system prompt must contain an explicit anti-hallucination instruction to this effect, and `CLEOPATRA_AI_SECURITY.md` §6 defines what happens when the model violates it anyway (it will, occasionally — every LLM does).

## 5. Local / Free LLM Strategy — evaluated and **not recommended for v1**

The request explicitly asked to evaluate Ollama + an open model (Qwen / Llama / Gemma) before committing to a paid API. Here is that evaluation, grounded in this project's actual deployment, not a generic take.

**Current hosting reality** (`render.yaml`, confirmed by reading the file):

```yaml
plan: starter   # apps/api's actual Render plan today
```

Render's Starter plan is a shared-CPU, low-RAM web-service tier with **no GPU option**. A few concrete facts about what that means for self-hosting an LLM:

- Even a small *quantized* open model (7–8B parameters, e.g. Qwen2.5-7B or Llama-3.1-8B via Ollama) needs roughly 5–8 GB of RAM just to load, and meaningfully more to hold a conversation with tool-calling context. Starter-tier RAM is far below that.
- CPU-only inference on shared vCPUs is slow — realistically several seconds to tens of seconds per response for a model in this size class, before even accounting for tool-calling reliability (see below).
- Tool-calling / structured function-calling quality on open 7–8B models is **noticeably less reliable** than Claude's — this matters specifically because Cleopatra AI's entire safety model (§2, and all of `CLEOPATRA_AI_SECURITY.md`) depends on the model reliably picking the *right* tool with *correctly-shaped* arguments, and stopping to ask for confirmation exactly when it should. A model that occasionally malforms a tool call or skips a confirmation step is a security property failing silently, not just a quality inconvenience.
- Running a large enough open model to close that reliability gap (e.g. Qwen2.5-72B, Llama-3.1-70B) needs real GPU hosting — a different Render tier or a specialized GPU provider (RunPod, Lambda, Together.ai, etc.) — which realistically costs **more per month** than Claude API usage would for an 8-person team's internal-assistant traffic volume, before counting the operational burden (model updates, prompt-format drift between model versions, no vendor support) on a team with **no in-house development team** (`CLAUDE.md` §1).

**Recommendation:** start with the hosted Claude API (Claude Sonnet 5 or Claude Haiku 4.5 — see the cost note in the final report), behind the `LlmProvider` interface in §3. Nothing about that choice is permanent or hard to undo — if usage volume or cost ever justifies revisiting self-hosting, the abstraction means swapping in an `OllamaProvider` later is a contained, additive change, not a rewrite. Committing to local/free hosting *now*, before knowing real usage, would optimize for a cost that hasn't materialized yet at the price of reliability that the whole confirmation/security model depends on.

## 6. RAG — not needed for v1

RAG (retrieval-augmented generation over an embeddings/vector store) solves the problem of "too much static knowledge to fit in a prompt." Checking whether that problem actually exists here:

- The System Knowledge content described in §4 — module summaries, terminology, permission shape — is a few thousand tokens at most, nowhere near Claude's context window (see the model table in the final report).
- Live data is never retrieved via embeddings/similarity search in this design — it's fetched via exact, typed tool calls against the real database (`search_orders`, `get_customer`, ...), which is strictly more accurate than a vector-similarity lookup for structured business records with exact IDs, statuses, and amounts.
- The project has no existing vector-store infrastructure, and adding one (a new extension on the Supabase Postgres instance, e.g. `pgvector`, or a separate vector DB) would be exactly the kind of "add another database" the request explicitly says to avoid ("Prefer existing infrastructure over adding another database").

**Recommendation:** no RAG for v1. Revisit only if a real, observed need appears later — e.g. if the System Knowledge content grows large enough that prompt-caching costs become material, or if a future feature (searching historical order *descriptions* by meaning rather than exact field match) genuinely needs semantic search. Neither exists today.

## 7. Module Map

A structured summary of every module Cleopatra AI needs to know about, condensed from direct repository inspection (Prisma schema, `apps/api/src/routes`, `apps/api/src/services`, `packages/shared/src/permissions.ts`). This is the source both for the System Knowledge prompt (§4) and for scoping the tool catalog (`CLEOPATRA_AI_TOOLS.md`).

### Orders & Work Orders

- **Purpose:** The center of the system — a customer's invoice/quotation (`Order`/`Quotation`), broken into `OrderItem`s, each priced by the Pricing Engine and (if it needs internal production) assigned to a `WorkOrder` running one `WorkflowInstance`.
- **Models:** `Order`, `OrderItem`, `Quotation`, `QuotationItem`, `WorkOrder`, `Payment`, `OrderItemReturn`.
- **Services:** `orderService.ts` (create/update/delete, `mapOrderToDto`'s balance math — see §"Customer Balance" below), `pricingEngineService.ts` (wraps `packages/shared/src/pricing/*` — the pricing engine itself, verbatim-ported from legacy per ADR 0016, **never to be reimplemented or approximated by the AI**), `quotationService.ts`, `workOrderService.ts`.
- **Permissions:** `orders.view/create/edit/delete`, `quotations.view/create/edit/delete`, `payments.edit`, `work-orders.view/edit/delete`, `returns.create`.

### Production / Workflow Engine

- **Purpose:** A Dynamic Workflow Engine (rule 14 — never hardcoded steps) that moves a `WorkOrder` through per-track stages (Design → Printing → Numbering → ... → Delivery), with full history (`WorkflowEvent`) and an undo path (`REVERTED` status, تكملة 85).
- **Models:** `WorkflowTemplate`, `WorkflowStage`, `WorkflowInstance`, `StageInstance`, `WorkflowEvent`, `Machine` (name/status/department only — see `CLAUDE.md` §5, تكملة 83).
- **Services:** `workflowInstanceService.ts` (`advanceWorkflowInstance`, `revertWorkflowInstance`, `getWorkflowDashboardSummary`), `workflowTemplateService.ts`.
- **Permissions:** `work-orders.view/edit/delete`, `workflow-templates.*`, `machines.*`.

### Treasury (الخزينة والنقدية)

- **Purpose:** Every real cash/wallet movement per branch, live balances by payment method, and a daily open→close→(reopen) cash-drawer reconciliation. Strictly branch-scoped (a cashier at one branch can never see or touch another branch's treasury — a previously-fixed security bug, تكملة 62/69).
- **Models:** `TreasuryEntry`, `TreasuryDayClosure`, `TreasuryCategory`, `FixedMonthlyExpense`.
- **Services:** `treasuryService.ts` (`getTreasuryBalance`, `closeTreasuryDay`/`reopenTreasuryDay`, `createManualTreasuryEntry`), `branchFinancialsService.ts` (real per-branch net profit, subtracting fixed costs), `fixedExpensesService.ts`.
- **Business logic:** `closeTreasuryDay` — Opening + Inflows − Outflows = Expected; `actualCountedCash − Expected = difference`. `autoCloseDayJob.ts` force-closes past `Setting.autoCloseDayTime`.
- **Permissions:** `treasury.view/create/edit/delete`, `reports.view` (branch summary).
- **AI sensitivity:** financial data + write operations that move real cash records — highest-scrutiny module for the confirmation model (`CLEOPATRA_AI_SECURITY.md` §4).

### Inventory

- **Purpose:** Cross-branch stock quantities for materials and ready-made goods; auto-deducts/restocks on order create/edit/delete; auto-raises `PurchaseRequest`s on shortfall; "quick sale" posts a paired Treasury entry.
- **Models:** `InventoryItem`, `StockLevel`, `StockMovement`, `PurchaseRequest`, `InventoryCategory`.
- **Services:** `inventoryService.ts` (`deductStockForOrderItem`/`restockForOrderItem`, `quickSaleFromInventory`, `recordStockMovement`), `purchaseRequestService.ts` (`maybeCreatePurchaseRequest` — sums `quantityOnHand` across branches, auto-creates/updates one PENDING request).
- **Permissions:** `inventory.view/create/edit/delete`, `inventory.costPrice` (gates real cost price — separate, higher-bar permission).

### Customers, Leads & Balance

- **Purpose:** `BusinessPartner` (customers/suppliers/etc.), `Lead` (pre-conversion pipeline), `CallLog`. **There is no persisted "customer balance" field or endpoint** — balance is computed fresh on every read.
- **Calculation:** `orderService.ts::mapOrderToDto` — `paidTotal = Σ payments.amount`; `netTotal = finalTotal − Σ returns.refundAmount`; `remainingBalance = netTotal − paidTotal`. A "customer statement" is just `GET /api/orders?partnerId=X`, filtered/summed client-side — confirmed by reading `CustomerStatementTab.tsx`'s own header comment stating exactly this. **Any `get_customer_balance` tool must call the same endpoint/service — never re-derive the formula.**
- **Permissions:** `partners.view/edit/delete`, `leads.view/edit`, `call-logs.view/create`.

### Pricing Engine

- **Purpose:** The one calculation surface `CLAUDE.md` rules 3/4 protect explicitly. Lives in `packages/shared/src/pricing/*`, called via `pricingEngineService.ts`.
- **AI's only legitimate touch point:** a **read-only preview** tool (`calculate_price`) that calls the exact same `previewItemTotal`/pricing functions the order composer UI already calls for its live preview — never a reimplementation, never a tool that persists anything. This is non-negotiable per rule 3/4 and is called out explicitly in `CLEOPATRA_AI_TOOLS.md`.

### Payroll & Attendance

- **Purpose:** Per-employee hourly payroll (`computeEmployeePayroll`), frozen monthly `PayrollPeriod`s, advances, attendance via branch PIN kiosks.
- **Sensitivity:** Already SUPER_ADMIN-only in the existing UI (`CLAUDE.md` §7 — "حساسية بيانات الرواتب"). Any AI tool touching this data must enforce the identical restriction — not a relaxed version of it for the AI's convenience.

### Settings & Audit Log

- **Purpose:** `Setting` (the single-row global config table — pricing constants, thresholds like `hrScalingWaitingThreshold`, business identity), `AuditLog` (the existing audit trail this whole feature must plug into — see `CLEOPATRA_AI_SECURITY.md` §5).
- **Permissions:** `settings.view/edit` (Settings), no permission gate on AuditLog reads beyond the SUPER_ADMIN-only Audit Log viewer page already in place.

## 8. What Cleopatra AI is explicitly **not**

- Not a second backend, not a second database connection, not a second copy of any validation/pricing/permission rule.
- Not a way around the confirmation step for anything the request classifies as sensitive (`CLEOPATRA_AI_SECURITY.md` §4).
- Not a source of truth for live numbers — the system prompt is knowledge *about the system*, never a cache of *data in* the system.
