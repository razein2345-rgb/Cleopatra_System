# Cleopatra AI — Architecture

**Status (updated 2026-09-18):** Implemented and hardened through Task 15.7. Read-only assistant, local Ollama provider, 24 tools, zero write capability. This document describes the system as it actually exists in the repository, not a proposal.

**Scope:** module map, request-flow architecture, the LLM-provider choice, and the knowledge/routing design. Tool catalog is in `CLEOPATRA_AI_TOOLS.md`; the security/permission/read-only boundary is in `CLEOPATRA_AI_SECURITY.md`; task-by-task history is in `CLEOPATRA_AI_IMPLEMENTATION_PLAN.md`.

---

## 1. The one rule everything else follows: ADR 0030

> "Business tables are never accessed directly by frontend applications. Every business operation must always pass through the ERP REST API... a future Customer Portal, Mobile Apps, a public Website, **AI agents**, or third-party integrations all reach business data exactly the same way every existing client does today: through the REST API, subject to its authentication, RBAC (ADR 0021/0022), and audit logging in full."
> — `adr/0030-backend-only-database-access.md`

This holds exactly as built:

- Cleopatra AI **never imports Prisma** directly and never runs raw SQL — every tool wraps an existing service function.
- Cleopatra AI **never gets a service-role key** or a database connection of its own.
- Every one of the 24 tools under `apps/api/src/services/ai/tools/` is a thin wrapper: check permission → call an existing service function (`orderService.ts`, `treasuryService.ts`, `inventoryService.ts`, ...) → shape the result. Confirmed by inspection — zero tool file contains its own Prisma write call.

## 2. Request-flow architecture (as built)

```
Staff member (logged in, has a real session/JWT)
    │
    ▼
POST /api/ai/chat   { messages, context? }
    │  Authorization: <the user's own existing JWT, same as every other request>
    ▼
apps/api/src/routes/ai.ts  — requireAuth middleware, same as every other route
    │
    ▼
apps/api/src/controllers/ai.ts::postAiChat
    │
    ▼
apps/api/src/services/aiAgentService.ts::runAiChat  (the orchestrator loop)
    │   - builds the system prompt (systemKnowledge.ts, always-injected static text)
    │   - injects the incoming conversation-context breadcrumb, if any, as plain text
    │     (never plumbed directly into a tool call — it cannot bypass a permission check)
    │   - selects a narrowed tool subset via toolRouting.ts (see §4)
    │   - calls the Ollama provider with that narrowed tool catalog
    ▼
apps/api/src/services/ai/providers/ollamaProvider.ts
    │   - model: qwen3, think: false, options.temperature: 0 (Task 15.2)
    │   - local Ollama instance only — no hosted API, no network egress for the model call
    ▼
Model returns either a final text answer or one/more tool calls
    ▼
dispatchTool() (inside aiAgentService.ts)
    │   - looks up the requested tool in AI_TOOLS
    │   - checks req.auth against the tool's declared requiredPermission
    │     (identical hasPermission() function every controller already uses)
    │   - Guard A: if a get_*/detail tool's id looks like a human-readable
    │     reference rather than a UUID, substitutes the paired search_* tool
    │     instead of executing (readGuardMetadata.ts, Task 12)
    │   - Guard B: rejects reuse of a stale conversation-context entityId
    │     immediately after the user issues an explicit correction
    │     (correctionDetection.ts, Task 12)
    │   - calls the EXISTING service function — never a new implementation
    │   - Task 13/13.1: any exception from execute() is logged server-side
    │     (console.error) but never leaks past a generic Arabic fallback message
    ▼
Loop continues (bounded iteration count) until a final text answer,
or — Task 15.7 — if routing narrowed to exactly one tool (search_help_topics)
and the model returned zero tool calls, the app itself dispatches that one
tool deterministically and gives the model one more turn to answer from
the real result, rather than surfacing the model's ungrounded guess.
    ▼
Response returned to the caller: { reply, toolsUsed, context? }
```

Two things to notice:

1. **The dispatcher calls services, not routes.** The orchestrator calls service functions in-process — the same functions the existing REST controllers call — rather than making a self-referential HTTP call back into its own API. This satisfies ADR 0030's actual intent (never bypass the service layer / validation / RBAC / audit) without a pointless network hop.
2. **The orchestrator lives inside `apps/api`**, as a new module of the existing backend (new routes + one new service + a tools folder), not a second backend or a separate deploy.

## 3. LLM Provider — local Ollama, not a hosted API

The original proposal evaluated Anthropic's hosted API against local Ollama and initially favored the hosted option. That decision was overridden the same day by explicit owner instruction: **no Cleopatra business data may be sent to a hosted LLM API.** The shipped provider is `apps/api/src/services/ai/providers/ollamaProvider.ts`:

