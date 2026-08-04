# FEATURE-001.4 — IAM Cleanup

## Feature Name

IAM Cleanup

## Purpose

Fix two real, confirmed defects discovered during FEATURE-001.2's field
verification (`docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md`):

1. `signOut()` can leave a stale Supabase session in `localStorage` if
   navigation happens while it's still in flight.
2. `mapStaffToUser()` omits a user's home branch from the
   `accessibleBranchIds` it returns to the frontend.

Neither was caused by FEATURE-001.2 — both predate it (Phase 2). This is
a targeted cleanup, not a new feature.

## Business Goal

Close two data-correctness/robustness gaps in the existing, already-shipped
IAM implementation before they can compound: a session that outlives a
user's intent to sign out, and an API response field whose name promises
something it doesn't currently deliver.

## Scope

- `apps/web/src/state/AuthContext.tsx`'s `signOut()` and the "Sign out"
  button in `apps/web/src/components/AppShell.tsx`.
- `apps/api/src/services/userService.ts`'s `mapStaffToUser()`, brought in
  line with `apps/api/src/services/authContext.ts`'s already-correct
  `loadAuthContext()`.

## Out of Scope

- Any other IAM behavior not named above.
- Any business module.
- Any schema or migration — both fixes are logic-only.
- Broader session-management hardening (e.g. `beforeunload` handling,
  server-side session revocation lists) beyond what directly closes the
  two confirmed gaps.

## Dependencies

- `docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md` — the field verification
  that discovered both issues, with reproduction details.
- `docs/AI/HANDBOOK/02_DATABASE_RULES.md` — "Never duplicate calculations
  in multiple places" is the guiding rule for the `accessibleBranchIds`
  fix specifically.

## Acceptance Criteria

- Clicking "Sign out" and then immediately navigating away no longer
  leaves a valid Supabase session in `localStorage`.
- `accessibleBranchIds` in every `User` DTO (`/api/auth/login`,
  `/api/auth/me`, `GET/POST/PUT /api/users*`) includes the user's home
  branch, matching `loadAuthContext()`'s definition of "accessible."
- No duplicate branch-access-computation logic exists across the two
  files — one definition, reused.

## Deliverables

- A plan (`02_PLAN.md`) precise enough to implement both fixes without
  further design decisions.
- This folder's documentation, following the same
  analysis → plan → implement → verify pattern as FEATURE-001.2.

## Current Status

**Status: Implemented (Pending Field Verification) — not Verified.**
Both fixes were implemented by the two background sessions
(`task_61cf631b`, `task_f1446cc3`), each in its own worktree/branch
(`claude/silly-goldstine-315a52`, `claude/musing-ardinghelli-442f94`).
Both independently pass `build`/`typecheck`/`lint` (genuinely executed
against each worktree, not assumed — see `04_VERIFY.md`). Not yet
"Verified": the two fixes have never been merged/combined, and neither
was live-retested against the original reproduction steps. See
`03_IMPLEMENT.md` for what was actually implemented (Issue 1's fix is
architecturally better than this plan recommended; Issue 2's fix is
correct but didn't deduplicate the calculation the way `02_PLAN.md`
suggested) and `04_VERIFY.md` for the full, itemized verification state.

## Risks

- See `02_PLAN.md` §"Regression Risks" for the detailed, per-issue list.
- Issue 2's shipped fix left the underlying duplicate-calculation
  structure in place (see `03_IMPLEMENT.md`) — functionally correct
  today, worth a small follow-up if either file changes again.
- The two fixes have not been merged together or live-retested — see
  `04_VERIFY.md`'s Status section for what remains before this can be
  called fully done.

## Notes

Both issues were discovered incidentally while verifying FEATURE-001.2,
not sought out — this plan treats them as their own small feature purely
for traceability (per this project's own documentation convention), not
because they warrant a large process.
