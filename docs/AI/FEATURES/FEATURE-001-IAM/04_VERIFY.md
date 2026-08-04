# FEATURE-001 — IAM — Verification Checklist

> Complete this checklist against a running dev environment before marking
> the feature done. A checked box means it was actually observed, not
> assumed.

## Build

- [ ] `npm run build` (root, shared → api → web) succeeds with no errors

## Typecheck

- [ ] `npm run typecheck` succeeds for both `apps/web` and `apps/api`

## Lint

- [ ] `npm run lint` succeeds for both `apps/web` and `apps/api`

## Runtime

- [ ] API dev server starts cleanly and `/health` returns `200`
- [ ] Web dev server starts cleanly with no console errors on load

## Authentication

- [ ] Valid credentials sign in successfully
- [ ] Invalid credentials are rejected with a clear error, not a crash
- [ ] Remember-me persists the session across a browser restart when
      checked, and does not when unchecked
- [ ] Sign-out invalidates the session (a subsequent protected call fails)

## Authorization

- [ ] A request with no bearer token is rejected (401)
- [ ] A request with an invalid/expired token is rejected (401)
- [ ] A valid token with no matching `StaffProfile` is rejected (403)
- [ ] A valid token for a deactivated account is rejected (403)

## RBAC

- [ ] A user only sees/can do what their assigned role's permissions allow
- [ ] Changing a role's permissions changes what its users can do, without
      a code change or redeploy
- [ ] No permission or role name is hardcoded anywhere in application code

## Branch Access

- [ ] A user can access their home branch's data
- [ ] A user cannot access another branch's data without an explicit grant
- [ ] Super Admin can access all branches without explicit grants

## API

- [ ] Every endpoint touched returns the standard `ApiResponse<T>` envelope
- [ ] Every endpoint touched returns correct status codes for success and
      each failure case

## UI

- [ ] Every page/component touched renders correctly with real data
- [ ] Loading and error states are visible and correct, not silently blank

## Responsive

- [ ] Layout is usable at mobile, tablet, and desktop widths

## Arabic

- [ ] Arabic text renders correctly, without truncation or mojibake

## RTL

- [ ] Right-to-left layout is correct where Arabic content is shown
      (alignment, icon placement, reading order)

## Regression

- [ ] Existing, previously-working flows in this feature still work
      unchanged
- [ ] No other feature that depends on IAM (any authenticated route)
      broke as a result of this change

## Known Issues

_List anything found during verification that was not fixed, with enough
detail for it to be picked up later (what, where, how to reproduce)._

- [ ]

---

# FEATURE-001.2 — Invite Acceptance & Password Setup — Verification

> Superseded by a real field-verification pass (below the first pass's
> results, which were code-review-only for several items). This pass used
> a genuine Supabase-issued invite for a disposable test `StaffProfile`
> (role `SALES`, branch `MAIN`), created and deleted in this session —
> not a simulation.

## Build

- [x] `npm run build` (root, shared → api → web) succeeded with no errors.

## Typecheck

- [x] `npm run typecheck --workspace=apps/web` succeeded.
- [x] `npm run typecheck --workspace=apps/api` succeeded.

## Lint

- [x] `npm run lint --workspace=apps/web` succeeded.
- [x] `npm run lint --workspace=apps/api` succeeded.

## Runtime

- [x] Web dev server serves `/accept-invite` with no console errors.

## Authentication

- [x] **Real invite → callback → session established**, verified end to
      end: generated a genuine `inviteUserByEmail`-equivalent link via
      `supabaseAdmin.auth.admin.generateLink({ type: 'invite' })`
      (identical mechanism `createUser()` uses; `generateLink` additionally
      returns the link directly, which is what made this test possible
      without needing real email delivery), navigated the real browser to
      the real resulting callback URL, and confirmed the `ready` (password
      form) state rendered correctly with heading "إنشاء كلمة المرور".
- [x] **Real expired/invalid link handling**, verified with a genuine
      Supabase error response: a one-time invite token, once consumed,
      produced Supabase's real `#error=access_denied&error_code=otp_expired`
      redirect; the app correctly showed the `expired` state
      ("انتهت صلاحية هذا الرابط أو أنه غير صالح…").
- [ ] The literal "type a new password and submit" action and the
      resulting `success` state were **not exercised** — doing so would
      require entering a password into the form field, which this session
      does not do under any circumstance, including for a disposable test
      account. Everything downstream of "a session exists" (see
      Authorization/RBAC/Branch Access/API below) was verified a different
      way: by observing that the same session Supabase establishes at
      invite-link-click time (before any password is set) already flows
      correctly through the app. Recommend the user complete this one
      literal step by hand to close the loop.

## Authorization

- [x] `/accept-invite` is a public route (outside `ProtectedRoute`) and
      does not weaken any existing authorization check — confirmed by
      reading `apps/web/src/App.tsx`'s final route tree.
- [x] **Real verification**: the moment the genuine invite link was
      clicked (before any password was set), `AuthProvider`'s existing
      bootstrap effect detected the new session and called
      `GET /api/auth/me` — observed in the Network panel returning `200
      OK` with the correct `StaffProfile` DTO. This confirms `requireAuth`
      correctly validates a session that originated from an invite-link
      redirect, not only from `signInWithPassword`.
