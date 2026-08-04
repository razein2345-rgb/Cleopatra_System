# FEATURE-001.4 — IAM Cleanup — Analysis

> Analysis only. No code changed to produce this document. Every
> statement is backed by the specific file/line read during this session
> (re-read fresh, not recalled from memory) or by the live reproduction
> performed during FEATURE-001.2's field verification.

---

## Issue 1 — `signOut()` can leave a stale session

### Root cause

`apps/web/src/state/AuthContext.tsx:84-93`:

```ts
const signOut = async () => {
  try {
    await apiPost('/api/auth/logout');
  } finally {
    await supabase.auth.signOut();
    setAuthContext(null);
  }
};
```

`apps/web/src/components/AppShell.tsx:40`:

```tsx
<Button variant="secondary" onClick={() => void signOut()}>
```

The click handler is fire-and-forget (`void signOut()`) — it does not
block the button, disable navigation, or otherwise prevent the user from
navigating away before the two awaited steps (`apiPost`, then
`supabase.auth.signOut()`) resolve. A full page navigation aborts all
in-flight JS in the unloading document, including pending promises — if
either await hasn't settled yet, `supabase.auth.signOut()` — the call
that actually clears the session from `localStorage` and revokes it
server-side — never runs.

**Reproduced directly** during FEATURE-001.2's field verification: clicked
"Sign out," immediately issued a navigation, then inspected
`Object.keys(localStorage)` and found `sb-gakreqdriuzqvsqtzpbs-auth-token`
still present.

