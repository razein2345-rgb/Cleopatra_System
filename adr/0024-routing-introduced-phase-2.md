# ADR 0024: React Router introduced in Phase 2, ahead of its original plan

**Status:** Accepted

## Context

ADR 0002 (Phase 1) deliberately deferred adding a routing library, reasoning that the frontend had exactly one screen (a Settings toggle) and that MIGRATION_PLAN.md's Phase 5 (Order Builder UI) was the earliest phase expected to need real multi-screen navigation. Phase 2's actual scope — a login page, protected application routes, and separate Users/Roles/Permissions management screens, each independently permission-gated — cannot be built with a single component and local `useState` toggles the way Phase 1's Settings screen was.

## Decision

Add `react-router-dom` now, in Phase 2, rather than waiting for Phase 5. Route structure: `/login` (public), everything else behind a `ProtectedRoute` (redirects to `/login` if unauthenticated) wrapped in `AppShell` (top nav, filtered by the current user's permissions), with per-page `ProtectedRoute permission="..."` gates nested inside for pages that require a specific permission beyond "is logged in."

## Consequences

- This is a deliberate, documented deviation from MIGRATION_PLAN.md's original phase assignment for routing — recorded here specifically so it reads as an intentional call, not scope creep noticed after the fact (see CONTRIBUTING.md's guidance on not reaching into a later phase's territory "for convenience": this ADR is the exception that proves the rule, made explicitly rather than silently).
- Phase 5's Order Builder work inherits a routing setup already in place rather than needing to introduce one itself — reduces, not increases, that phase's scope.
- Client-side route/permission gating (`ProtectedRoute`) is UX only, not a security boundary — every route's data still comes from API endpoints that independently re-check authorization server-side (ADR 0022) regardless of what routes the client believes it can reach.
