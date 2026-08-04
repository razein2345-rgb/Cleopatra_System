# FEATURE-001.4 — IAM Cleanup — Verification

> Both fixes exist only in their own isolated worktrees/branches
> (`claude/musing-ardinghelli-442f94` for Issue 1,
> `claude/silly-goldstine-315a52` for Issue 2) — neither is on `main`,
> and the two have not been merged together. Everything below was
> actually executed in this session against those worktrees (not
> guessed, not assumed from the diff alone), with dependencies installed
> fresh in each. What was **not** done is called out explicitly at the
> end.

## Build

- [x] Issue 1 worktree: `npm run build` (shared → api → web) — clean.
- [x] Issue 2 worktree: `npm run build` (shared → api → web) — clean.
- [ ] Combined build (both fixes together) — not possible without
      merging, which is out of this documentation-only task's scope.

## Typecheck

- [x] Issue 1 worktree: `apps/web` and `apps/api` — both clean.
- [x] Issue 2 worktree: `apps/api` — clean (Issue 2 touches no frontend
      file, so `apps/web` typecheck wasn't separately re-run for it, but
      is covered by the same worktree's successful full `build` above,
      which includes `apps/web`'s own `tsc -b`).

## Lint

- [x] Issue 1 worktree: `apps/web` and `apps/api` — both clean.
- [x] Issue 2 worktree: `apps/api` — clean.

## Runtime

- [ ] Not re-tested live in either worktree this session (would require
      running dev servers from each worktree, which conflicts with the
      main worktree's already-running dev servers on the same ports).

## Issue 1 — signOut race — specific checks

- [x] **Code review, confirmed against the actual diff**: the local
      session clear (`supabase.auth.signOut({ scope: 'local' })`) no
      longer depends on any awaited network call — it runs synchronously
      relative to the click, closing the exact race reproduced during
      FEATURE-001.2's field verification (navigating away before
      `apiPost('/api/auth/logout')` resolved left a stale session).
- [x] The audit-log call (`apiPostBeacon`) uses `fetch(..., { keepalive:
      true })`, the standard browser mechanism for a request that must
      survive page unload — correctly applied for exactly this use case.
- [ ] **Not live-retested**: did not actually click "Sign out" and
      immediately navigate against this fix in a running browser to
      confirm `localStorage` is now clean afterward (the same method
      used to originally discover the bug). Recommended before fully
      closing this out.

## Issue 2 — accessibleBranchIds — specific checks

- [x] **Code review, confirmed against the actual diff**: the fix
      produces the same union `loadAuthContext()` already computes
      correctly (home branch + explicit grants, deduplicated via `Set`).
- [x] Confirmed via the successful typecheck/build above that the change
      compiles cleanly against the existing `User` shared schema
      (`packages/shared/src/schemas/user.ts`) with no type error.
- [ ] **Not live-retested**: did not re-run the same
      throwaway-test-account method used in FEATURE-001.2's field
      verification to confirm a live `/api/auth/me` response now includes
      the home branch. Recommended before fully closing this out.
- [x] Confirmed (again, per `01_ANALYSIS.md`) this fix has zero frontend
      consumers today, so no regression surface exists to check on the
      frontend side.

## API

- [x] Neither fix changes any endpoint's route, method, or request shape.
- [x] Issue 2's response shape change is corrective-only (more complete
      values for an already-documented field), not a contract change.

## Regression

- [x] Both worktrees' full builds succeeded, meaning neither fix broke
      any other part of the codebase it was built alongside.
- [ ] Since the two fixes were never combined, there's no confirmation
      that applying both together (the actual eventual `main` state)
      builds/typechecks/lints cleanly as a pair — very unlikely to
      conflict (they touch entirely disjoint files) but not literally
      confirmed.

## Known Issues

- [ ] Issue 2's implementation fixes the reported bug but does not
      de-duplicate the underlying calculation as `02_PLAN.md`
      recommended — see `03_IMPLEMENT.md` for detail. Low risk, worth a
      small follow-up if anyone touches either file again.
- [ ] Neither fix has been live-retested against the original
      reproduction steps; neither has been merged to `main`.

---

## Status

**Implemented (Pending Field Verification) — not Verified.**

Both fixes are real, correct per thorough code review, and each
independently passes build/typecheck/lint (genuinely executed in this
session, not assumed). That's a meaningfully stronger position than
"planned" — but it falls short of this project's own bar for "Verified"
(the same bar `04_VERIFY.md`'s Runtime/manual-check sections and
FEATURE-001.2's precedent both establish): no live re-test of either
original race was performed, and the two fixes have never been combined
or run together. Marking this "Verified" now would overstate what was
actually confirmed. Recommended next step: merge both branches, then
repeat the exact reproduction steps from FEATURE-001.2's field
verification against the combined result.
