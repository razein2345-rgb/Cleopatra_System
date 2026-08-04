# FEATURE-001.4 — IAM Cleanup — Plan

> Planning only. No code changed to produce this document.
>
> **Coordination note**: the user has started two separate background
> sessions (`task_61cf631b` for Issue 2, `task_f1446cc3` for Issue 1)
> to implement fixes for these same two problems, running in parallel
> with this plan. Whoever implements against this plan should re-check
> both files' current state first, in case the parallel session already
> landed a fix — this plan should not be applied blindly on top of
> already-fixed code.

---

## Objective

Fix the two issues detailed in `01_ANALYSIS.md`, each with the smallest
change that closes the real gap, reusing existing patterns/code, with no
schema or API contract change for either.

---

## Issue 1 — `signOut()` race — implementation plan

### Technical design

1. In `apps/web/src/state/AuthContext.tsx`:
   - Add `const [isSigningOut, setIsSigningOut] = useState(false);` inside
     `AuthProvider`.
   - Wrap the existing `signOut` body:
     ```ts
     const signOut = async () => {
       setIsSigningOut(true);
       try {
         await apiPost('/api/auth/logout');
       } finally {
         await supabase.auth.signOut();
         setAuthContext(null);
         setIsSigningOut(false);
       }
     };
     ```
     (Ordering of the two existing calls is unchanged — only the flag
     set/reset is added, in the same `finally` so it always resets.)
   - Add `isSigningOut` to the `AuthState` type and to the provider's
     context value.

2. In `apps/web/src/components/AppShell.tsx`:
   - Destructure `isSigningOut` from `useAuth()`.
   - Pass `disabled={isSigningOut}` to the "Sign out" `Button`.
   - Optionally (recommended, closes the "click a nav link instead of
     the button" variant of the same race): also disable/no-op the
     `NavLink`s while `isSigningOut` is true, or simply leave them — this
     is a judgment call to make at implementation time depending on how
     intrusive it looks; the button-disable alone already closes the
     reproduced scenario.

### Database changes

None.

### API changes

None.

### Frontend changes

`AuthContext.tsx` (state + exposed flag), `AppShell.tsx` (consumes flag,
disables the button). No new component, no new route.

### Permission changes

None.

### Migration impact

None — no schema touched.

### Files expected to change

- `apps/web/src/state/AuthContext.tsx`
- `apps/web/src/components/AppShell.tsx`

### Testing strategy

Reproduce the original race first (click "Sign out," immediately
navigate, check `localStorage` for `sb-<project-ref>-auth-token`) to
confirm it still occurs pre-fix, then confirm the button is disabled
during the round trip and that clicking it a second time (or trying to
click a nav link, if that's also disabled) has no effect until it
resolves. Confirm the flag resets correctly on both success and a forced
failure (e.g. temporarily stopping the API server before clicking sign
out, to exercise the `finally` path).

### Rollback strategy

Trivial — a two-file, additive change (one new state variable, one new
prop). Reverting is a straightforward revert of both files.

---

## Issue 2 — `accessibleBranchIds` — implementation plan

### Technical design

1. In `apps/api/src/services/authContext.ts`:
   - Add an exported helper, near the top or right before
     `loadAuthContext`:
     ```ts
     export function resolveAccessibleBranchIds(staff: {
       branchId: string;
       branchAccess: { branchId: string }[];
     }): string[] {
       return Array.from(
         new Set<string>([staff.branchId, ...staff.branchAccess.map((a) => a.branchId)]),
       );
     }
     ```
   - Replace the inline `Set` construction inside `loadAuthContext()`
     (current lines 44-47) with a call to this function.

2. In `apps/api/src/services/userService.ts`:
   - Import `resolveAccessibleBranchIds` from `../services/authContext.js`
     (or the correct relative path within `services/`).
   - Replace `accessibleBranchIds: staff.branchAccess.map((access) =>
     access.branchId)` with `accessibleBranchIds:
     resolveAccessibleBranchIds(staff)`.

### Database changes

None — both existing queries already fetch `branchAccess` via their
current `include`s.

### API changes

None to the route/contract shape — `accessibleBranchIds: string[]` was
already the documented shape in `packages/shared/src/schemas/user.ts`;
this fix makes the actual returned values match what the field name and
schema already promise. Every endpoint that returns a `User` will now
return a *more complete* (not differently shaped) array.

### Frontend changes

None required — confirmed zero current frontend references to
`accessibleBranchIds` (see `01_ANALYSIS.md`).

### Permission changes

None.

### Migration impact

None.

### Files expected to change

- `apps/api/src/services/authContext.ts`
- `apps/api/src/services/userService.ts`

### Testing strategy

Call `GET /api/auth/me` (or re-run the same throwaway-test-account method
used in FEATURE-001.2's field verification) for a user with only a home
branch and no `UserBranchAccess` grants, and confirm
`accessibleBranchIds` now contains exactly that home branch's id. Also
confirm a user *with* an extra grant still gets the union (home branch +
grant), not a duplicate or a regression to only-grants.

### Rollback strategy

Trivial — revert both files; the extracted function has no other
callers to worry about breaking.

---

## Risks (combined)

- Both fixes are small and isolated, but land while a separate background
  session may be implementing the same fixes independently — see the
  coordination note at the top. Re-verify current file state before
  applying either change.
- Issue 1's fix reduces but does not eliminate the underlying race (see
  `01_ANALYSIS.md` — no client-side fix can be airtight against a tab
  being force-closed mid-request). This should be stated as a known,
  accepted residual limitation, not silently implied to be fully solved.
- Issue 2's fix has no identified regression risk (zero current
  frontend consumers, no schema change, additive-only value correction).

---

## Verification strategy

Same shape as FEATURE-001.2's: `npm run build`, `npm run typecheck`,
`npm run lint` for both workspaces, then the specific manual
reproductions described under each issue's Testing Strategy above.
Update `docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md` with a new
FEATURE-001.4 section once implemented, following the same pattern as
the FEATURE-001.2 sections already there.

---

## Planning completed

Yes.

## Files inspected

`docs/AI/MASTER_PROMPT.md`, `docs/AI/PROJECT_MEMORY.md`,
`docs/AI/FEATURES/FEATURE-001-IAM/README.md`,
`docs/AI/FEATURES/FEATURE-001-IAM/01_ANALYSIS.md`,
`docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md` (all re-read fresh for
this task), plus the source files this plan cites directly:
`apps/web/src/state/AuthContext.tsx`, `apps/web/src/components/AppShell.tsx`,
`apps/web/src/lib/api.ts`, `apps/api/src/services/userService.ts`,
`apps/api/src/services/authContext.ts`, `apps/api/src/controllers/users.ts`,
`apps/api/src/controllers/auth.ts`, `apps/api/src/middlewares/requireAuth.ts`.
Confirmed via `git status`/fresh reads that neither target file had
already been modified by the time this plan was written.

## Files expected to change

4 total, no overlap between the two issues: `AuthContext.tsx`,
`AppShell.tsx` (Issue 1); `authContext.ts`, `userService.ts` (Issue 2). No
schema, no migration, no new API route, no permission change, for either.

## Risks identified

3 — see "Risks (combined)" above. None block implementation; the
coordination note is the only one requiring action (checking current
file state first) rather than a design decision.

## Ready for implementation

Yes, for both issues — each has a fully specified fix, exact file list,
and no open design questions. The only prerequisite is checking whether
the parallel background sessions have already landed either fix before
applying this plan on top.
