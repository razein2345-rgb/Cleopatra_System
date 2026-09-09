# Cleopatra AI — Implementation Plan

**Status:** Proposal / Phase 0 audit output. **No phase below has been started.** Each phase requires its own explicit go-ahead from the owner before work begins — this document is the menu, not a commitment to build all of it.

Cross-reference: `CLEOPATRA_AI_ARCHITECTURE.md` (system design), `CLEOPATRA_AI_TOOLS.md` (tool catalog), `CLEOPATRA_AI_SECURITY.md` (permission/confirmation/audit design). This document sequences them into buildable, independently-reviewable phases.

---

## Phase 1 — Foundation: read-only Q&A

**Objective:** A staff member can open a chat panel inside the existing app, ask a question in Arabic, and get an answer grounded in real data — with zero ability to change anything. This is the slice the owner explicitly asked to ship and validate before any execution capability is added.

**Files likely to change / added:**
- `apps/api/src/services/ai/llmProvider.ts` (new — interface, `CLEOPATRA_AI_ARCHITECTURE.md` §3)
- `apps/api/src/services/ai/providers/anthropicProvider.ts` (new)
- `apps/api/src/services/ai/systemKnowledge.ts` (new — the static System Knowledge content, `CLEOPATRA_AI_ARCHITECTURE.md` §4)
- `apps/api/src/services/ai/tools/*.ts` (new — the Phase 1 READ tools from `CLEOPATRA_AI_TOOLS.md`)
- `apps/api/src/services/aiAgentService.ts` (new — the orchestrator loop)
- `apps/api/src/controllers/ai.ts`, `apps/api/src/routes/ai.ts` (new — `POST /api/ai/chat`)
- `apps/web/src/components/ai/AiChatPanel.tsx` (new — the chat UI)
- `apps/web/src/lib/ai/*` — thin API client for the new endpoint
- `packages/shared/src/schemas/ai.ts` (new — request/response Zod schemas for the chat endpoint, following the exact pattern every other module's schema file already uses)
- `package.json` (apps/api) — add `@anthropic-ai/sdk` (the one new dependency this phase requires; nothing else)

**Dependencies:** an `ANTHROPIC_API_KEY` (see Final Report — this is an external, owner-provided prerequisite, not something this plan can satisfy on its own). Added the same way every other secret already is — `sync: false` in `render.yaml`, entered directly into Render's Environment tab, listed (empty) in `apps/api/.env.example`. Never in source, never pasted into chat.

**Database impact:** **none.** Phase 1 is deliberately migration-free — no conversation-history table, no new AuditLog column. Conversation state for a single chat session can live in the browser/request payload (the frontend resends recent turns) rather than being persisted server-side; if that turns out to be too limiting once real usage starts, persisting conversations is a small, self-contained addition to propose *after* Phase 1 is live, not before.

**API impact:** one new route, additive, gated by `requireAuth` (any logged-in staff member, per the owner's own answer on who can use this) — no existing endpoint changes.

**Security impact:** read-only by construction (§2 above); every tool call still passes through the exact permission checks `CLEOPATRA_AI_SECURITY.md` §2 describes, so a user with narrow permissions gets narrow answers, never an escalation.

**Tests:** unit tests for each tool's permission-gating (a user without `treasury.view` gets a rejection, not data); a small eval set (see `claude-api` skill's `build-eval` flow) covering: correct tool selection for a sample of realistic Arabic staff questions, refusal to state a number without a tool call, correct branch-scoping for a non-SUPER_ADMIN user, graceful "I don't know how to check that" for an out-of-scope question.

**Rollback:** delete the new route/service/component files and the one new dependency; zero database state to unwind, since none was created.

---

## Phase 2 — Confirmation infrastructure + first write tools

**Objective:** The AI can *propose* an action, a human explicitly confirms it, and it executes through the real service layer with a full audit trail — starting with the lowest-risk write tools only (`create_lead`, `log_call`, `update_lead_field`, per `CLEOPATRA_AI_TOOLS.md`'s low-risk tier).

**Files likely to change:**
- `apps/api/src/services/ai/confirmationToken.ts` (new — sign/verify, `CLEOPATRA_AI_SECURITY.md` §4)
- `apps/api/src/controllers/ai.ts` — add `POST /api/ai/confirm`
- `apps/api/src/services/ai/tools/createLead.ts`, `logCall.ts`, `updateLeadField.ts` (new)
- `apps/web/src/components/ai/AiChatPanel.tsx` — render the confirmation card + confirm/cancel actions
- Every write-tool call site adds a `recordAudit()` call carrying the `_source: 'cleopatra_ai'` marker (`CLEOPATRA_AI_SECURITY.md` §5)

**Dependencies:** Phase 1 complete and validated (the owner has actually used the read-only assistant and is satisfied it understands the system correctly) — this is an explicit gate, not just a suggested order.

**Database impact:** none required to ship this phase (the JSON-embedded provenance marker needs no migration). The `AuditLog.initiatedByAgent` column described in `CLEOPATRA_AI_SECURITY.md` §5 is an **optional, separately-approved** addition if/when reporting on AI actions specifically becomes a real need — not bundled into this phase by default.

**API impact:** one new endpoint (`/api/ai/confirm`); no existing endpoint changes; the three new write tools call existing, unmodified service functions.

**Security impact:** this is where the confirmation architecture is proven end-to-end on genuinely low-consequence actions before any financial or production-state tool is considered. Each of the three tools' `requiredPermission` matches its equivalent existing UI action exactly.

**Tests:** a confirmation token cannot be replayed after use or after expiry; a token issued to user A cannot be confirmed by user B even if intercepted; every confirmed action produces exactly one `AuditLog` row with the correct entity/action/performedBy.

**Rollback:** disable the three write tools (config flag, not a code revert) while keeping Phase 1's read-only capability live; the confirmation infrastructure itself is inert with no write tools registered against it.

---

## Phase 3 — Medium-risk write tools

**Objective:** `create_order`, `advance_workflow_instance`, `record_payment` — each individually reviewed and enabled only after Phase 2's confirmation/audit path has a real track record.

**Files likely to change:** one new tool file per action under `apps/api/src/services/ai/tools/`, each wrapping the named existing service function with zero new business logic.

**Dependencies:** Phase 2, plus **explicit, separate owner approval for `create_order` specifically** — order creation is the single most complex composer in the app (multi-kind pricing, production-track routing, multi-material notebooks, etc.); this plan does not assume the AI should attempt to replicate that composer's full flexibility in v1. A narrower first version (e.g. only `MANUAL`/`INVENTORY` kinds, the same safe subset the existing quick-paste feature already limits itself to per its own documented reasoning) is the recommended scope, not the full composer surface, unless the owner asks for more.

**Database impact:** none.

**API impact:** none beyond new tool registrations.

**Security impact:** `advance_workflow_instance` is the first tool that changes real production state; its confirmation copy must name the exact work order, current stage, and destination stage, per `CLEOPATRA_AI_SECURITY.md` §4's plain-language requirement.

**Tests:** an order created via the AI tool must produce byte-identical pricing/stock/work-order side effects to the same order entered through the normal composer (same reasoning already applied to `previewItemTotal` reuse — same input, same output, because it's the same function).

**Rollback:** disable the specific tool via config flag; no data migration to reverse.

---

## Phase 4 — High-risk write tools (financial / destructive)

**Objective:** `create_treasury_entry`, `close_treasury_day`, and any delete-shaped tool — each gated behind its own explicit owner sign-off, evaluated individually, not as a batch.

**Files likely to change:** one tool file per action, plus (if requested) the `AuditLog.initiatedByAgent` migration described in Phase 2's Database impact note, promoted here if by this point the volume of AI-initiated financial actions justifies dedicated reporting.

**Dependencies:** Phases 1–3 live and stable for a meaningful period; this is deliberately the last phase, not scheduled on any fixed timeline.

**Database impact:** possibly the one optional `AuditLog` column noted above — a real migration, requiring the standard migration workflow and explicit approval per rule 10, proposed only if needed.

**API impact:** none beyond new tool registrations.

**Security impact:** highest scrutiny in the whole plan. Recommend the owner personally reviews the exact confirmation copy for these three tools before they're enabled, not just the code.

**Tests:** identical-effect tests as Phase 3, plus an explicit test that a malformed/borderline-ambiguous request (e.g. an amount that doesn't parse cleanly) is refused rather than guessed.

**Rollback:** disable via config flag; if the optional migration was applied, it is purely additive and requires no rollback of existing data — dropping the column, if ever desired, affects no other feature.

---

## Explicitly out of scope for this plan

- **RAG / vector search** — see `CLEOPATRA_AI_ARCHITECTURE.md` §6. Not needed at any phase above; revisit only if a concrete, observed need appears.
- **Local/self-hosted LLM** — see `CLEOPATRA_AI_ARCHITECTURE.md` §5. The `LlmProvider` abstraction keeps this possible later without touching any phase above, but no phase here assumes it.
- **Customer-facing chat** (the request and every design decision above is for internal staff use only, per the owner's own answer — "كل الموظفين المسجلين دخول"). A customer-facing assistant is a materially different security surface (unauthenticated or lower-trust callers) and is not addressed by this plan at all.
