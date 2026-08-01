# ADR 0018: Phased, gated, strangler-fig migration strategy

**Status:** Accepted

## Context

Rewriting a working (if architecturally limited) production pricing system in one large effort risks shipping a big-bang cutover with no working intermediate state to fall back to, and makes it hard to verify calculation parity incrementally. The business explicitly wants each step reviewed before the next begins.

## Decision

The migration is broken into small, numbered phases (MIGRATION_PLAN.md), each independently verifiable, each requiring explicit approval before starting, each committed to git separately. Dependencies between phases are made explicit (a phase dependency graph), and phases are ordered so that the highest-risk piece — the calculation engine — is ported and regression-tested in isolation (Phase 4) before any UI or persistence is built on top of it, rather than being ported last or piecemeal alongside UI work.

Sub-phases (1.6, 1.7, …) are used when a planning/documentation step needs to happen between two numbered implementation phases without renumbering everything that follows.

## Consequences

- Git history itself becomes a readable log of the migration's progress, phase by phase — useful for onboarding and for bisecting any future regression to the phase that introduced it.
- No phase is allowed to reach ahead into a later phase's territory "for convenience" — see [CONTRIBUTING.md](../CONTRIBUTING.md) on scope creep across phase boundaries. This trades some short-term implementation efficiency for long-term reviewability.
- The legacy system (ADR 0017) remains the fallback/reference at every step — there is no point in this migration where the business is without a working system, since the legacy file keeps running until Phase 15's retirement criteria are met.