The two-step ordering itself is deliberate and documented
(`AuthContext.tsx:86-87`'s comment): `apiPost('/api/auth/logout')` must
run *before* `supabase.auth.signOut()`, because `apiPost` attaches the
current session's access token as its `Authorization` header
(`apps/web/src/lib/api.ts:6-10`'s `authHeaders()`, which reads
`supabase.auth.getSession()`) — if the Supabase session were cleared
first, the logout request would have no valid token and
`apps/api/src/middlewares/requireAuth.ts` would reject it, and the
`LOGOUT` audit entry (`apps/api/src/controllers/auth.ts`'s `logout()`)
would never be recorded. So the ordering cannot simply be reversed
without losing the audit entry.

### Impact

A user who clicks "Sign out" and then quickly navigates away (browser
back/forward, closing and reopening the app, or — on a shared/kiosk
device — simply walking away while the tab is still settling) can end up
with a Supabase session that is still valid. The next person to open that
browser profile, or the same user returning later, would be silently
re-authenticated by `AuthProvider`'s bootstrap effect
(`AuthContext.tsx:40-66`) without any credential prompt.

### Security implications

Moderate, narrow-window issue: session persistence after an explicit
sign-out intent, on a shared device, is a real access-control gap — not a
privilege-escalation bug, but a "the wrong person can end up authenticated
as the previous user" bug. Additionally, if `apiPost('/api/auth/logout')`
itself doesn't get a chance to complete, the `LOGOUT` audit entry
(`apps/api/src/controllers/auth.ts:39-51`) is silently never written —
an under-logged security-relevant event, contrary to the audit-everywhere
expectation `docs/AI/HANDBOOK/02_DATABASE_RULES.md` sets for CRUD actions
(login/logout aren't CRUD, but ADR 0025 extends the same audit
expectation to auth events).

No client-side JavaScript fix can make this 100% airtight — a browser
tab closed at the exact wrong instant, or a hard `Cmd/Ctrl+Q`, is outside
what an unload-time script can reliably guarantee cleanup for, in any web
application. The realistic, addressable target is the common case: a
user (or an automated test) triggering *another in-app action* — a click,
a nav-link, a second sign-out click — before the first one resolves.

### Correct fix

Prevent the user from self-triggering navigation via this app's own UI
while `signOut()` is in flight, by exposing an `isSigningOut` flag from
`AuthContext` (alongside `signOut` itself) and disabling the "Sign out"
button (and, for extra safety, the nav links) in `AppShell.tsx` while
it's true. This directly closes the exact scenario that was reproduced
(clicking then immediately taking another action), using the same
disabled-during-async-action pattern already established in this
codebase (`apps/web/src/pages/login/LoginPage.tsx`'s `submitting` state,
`apps/web/src/pages/accept-invite/AcceptInvitePage.tsx`'s `state ===
'submitting'`).

**Alternative considered and rejected**: capture the access token into a
local variable before clearing storage, clear `localStorage` synchronously
first, then use the captured token explicitly for the logout request
(bypassing `authHeaders()`'s live `getSession()` read for this one call).
This would close the race more thoroughly, but requires special-casing
how one specific call attaches its auth header — more invasive, and in
tension with "don't introduce new architecture" for a narrow-window issue
whose realistic trigger (per above) is better addressed at the UI-trigger
level.

### Existing code to reuse

- The `disabled={submitting}` / `if (submitting) return` pattern from
  `LoginPage.tsx` and `AcceptInvitePage.tsx` — same shape, applied to the
  sign-out button instead of a form submit button.
- The existing `try { ... } finally { ... }` structure in `signOut()` —
  the new flag's reset belongs in the same `finally` block that already
  guarantees `supabase.auth.signOut()` and `setAuthContext(null)` run
  regardless of whether the logout POST succeeded.

### Files that must change

- `apps/web/src/state/AuthContext.tsx` — add `isSigningOut` state, expose
  it in `AuthState`/the provider value, set/clear it around the existing
  `signOut()` body (no change to the internal ordering or the audit-log
  call).
- `apps/web/src/components/AppShell.tsx` — read `isSigningOut` from
  `useAuth()`, disable the "Sign out" button while true (and optionally
  the nav `NavLink`s, to close the "click a nav link instead" variant of
  the same race).

### Regression risks

- Must ensure the flag always resets (success or failure of the logout
  POST) — the existing `finally` block already guarantees this if the
  reset is placed there.
- Must not change the token ordering that the audit log depends on.
- Must not affect `onAuthStateChange`'s existing `if (!session)
  setAuthContext(null)` handler (`AuthContext.tsx:58-60`), which is a
  separate, already-correct mechanism.
- Disabling nav links during sign-out is a minor UX change (links
  temporarily inert) — acceptable given the sign-out round trip is
  typically sub-second, but worth calling out as an intentional,
  visible behavior change, not a silent one.

---

## Issue 2 — `accessibleBranchIds` omits the home branch

### Root cause

`apps/api/src/services/userService.ts:13-32`'s `mapStaffToUser()`:

```ts
accessibleBranchIds: staff.branchAccess.map((access) => access.branchId),
```

This only maps explicit `UserBranchAccess` grants. Compare
`apps/api/src/services/authContext.ts:44-47`'s `loadAuthContext()`,
which correctly unions the home branch with explicit grants:

```ts
const accessibleBranchIds = new Set<string>([
  staff.branchId,
  ...staff.branchAccess.map((access) => access.branchId),
]);
```

Two files independently compute "which branches can this user access,"
and they disagree — exactly the anti-pattern
`docs/AI/HANDBOOK/02_DATABASE_RULES.md` warns against ("Never duplicate
calculations in multiple places").

**Reproduced directly** during FEATURE-001.2's field verification: a live
`GET /api/auth/me` response for a test user with a home branch and no
extra grants returned `"accessibleBranchIds":[]`.

### Impact

`mapStaffToUser()` is the shared mapper behind every `User`-shaped API
response: `GET /api/auth/me`, `POST /api/auth/login`
(`apps/api/src/controllers/auth.ts`), and every response in
`apps/api/src/controllers/users.ts` (`listUsers`, `getUser`, `createUser`,
`updateUser`, `setUserRoles`, `setUserBranchAccess`). Every one of these
currently under-reports `accessibleBranchIds` for a user whose only
branch access is their home branch — which, today, is every user in the
system (confirmed: only one branch, `MAIN`, exists at all; no
`UserBranchAccess` grant has ever been created in this project's history).

### Security implications

**Not a live vulnerability.** Grepped both `apps/web` and `apps/api` for
`accessibleBranchIds`: the frontend has **zero** references to this field
today (no screen reads or displays it), and the one real authorization
check that matters —
`apps/api/src/services/authContext.ts:63-66`'s `canAccessBranch()` — reads
from `AuthenticatedUser.accessibleBranchIds`, which is populated by the
already-correct `loadAuthContext()`, not by `mapStaffToUser()`. Branch
scoping in `apps/api/src/controllers/users.ts:43-50`'s `listUsers` also
reads from `req.auth.accessibleBranchIds` (the correct source), not from
any `mapStaffToUser()` output.

The risk is latent, not active: a future frontend feature (a branch
switcher, a permissions-editing screen) built by trusting this
DTO field's name at face value would silently under-represent a user's
real access. Worth fixing now, while it's free of any frontend
dependency, rather than after something is built on top of the wrong
shape.

### Correct fix

Extract the union-of-home-branch-and-grants computation into one shared,
exported function, and call it from both `loadAuthContext()` and
`mapStaffToUser()` — not a second copy-paste of the same three lines,
which would fix today's symptom while leaving the same "two places, one
concept" structure that caused it.

### Existing code to reuse

`authContext.ts:44-47`'s existing, already-correct `Set`-based union —
promoted to an exported function (e.g.
`resolveAccessibleBranchIds({ branchId, branchAccess }): string[]`) in
that same file, since `authContext.ts` already owns this concept
(documented in its own header comment).

### Files that must change

- `apps/api/src/services/authContext.ts` — extract the existing inline
  logic into an exported function; `loadAuthContext()` calls it instead
  of inlining the `Set` construction.
- `apps/api/src/services/userService.ts` — import that function, use it
  in `mapStaffToUser()` in place of the current incomplete `.map(...)`.

Both call sites' Prisma `include`s already fetch `branchAccess`
(`userService.ts:5-8`'s `userInclude`, `authContext.ts:26-28`'s inline
include) — no query or schema change needed; the new shared function only
needs `{ branchId: string; branchAccess: { branchId: string }[] }`, a
structural subset both existing query shapes already satisfy.

### Regression risks

- None found against current frontend usage (zero references, confirmed
  by grep).
- `controllers/users.ts:277`'s audit-log payload
  `newValue: { accessibleBranchIds: input.branchIds }` is unrelated — it
  records what was explicitly *granted* in a `setUserBranchAccess` call,
  not a `mapStaffToUser()` output; not affected by this fix.
- Existing tests: none exist for this path (confirmed in
  `01_ANALYSIS.md`'s original IAM audit, §8) — this fix has no test
  suite to update, only the manual verification already planned.