- Model: `qwen3` (the `DEFAULT_MODEL` constant), reachable only on a local Ollama instance.
- `think: false` — Qwen3's internal reasoning trace is disabled for responsiveness.
- `options: { temperature: 0 }` (Task 15.2) — greedy/argmax decoding. A live A/B trial of seven runs of the same request found the model discarding a correct, byte-identical tool result in 3 of 7 runs purely from sampling variance before this change; deliberately only this one parameter was changed, to keep the before/after comparison attributable to a single cause.
- `aiAgentService.ts` and every tool file import nothing from an LLM SDK directly — only `ollamaProvider.ts` talks to Ollama, so swapping providers later remains a contained, additive change if it's ever revisited. No such change is planned or in progress.

Ollama's runtime limitation discovered during Task 15.6: **Ollama 0.33.3 exposes no working `tool_choice` mechanism** to force a tool call even when exactly one tool is offered — a direct API experiment showed identical behavior with or without attempting to set it. This is why Task 15.7's deterministic HELP fallback exists at the application level instead of relying on the provider to guarantee a tool call.

## 4. Tool routing (toolRouting.ts)

Rather than always offering all 24 tools to the model, `selectToolsForRequest()` narrows the offered set per request:

1. **Keyword/domain matching** — a fixed set of Arabic keyword rules maps to tool domains (customers, suppliers, quotations, work orders/production, inventory, treasury).
2. **Conversation-context routing** — if a context breadcrumb from a previous turn names an entity type and the current message looks like a follow-up (`تفاصيله`, `كشف حسابه`, ...), routing targets that entity's domain even with no fresh keyword.
3. **HELP-intent whitelist** (Task 14.2, expanded Task 15.4) — a deliberately narrow set of whitelisted phrasings (`إزاي`/`ازاي`, an enumerated list of `فين + <screen name>` pairs, `<procedural verb> + إمتى`, `مين + يقدر/المسؤول`, `هل + [≤20-char gap] + إجباري/اختياري/لازم`) routes exclusively to `search_help_topics`. Each pattern is a hand-curated whitelist or a question-word paired with a qualifier — never a bare question word — specifically because a bare question word alone (`فين`, `إمتى`, `مين`, `هل`, `إيه`) was proven in Task 15.3's live testing to collide with real business-data questions (e.g. `إيه حالة الماكينات؟` must never be routed to HELP).
4. **Permission pre-filter** — whatever the above steps select is further filtered to only the tools the caller's own permissions actually allow, mirroring `isToolAllowedFor()`'s exact logic to `dispatchTool()`'s own gate.
5. **Ambiguous fallback** — no keyword, no context, no help signal → the full permission-filtered tool set is offered, unchanged from the original design.

## 5. Conversation context (Task 8)

