# Cleopatra AI — Implementation Plan

**Status (updated 2026-09-18):** Read-only assistant shipped and hardened through **Task 15.7**. This supersedes the original Phase 0 proposal below in one material way: the provider is **local Ollama (`qwen3`)**, not the hosted Anthropic API this document originally proposed — the owner's explicit instruction was that no Cleopatra business data may leave the building to a hosted LLM. Everything else about the phased structure (read-only first, write tools only with separate explicit approval per phase) held.

Cross-reference: `CLEOPATRA_AI_ARCHITECTURE.md` (system design, as actually built), `CLEOPATRA_AI_TOOLS.md` (the 24-tool catalog, as actually built), `CLEOPATRA_AI_SECURITY.md` (permission/read-only boundary, as actually built).

---

## Phase 1 — Foundation: read-only Q&A (SHIPPED)

**What actually shipped**, in order:

1. Read-only assistant, `POST /api/ai/chat`, `requireAuth`-gated, orchestrator loop in `apps/api/src/services/aiAgentService.ts`.
2. Same day, the provider was switched from the originally-proposed Anthropic API to a local **Ollama** provider (`apps/api/src/services/ai/providers/ollamaProvider.ts`, model `qwen3`) — owner: no Cleopatra business data to a hosted LLM API. `think: false` disabled Qwen3's reasoning trace for responsiveness.
3. Fifteen numbered hardening/expansion tasks followed (Task 1 through Task 15.7 — see `CLEOPATRA_AI_TOOLS.md` for the tool-by-tool history and `CLEOPATRA_AI_ARCHITECTURE.md` for the routing/guard architecture that grew out of them). Several of these tasks were live-testing/root-cause investigations with no code of their own (Tasks 2, 9, 11, 15.1, 15.3, 15.5, 15.6) whose findings were fixed by the task immediately following.

**Current state:** 24 read-only tools, zero write tools, deterministic tool routing (keyword/domain matching, conversation-context carry-over, and a HELP-intent whitelist), two deterministic code-level guards (Guard A: search-before-get substitution; Guard B: stale-context rejection after an explicit correction), a deterministic HELP fallback when the model returns zero tool calls, and `temperature: 0` for reproducible tool-selection behavior. 218 AI-specific tests passing; 432 tests passing across the full backend suite.

**Database impact:** none — confirmed as of Task 15.7, zero AI-specific migrations exist anywhere in the schema.

**Security impact:** read-only by construction — every one of the 24 tools is confirmed to contain zero `.create(`/`.update(`/`.delete(`/`.upsert(` calls. Every tool call still passes through the same permission check every existing controller uses, so a narrow-permission caller gets narrower answers, never an escalation.

---

## Phases 2–4 — Confirmation infrastructure and write tools: still not started, still not approved

The original proposal below sequenced future write-tool phases (low/medium/high risk, gated behind a confirmation-token architecture). **None of this has been built, approved, or scheduled.** It is kept here only as a record of what was proposed, not as an active roadmap:

- No confirmation infrastructure exists.
- No write tool of any kind exists (`create_lead`, `advance_workflow_instance`, `create_treasury_entry`, or otherwise).
- No `AuditLog.initiatedByAgent` column or any other AI-specific schema change exists.
- Nothing in the current implementation assumes or depends on a future write phase.

Any of this remains possible in principle, but — per this project's standing rules — would need its own explicit, separate owner approval before a single line of it is written, exactly as the original proposal said. This document does not speculate about when or whether that happens.

## Explicitly out of scope (unchanged)

- **RAG / vector search** — not needed; the static system-prompt knowledge is a few thousand tokens, and live data is fetched via exact tool calls, not similarity search.
- **A different/hosted LLM provider** — deliberately rejected; Ollama stays local-only per explicit owner instruction. `LlmProvider`-style abstraction was not built as a separate interface, but `ollamaProvider.ts` is the sole call site — nothing else in the codebase imports an LLM SDK directly.
- **Customer-facing chat** — this remains an internal-staff-only tool (`requireAuth`, no separate customer-facing surface exists).
