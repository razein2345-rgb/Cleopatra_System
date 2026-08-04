# FEATURE-001.4 — IAM Cleanup — Implementation Record

> Written after the fact: both fixes were implemented in two separate
> background sessions/worktrees
> (`.claude/worktrees/musing-ardinghelli-442f94` for Issue 1,
> `.claude/worktrees/silly-goldstine-315a52` for Issue 2), not in this
> session, and not yet merged into `main`. This record was produced by
> reading each worktree's actual diff directly — not by re-deriving or
> guessing what they contain.

## Issue 1 — `signOut()` race

**Implemented differently than `02_PLAN.md` recommended, and better.**
The plan's recommendation was a UI-level mitigation (disable the button
while `signOut()` is in flight) — a reasonable but admittedly
incomplete fix, since it only closes the "click again" trigger, not the
underlying race itself. The actual implementation instead removes the
network dependency from the critical path entirely:

- `apps/web/src/state/AuthContext.tsx`'s `signOut()` now:
  1. Captures the current access token via `supabase.auth.getSession()`.
  2. Calls `supabase.auth.signOut({ scope: 'local' })` — clears the local
     session with **no network round trip**, so it can't be interrupted
     by navigation the way the previous `await apiPost(...)` step could.
  3. Calls `setAuthContext(null)`.
  4. Fires `apiPostBeacon('/api/auth/logout', token)` — a **fire-and-forget**
     call, not awaited.
- `apps/web/src/lib/api.ts` gained `apiPostBeacon()`: a `fetch(...,
  { keepalive: true })` call that the browser guarantees survives page
  unload/navigation (the standard platform mechanism for exactly this
  problem — the same primitive `navigator.sendBeacon` is built on). It
  takes an explicit token parameter rather than reading the live session,
  since by the time it's called the local session is already gone.
- `apps/api/src/controllers/auth.ts`'s `logout()` doc comment was updated
  to describe the new contract: it's now a best-effort audit write, not a
  precondition for the user being considered signed out. **No behavior
  change** to the endpoint itself — same audit entry, same response.
- `apps/web/src/components/AppShell.tsx` also added an `isSigningOut`
  loading state (disables the button, shows "Signing out…") — the
  UI-level touch the plan recommended, kept as a UX nicety even though
  it's no longer load-bearing for correctness now that the race itself is
  closed at the `AuthContext` level.

This matches the architectural decision now recorded in
`docs/AI/PROJECT_MEMORY.md`: **authentication cleanup must never depend
on a network request** — local sign-out is synchronous-to-the-user
(no await on any fetch), and the audit log write is explicitly
best-effort via a keepalive beacon.

Files actually changed (per `git diff` in that worktree):
`apps/web/src/state/AuthContext.tsx`, `apps/web/src/lib/api.ts`,
`apps/web/src/components/AppShell.tsx`, `apps/api/src/controllers/auth.ts`
(comment only, no logic change).

## Issue 2 — `accessibleBranchIds`

**Implemented more narrowly than `02_PLAN.md` recommended.** The plan
called for extracting the union logic into a shared, exported function
in `authContext.ts` and calling it from both places, specifically to
avoid leaving two independent copies of the same calculation. The actual
implementation instead inlined the fix directly in `userService.ts`:

```ts
accessibleBranchIds: Array.from(
  new Set<string>([staff.branchId, ...staff.branchAccess.map((access) => access.branchId)]),
),
```

This **is correct and fixes the reported bug** — `accessibleBranchIds`
now includes the home branch, matching `loadAuthContext()`'s output for
the same user. It does **not** address the deeper structural point
`01_ANALYSIS.md` raised: there are now two separate, independent places
(`authContext.ts` and `userService.ts`) computing the identical
three-line union, which is exactly the "duplicate calculation" pattern
`docs/AI/HANDBOOK/02_DATABASE_RULES.md` warns against. Low practical
risk today (both are short, simple, and unlikely to need to change), but
worth a follow-up if either ever needs to change — a future editor could
update one and miss the other.

Files actually changed (per `git diff` in that worktree):
`apps/api/src/services/userService.ts` only.

## What was NOT done in this documentation session

- The two fixes were **not merged together** — each exists only in its
  own isolated worktree/branch (`claude/musing-ardinghelli-442f94`,
  `claude/silly-goldstine-315a52`), not on `main`, and not combined
  anywhere.
- **Build, typecheck, and lint were not run** against either
  implementation in this session — neither worktree has dependencies
  installed, and installing/building was out of scope for a
  documentation-only task. This record reflects a careful reading of both
  diffs, not executed verification.
- No manual re-test of either fix (re-reproducing the original races with
  the fixes applied) was performed in this session, for the same reason.

See `04_VERIFY.md` for exactly what is and isn't confirmed, and why this
feature's status is not "Verified" yet.