A structured entity breadcrumb (`conversationContext.ts`) is extracted from certain tool results (customer, supplier, quotation, work order) when exactly one match is returned, carried across turns as `{ entityType, entityId, label }`, and injected into the next request's prompt as plain descriptive text — never as a value plumbed directly into a tool call, so it can never bypass `dispatchTool()`'s own permission check. Two-or-more-match results deliberately produce no breadcrumb (a disambiguation case a single follow-up can't resolve on its own).

## 6. Correction and hallucinated-reference handling (Tasks 10–12)

Two related failure modes were found via live testing (Task 9): the model reusing a stale context entity after the user explicitly corrected it, and the model calling a `get_*`/detail tool with a human-readable name or number instead of the entity's real UUID. Task 10 first tried fixing both with prompt wording alone; live regression testing showed prompt-only hardening does not reliably change qwen3's behavior for either failure mode, so Task 12 added deterministic code-level guards on top of (not instead of) the prompt wording:

- **Guard A** (`readGuardMetadata.ts`) — if a `get_*`/detail tool is called with an id that doesn't look like the entity's real UUID, the dispatcher substitutes the paired `search_*` tool automatically instead of executing the mismatched call, still subject to the caller's own permission check on the search tool.
- **Guard B** (`correctionDetection.ts`) — a small, deliberately narrow, deterministic set of Egyptian-Arabic correction markers (`لا، قصدي ...`, `مش ... قصدي ...`) detects that a correction happened in the current turn; if so, reuse of the OLD context's entityId in a `get_*` call is rejected before `execute()` runs. It never attempts to guess the new entity itself — only refuses the stale one.
- The prompt-level wording both guards' behavior mirrors is still present in `systemKnowledge.ts` and still matters — it's what steers the model toward calling `search_*` correctly in the first place, before either guard ever needs to fire.

## 7. HELP knowledge and deterministic fallback (Tasks 14.1, 14.2, 15.7)

Task 14's audit found the assistant had no reliable way to answer "how do I use Cleopatra" questions — `systemKnowledge.ts` only ever had one-line module names, and nothing described an actual workflow, UI action, or route. Task 14.1 added `helpKnowledge.ts` — a hand-written, structured, statically-verified knowledge base (every fact checked against the current implementation, not assumed from documentation) — looked up on demand by the read-only `search_help_topics` tool, so it costs zero prompt tokens on every other request. Task 14.2 wired automatic routing to it (§4.3); Task 15.4 expanded both the routing patterns and the topic set after further live-testing gaps were found.

Task 15.5/15.6 found that qwen3 sometimes emits zero tool calls even when routing has already narrowed to exactly one unambiguous tool, and that Ollama has no way to force a tool call in this situation. Task 15.7's deterministic HELP fallback closes this gap at the application level: when routing narrowed to exactly `search_help_topics`, the model returned zero tool calls, and neither the fallback nor any other tool has already fired this request, `aiAgentService.ts` itself dispatches the `search_help_topics` call the model should have made — through the exact same `dispatchTool()` path any model-generated call uses — and gives the model one more turn to phrase a grounded answer from the real result. The model's own discarded, ungrounded text is never surfaced to the user.

## 8. RAG — still not needed

Unchanged from the original assessment: the static system-prompt knowledge is a few thousand tokens at most, and live data is fetched via exact tool calls rather than similarity search. No vector-store infrastructure exists or is planned.

## 9. Module Map

Unchanged background reference — condensed from direct repository inspection, describing the business services every AI tool wraps. This section documents the underlying business system, not the AI implementation itself; it is not AI-specific and stays accurate regardless of provider or task history.

### Orders & Work Orders

- **Purpose:** The center of the system — a customer's invoice/quotation (`Order`/`Quotation`), broken into `OrderItem`s, each priced by the Pricing Engine and (if it needs internal production) assigned to a `WorkOrder` running one `WorkflowInstance`.
- **Models:** `Order`, `OrderItem`, `Quotation`, `QuotationItem`, `WorkOrder`, `Payment`, `OrderItemReturn`.
- **Services:** `orderService.ts`, `pricingEngineService.ts` (wraps `packages/shared/src/pricing/*` — verbatim-ported from legacy per ADR 0016, **never reimplemented or approximated by the AI**), `quotationService.ts`, `workOrderService.ts`.
- **Permissions:** `orders.view/create/edit/delete`, `quotations.view/create/edit/delete`, `payments.edit`, `work-orders.view/edit/delete`, `returns.create`.

### Production / Workflow Engine

- **Purpose:** A Dynamic Workflow Engine (rule 14 — never hardcoded steps) that moves a `WorkOrder` through per-track stages, with full history (`WorkflowEvent`) and an undo path (`REVERTED` status).
- **Models:** `WorkflowTemplate`, `WorkflowStage`, `WorkflowInstance`, `StageInstance`, `WorkflowEvent`, `Machine`.
- **Services:** `workflowInstanceService.ts`, `workflowTemplateService.ts`.
- **Permissions:** `work-orders.view/edit/delete`, `workflow-templates.*`, `machines.*`.

### Treasury (الخزينة والنقدية)

- **Purpose:** Every real cash/wallet movement per branch, live balances by payment method, daily open→close→(reopen) reconciliation, strictly branch-scoped.
- **Models:** `TreasuryEntry`, `TreasuryDayClosure`, `TreasuryCategory`, `FixedMonthlyExpense`.
- **Services:** `treasuryService.ts`, `branchFinancialsService.ts`.
- **Permissions:** `treasury.view/create/edit/delete`, `reports.view`.
- **AI touch point:** read-only (`get_treasury_summary`) only — no AI tool writes a treasury record.

### Inventory

- **Purpose:** Cross-branch stock quantities, auto-deduct/restock, auto-raised purchase requests, barcode lookup.
- **Models:** `InventoryItem`, `StockLevel`, `StockMovement`, `PurchaseRequest`, `InventoryCategory`.
- **Services:** `inventoryService.ts`, `purchaseRequestService.ts`.
- **Permissions:** `inventory.view/create/edit/delete`, `inventory.costPrice`.

### Customers, Leads & Balance

- **Purpose:** `BusinessPartner`, `Lead`, `CallLog`. No persisted "customer balance" field — computed fresh on every read (`orderService.ts::mapOrderToDto`). `get_customer_balance` calls the same computation — never re-derives the formula.
- **Permissions:** `partners.view/edit/delete`, `leads.view/edit`, `call-logs.view/create`.

### Pricing Engine

- **Purpose:** The one calculation surface `CLAUDE.md` rules 3/4 protect explicitly. Lives in `packages/shared/src/pricing/*`.
- **AI's only legitimate touch point:** `calculate_price` — a read-only preview calling the exact same pricing function the order composer's live preview calls. Never persists anything, never reimplements the formula.

### Payroll & Attendance

- **Purpose:** Per-employee hourly payroll, frozen monthly `PayrollPeriod`s, advances, attendance via branch PIN kiosks.
- **Sensitivity:** `get_employee_payroll` is SUPER_ADMIN-only, matching the existing UI's own gate exactly — the AI layer is never more permissive than the UI it stands in for.

### Settings & Audit Log

- **Purpose:** `Setting` (single-row global config), `AuditLog` (existing audit trail).
- **Permissions:** `settings.view/edit`.

## 10. What Cleopatra AI is explicitly not

- Not a second backend, not a second database connection, not a second copy of any validation/pricing/permission rule.
- Not a write-capable agent of any kind — zero write tools exist as of Task 15.7.
- Not a source of truth for live numbers — the system prompt is knowledge *about* the system, never a cache of data *in* the system.
- Not connected to any hosted LLM — Ollama remains local-only by explicit owner instruction.