- [x] Missing-session case (no URL params, no session) → `no-context`
      state, confirmed live.
- [x] Invalid-code case (`?code=` garbage value) →
      `exchangeCodeForSession` fails gracefully → `expired` state,
      confirmed live, no console error, no crash.

## RBAC

- [x] **Real verification**: the test account's `SALES` role resolved to
      exactly `["customers.*","orders.*","quotations.*","reports.view"]`
      in the live `/api/auth/me` response — matching
      `apps/api/prisma/seed.ts`'s `DEFAULT_ROLE_PERMISSIONS.SALES` exactly.
      The Dashboard's nav bar correctly showed **only** "Dashboard" (no
      Settings/Users/Roles/Permissions), matching a `SALES` user having
      none of those permissions.

## Branch Access

- [x] The test account's `branchId` (`MAIN`) round-tripped correctly
      through `/api/auth/me`.
- [x] **A pre-existing issue was found, unrelated to FEATURE-001.2**: the
      `/api/auth/me` / `/api/auth/login` response's `accessibleBranchIds`
      field came back as `[]` (empty) rather than including the user's
      home branch. Reading `apps/api/src/services/userService.ts`'s
      `mapStaffToUser()` confirms it maps `accessibleBranchIds` from
      `staff.branchAccess` only — it does not include `staff.branchId`
      itself, unlike `apps/api/src/services/authContext.ts`'s
      `loadAuthContext()`, which correctly includes both. Actual
      authorization is unaffected (`canAccessBranch()` reads from
      `loadAuthContext`'s server-side result, not from this DTO), but any
      frontend UI that trusts `accessibleBranchIds` from this DTO to show
      "which branches can I use" would incorrectly show none. **This file
      was not touched** — it predates FEATURE-001.2 (written in Phase 2)
      and fixing it is out of this task's scope; flagged for separate
      follow-up.

## API

- [x] No new endpoint — confirmed the exact same `POST /api/auth/login` /
      `GET /api/auth/me` response shapes are used, unchanged, including
      by the real test above.

## UI

- [x] `no-context` state — confirmed live (no session, no URL params).
- [x] `ready` state (password form, heading, show/hide toggle, confirm
      field) — confirmed live via a real invite callback.
- [x] `expired` state — confirmed live, twice: once via a genuinely
      consumed real invite token, once via a garbage `?code=` value.
- [ ] `success` state — not exercised (see Authentication above).
- [ ] `already-accepted` state — exercised, but only via a **stale
      lingering session** (see Known Issues) rather than the intended
      "revisit an already-used link" scenario; the state itself rendered
      correctly ("تم قبول هذه الدعوة بالفعل…") when triggered.

## Responsive

- [x] `ready` state confirmed to render correctly and completely at a
      375×812 mobile viewport (all fields present, no overflow/breakage).

## Arabic

- [x] All UI copy observed (`no-context`, `ready`, `expired`,
      `already-accepted`) is correct Arabic, no mojibake/truncation.

## RTL

- [x] `dir="rtl"` container and `dir="ltr"` password field confirmed via
      direct DOM inspection in the live page, matching `LoginPage.tsx`'s
      convention.

## Regression

- [x] `/login` (email-or-phone sign-in, show/hide password, remember-me,
      forgot-password) still renders and functions after these changes.
- [x] No other route's behavior changed — confirmed by `git status`/diff
      scope (only the files listed in `03_IMPLEMENT.md`).

## Known Issues

- [ ] **Pre-existing, not caused by this feature**: `signOut()`
      (`apps/web/src/state/AuthContext.tsx`) is fire-and-forget from the
      Dashboard's button (`onClick={() => void signOut()}`). Navigating
      away immediately after clicking it (as this session's automated
      testing did) can outrace the async `apiPost('/api/auth/logout')` +
      `supabase.auth.signOut()` sequence, leaving the Supabase session in
      `localStorage` uncleared. Observed directly: `sb-<ref>-auth-token`
      was still present after a such a race. Not touched — this function
      predates FEATURE-001.2 and a real user's normal click-and-wait
      behavior is much less likely to hit it, but it's a real, reproducible
      gap worth a separate look.
- [ ] **Pre-existing, not caused by this feature**: see Branch Access
      above — `mapStaffToUser()`'s `accessibleBranchIds` omits the user's
      home branch.
- [ ] The distinction between "expired" and "already accepted" links is
      necessarily approximate: Supabase's GoTrue does not reliably
      distinguish the two in its error response (confirmed: a genuinely
      re-used real invite link produces the exact same
      `otp_expired`/`access_denied` error as a time-expired one), so both
      collapse to this page's `expired` state — documented in
      `AcceptInvitePage.tsx`'s own code comments.
- [ ] The literal password-submission step and `success` state were
      verified by code review and by confirming every step downstream of
      "a session exists" works correctly, but not by actually typing a
      password and clicking submit (see Authentication above).
- [ ] Weak-password rejection and network-failure handling were not
      exercised live in this pass either, for the same reason (both
      require submitting the form) — verified only by code review of
      `translateSetupError()`'s branches.
