# FEATURE-001.2 — Invite Acceptance & Password Setup — Plan

> Planning only. No code, schema, or API was changed to produce this
> document. Every conclusion below is backed by a specific file read
> during `01_ANALYSIS.md`'s audit, or by officially documented
> `@supabase/supabase-js` v2 behavior — never a guess. Anything that
> depends on the Supabase project's dashboard configuration (not visible
> from this codebase) is called out explicitly as "must confirm before
> implementation," not assumed.

## Objective

Give an invited (or password-reset-requesting) user a real page to land
on after clicking their Supabase email link, so they can set a password
and reach a usable, logged-in session — closing the gap identified in
`01_ANALYSIS.md` §8, without changing the existing authentication model
(Supabase Auth + database-driven RBAC via `StaffProfile`) in any way.

---

## 1. User Journey

```
Admin creates employee
  → apps/web/src/pages/users/UsersPage.tsx calls POST /api/users
  → apps/api/src/controllers/users.ts:createUser()
      - supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })  [existing call, redirectTo to be added]
      - prisma.staffProfile.create(...)  [already creates the StaffProfile immediately — existing behavior]
↓
Invite email sent by Supabase (GoTrue), using Supabase's own "Invite" email template
↓
User clicks the link in the email
  → Supabase redirects the browser to `redirectTo`, with session info attached
    (exact shape — URL hash fragment vs `?code=` — depends on the Supabase
    project's configured auth flow type; see §4 and §8, must confirm)
↓
Application (new page) loads at `redirectTo`
  → the existing Supabase client (apps/web/src/lib/supabase.ts) auto-detects
    the session per its default `detectSessionInUrl: true` config
    (no override exists in the current `createClient()` call — confirmed by
    reading the file in full during the FEATURE-001-IAM audit)
  → the new page inspects the URL / auth event to confirm this is an
    invite or recovery link (not a normal already-logged-in visit) before
    showing the password form — see §2 and §8 for why this check matters
↓
Application validates the invitation
  → validation is performed entirely by Supabase's GoTrue server, not by
    our own backend — a valid session existing after the redirect **is**
    the validation; an invalid/expired/reused link never produces a
    session and instead redirects with an error in the URL (see §5)
↓
User sets password
  → the new page calls supabase.auth.updateUser({ password }) directly
    (same "talk to Supabase client-side, backend uninvolved" pattern
    already used by LoginPage.tsx's handleForgotPassword)
↓
StaffProfile becomes usable
  → no change needed here: the StaffProfile row already exists (created
    synchronously in createUser(), before the invite email is even sent —
    apps/api/src/controllers/users.ts:99-109), so requireAuth's
    loadAuthContext() lookup by supabaseUserId will already succeed
↓
User logs in
  → the new page calls the existing POST /api/auth/login (no change),
    exactly as AuthContext.tsx's signIn() does today, then routes into
    the app the same way LoginPage.tsx does after a normal sign-in
```

---

## 2. Frontend

**New page:** one page handles both invite-acceptance and password-reset
completion, since both are, at the Supabase-client level, "a session was
just established from an email link; ask for a new password" — the same
mechanism (`updateUser({ password })`) regardless of whether the
originating email was an invite or a recovery request. A single page
avoids duplicating the form, validation, loading, and error-handling code
that would otherwise exist twice.

- **New route**: a public route (not behind `ProtectedRoute`), registered
  in `apps/web/src/App.tsx` alongside the existing `/login` route — e.g.
  `/accept-invite` (exact path is a naming choice for implementation, not
  a technical constraint).
- **New component**: e.g. `apps/web/src/pages/accept-invite/AcceptInvitePage.tsx`,
  following the exact structural pattern already established in
  `apps/web/src/pages/login/LoginPage.tsx`:
  - Arabic labels and copy, `dir="rtl"` container (same as `LoginPage.tsx`).
  - Password field with the same show/hide toggle
    (`lucide-react`'s `Eye`/`EyeOff`, already a dependency, already used
    in `LoginPage.tsx`).
  - A second "confirm password" field (new — `LoginPage.tsx` doesn't need
    one since it's not setting a password).
  - Loading state: disable all controls + spinner
    (`lucide-react`'s `Loader2`, `animate-spin` — same pattern as
    `LoginPage.tsx`'s submit button), and the same duplicate-submit guard
    (`if (submitting) return;`).
  - Friendly Arabic error handling: reuse/extend the same
    `translateAuthError`-style mapping already written in `LoginPage.tsx`
    for the new error cases this flow introduces (expired link, already-used
    link, invalid link, password-policy rejection — see §5).
- **Validation**: client-side minimum-length + confirm-password-match
  check before calling Supabase (immediate UX feedback only — the
  authoritative check is whatever password policy Supabase enforces
  server-side; see §5). Could reuse the project's established
  shared-Zod-schema pattern (ADR 0015) with a small new
  `packages/shared/src/schemas/auth.ts` addition (e.g. a
  `setPasswordSchema`) — optional, since this validates a Supabase SDK
  call rather than one of our own Zod-validated API endpoints, but doing
  it this way keeps the pattern consistent with every other form in the
  app.
- **Arabic / RTL**: same conventions already established on the Login
  page during the prior UI refactor — Arabic labels, `dir="rtl"` on the
  page container, `dir="ltr"` on the password `<input>` itself (matches
  `LoginPage.tsx`'s existing password field).

**Existing file likely needing a small change:**
`apps/web/src/state/AuthContext.tsx` — its bootstrap `useEffect`
(lines 32-58) currently treats *any* existing Supabase session as "the
user is logged in, fetch `/api/auth/me`." An invite/recovery link, once
clicked, also produces a real Supabase session (via `detectSessionInUrl`)
— but the user hasn't set a password yet at that point. Exactly how to
sequence this (e.g. the new page checking the URL/auth-event itself
before `AuthContext`'s normal bootstrap has a chance to redirect
elsewhere) is a design detail to resolve during implementation, not
during this planning pass — flagged as a risk in §8, not decided here.

---

## 3. Backend

**Existing APIs reused, unchanged:**
- `POST /api/auth/login` (`apps/api/src/routes/auth.ts:7`,
  `apps/api/src/controllers/auth.ts:13-31`) — called after the password
  is set, exactly as `AuthContext.tsx`'s `signIn()` already calls it
  after a normal sign-in. No modification needed; `requireAuth` already
  succeeds because the `StaffProfile` was created at invite time.
- `GET /api/auth/me` (`apps/api/src/controllers/auth.ts:54-58`) — used by
  `AuthContext.tsx`'s existing bootstrap effect, unchanged.

**Existing middleware reused, unchanged:**
- `requireAuth` (`apps/api/src/middlewares/requireAuth.ts`) — no change;
  it already handles "valid Supabase session but verify against our own
  `StaffProfile`" exactly as this flow needs.

**Existing service reused, unchanged:**
- `loadAuthContext()` (`apps/api/src/services/authContext.ts:22-59`) —
  no change.
- `recordAudit()` (`apps/api/src/services/auditService.ts`) — the
  existing `LOGIN` audit entry already fires from `login()`
  (`controllers/auth.ts:21-27`) when the new page calls
  `/api/auth/login` after password setup; no new audit path is required.

**Existing endpoints requiring a small parameter change (not a new
endpoint — an addition to an existing call):**
- `apps/api/src/controllers/users.ts:91` —
  `supabaseAdmin.auth.admin.inviteUserByEmail(input.email)` needs a
  `redirectTo` option added, pointing at the new frontend route.
- `apps/api/src/controllers/users.ts:290-293` —
  `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })`
  needs the same `redirectTo` option added.
- `apps/web/src/pages/login/LoginPage.tsx:76` —
  `supabase.auth.resetPasswordForEmail(trimmed)` needs a `redirectTo`
  option added, for the same reason (self-service reset should land on
  the same completion page).

**Missing endpoints: none identified.** Every step of the journey in §1
is served by an existing endpoint, an existing middleware, or a direct
Supabase client call from the frontend — consistent with the project's
own established pattern of "self-service auth actions talk to Supabase
directly; the backend is not involved" (already true for
`resetPasswordForEmail` today). No new Express route, controller, or
service is required by this plan.

---

## 4. Supabase Integration

Based on officially documented `@supabase/supabase-js` v2 / Supabase Auth
(GoTrue) behavior:

- **`inviteUserByEmail()`** (`supabaseAdmin.auth.admin.inviteUserByEmail`,
  already called in `controllers/users.ts:91`) creates the Supabase Auth
  user in an unconfirmed/no-password state and sends Supabase's "Invite"
  email template, containing a one-time link. An optional `redirectTo`
  in its options controls where that link sends the browser (must be
  present in the Supabase project's "Redirect URLs" allow-list — a
  dashboard setting, not code).
- **Access token / refresh token**: when the invite (or recovery) link is
  clicked, Supabase's redirect carries a one-time proof of the click.
  With the SDK's default configuration — `detectSessionInUrl: true`,
  which is the default and is not overridden anywhere in
  `apps/web/src/lib/supabase.ts` (confirmed by reading the file in full)
  — the client SDK automatically parses this on page load and calls
  Supabase to exchange it for a real `access_token`/`refresh_token` pair,
  establishing a session without any code on our side needing to do that
  exchange manually.
- **Whether this arrives as a URL hash fragment
  (`#access_token=...&refresh_token=...&type=invite`, the SDK's
  "implicit" flow) or as a `?code=...` query parameter requiring an
  explicit `exchangeCodeForSession(code)` call (the SDK's "PKCE" flow)
  depends on the `flowType` the Supabase client is configured with.**
  `createClient()` in `apps/web/src/lib/supabase.ts` does not set
  `flowType` explicitly, so it uses the SDK's default. **This must be
  confirmed against the actual Supabase project/SDK version before
  implementation** — it changes which of the two mechanisms the new
  page needs to handle, and guessing wrong would silently break the
  entire flow. This is the single most important fact to verify first in
  `03_IMPLEMENT.md`.
- **Password update**: once a session exists (regardless of which flow
  produced it), `supabase.auth.updateUser({ password })` is the correct,
  officially documented call to set the password for that
  now-authenticated user. This is a direct client-side Supabase call, the
  same pattern already used by `LoginPage.tsx`'s
  `resetPasswordForEmail()` — the backend is not involved.
- **Session creation**: no separate step is needed — the session already
  exists from the moment the invite/recovery link was clicked (that *is*
  the session-creation step). `updateUser({ password })` finalizes the
  credential on an already-live session; it does not create a new one.
- **Distinguishing invite vs. recovery**: Supabase's redirect includes a
  `type` parameter reflecting which email template was used (`invite`,
  `recovery`, etc.). For recovery links specifically, the SDK also emits
  a distinct `PASSWORD_RECOVERY` event via `supabase.auth.onAuthStateChange`
  (already subscribed to once, in `AuthContext.tsx:50-52`, though not
  currently special-cased for this event). Supabase's JS SDK has no
  equivalent distinct event for `invite`; the `type=invite` URL parameter
  itself is the reliable signal for that case. The new page should check
  for either signal rather than assuming only one applies.

---

## 5. Security

- **Token validation**: performed entirely by Supabase's GoTrue server,
  not by our own backend. Our backend never sees the invite/recovery
  token directly — it only ever sees the resulting, already-validated
  `access_token` when the new page later calls `POST /api/auth/login`,
  which goes through the existing, unchanged `requireAuth` verification
  (`supabaseAdmin.auth.getUser(token)`,
  `apps/api/src/middlewares/requireAuth.ts:31`).
- **Expired invite/recovery link**: Supabase redirects with an error
  encoded in the URL (documented pattern:
  `error=access_denied&error_code=otp_expired&error_description=...`)
  instead of establishing a session. The new page must detect this and
  show a friendly Arabic message plus a way forward — for an invite, the
  admin can trigger a fresh link via the existing
  `POST /api/users/:id/reset-password` (`resetUserPassword`,
  `apps/api/src/controllers/users.ts:276-308`), which already exists and
  requires no change beyond §3's `redirectTo` addition. **No new
  "resend invite" endpoint is required** — the existing admin
  password-reset endpoint already serves this purpose, since both invite
  and recovery links terminate in the same completion page.
- **Already-accepted / replayed invite**: Supabase one-time tokens are
  single-use by design; a second click on an already-consumed link
  produces the same error family as an expired link. This is inherent to
  Supabase's token design — no additional backend replay-protection
  layer is needed or possible to add, since our backend never holds the
  token.
- **Invalid/tampered link**: same error family, same handling — Supabase
  is the sole authority validating the token; there is nothing for our
  own code to additionally check.
- **Password policy**: enforced server-side by Supabase's own project
  settings (minimum length, character-class requirements — configured in
  the Supabase dashboard, not visible from this codebase). **The exact
  policy must be confirmed against the live project before writing any
  client-side copy that states specific rules.** The new page should
  surface whatever error `updateUser()` returns (translated to Arabic,
  same pattern as `LoginPage.tsx`'s `translateAuthError`) rather than
  hardcoding an assumed policy, and may additionally apply a conservative
  client-side minimum (e.g. non-empty, matches confirmation field) purely
  for immediate UX feedback.
- **Replay protection**: provided entirely by Supabase's one-time-token
  design (see "Already-accepted" above) — there is no separate replay
  window for our own backend to manage, since it is never in possession
  of the raw token.

---

## 6. Existing Code Reuse

Files that can be reused as-is (no change) or lightly extended, to avoid
duplication:

- `apps/web/src/lib/supabase.ts` — the existing `supabase` client
  instance; no new client instance needed. (Unrelated: this file also
  has two leftover debug `console.log` lines flagged in
  `01_ANALYSIS.md` §7 that should be removed whenever this file is next
  touched.)
- `apps/web/src/lib/api.ts` — `apiPost()` reused as-is to call
  `/api/auth/login` after the password is set.
- `apps/web/src/state/AuthContext.tsx` — `signIn`'s existing
  `/api/auth/login` + `setAuthContext` pattern is the template for what
  the new page does after `updateUser()` succeeds; the file itself may
  need a small, carefully-scoped change (see §2/§8), not a rewrite.
- `apps/web/src/pages/login/LoginPage.tsx` — direct template for the new
  page's structure: Arabic/RTL layout, show/hide password toggle,
  loading-state/duplicate-submit guard, and the `translateAuthError`
  friendly-message pattern (to be extended with this flow's new error
  cases, not replaced).
- `apps/web/src/components/ui/button.tsx` — reused as-is.
- `apps/api/src/controllers/users.ts` — `createUser()` and
  `resetUserPassword()` already do everything needed on the invite/reset
  side except pass `redirectTo`.
- `apps/api/src/controllers/auth.ts` — `login()` reused as-is.
- `apps/api/src/middlewares/requireAuth.ts` and
  `apps/api/src/services/authContext.ts` — reused as-is.
- `packages/shared/src/permissions.ts` — no change; this flow introduces
  no new permission key (setting one's own password during onboarding is
  not a permission-gated action).

---

## 7. Files Expected To Change

**Frontend**
- [ ] New: `apps/web/src/pages/accept-invite/AcceptInvitePage.tsx`
- [ ] `apps/web/src/App.tsx` — register the new public route
- [ ] `apps/web/src/state/AuthContext.tsx` — small change to correctly
      sequence bootstrap behavior around an invite/recovery-derived
      session (exact change deferred to implementation)
- [ ] `apps/web/src/pages/login/LoginPage.tsx` — add `redirectTo` to the
      existing `resetPasswordForEmail()` call
- [ ] `apps/web/src/lib/supabase.ts` — remove the two leftover debug
      `console.log` lines (unrelated cleanup, bundled since the file is
      already being touched — flagged in `01_ANALYSIS.md` §7)

**Backend**
- [ ] `apps/api/src/controllers/users.ts` — add `redirectTo` to the
      existing `inviteUserByEmail()` and `generateLink()` calls

**Shared**
- [ ] `packages/shared/src/schemas/auth.ts` — optional: a small
      `setPasswordSchema` for client-side form validation consistency
      (not tied to any new backend endpoint)

**Documentation**
- [ ] `docs/AI/FEATURES/FEATURE-001-IAM/02_PLAN.md` — this document
- [ ] `docs/AI/FEATURES/FEATURE-001-IAM/03_IMPLEMENT.md` — to be filled
      in as an execution checklist when implementation actually starts
      (out of scope for this planning pass)
- [ ] `docs/AI/PROJECT_MEMORY.md` — update once implemented, to remove
      this item from "Known gaps"

No database migration, no schema change, and no new API route are
expected — consistent with §3's conclusion that every missing piece is
served by existing endpoints plus two small parameter additions.

---

## 8. Risks

- **Flow-type ambiguity (highest-priority unknown).** Whether the
  Supabase client resolves invite/recovery links via hash-fragment
  implicit flow or `?code=` PKCE flow is a project/SDK configuration
  detail not visible from this codebase. Implementing against the wrong
  assumption would make the new page silently fail to detect the
  session. Must be confirmed first, empirically, against the real
  Supabase project — not assumed from documentation alone.
- **`redirectTo` must be allow-listed in the Supabase dashboard**
  ("Redirect URLs" under Authentication settings) or Supabase will
  ignore it and fall back to the project's default Site URL, silently
  sending users somewhere this app doesn't handle. This is a dashboard
  step outside this codebase that must happen alongside implementation.
- **Session-before-password-set could confuse the existing bootstrap
  logic.** `AuthContext.tsx`'s current bootstrap effect
  (lines 32-58) sees any live Supabase session as "logged in" and
  fetches `/api/auth/me`. Since an invite/recovery click already
  produces a real session, careless sequencing could let a user land on
  the Dashboard (via the existing `/api/auth/me` bootstrap) before ever
  setting a password, or could race the new page's own handling. This
  needs deliberate design during implementation, not just a new page
  dropped in isolation.
- **Password policy is an unconfirmed dashboard setting** — client-side
  copy or validation that assumes a specific policy (e.g. "at least 8
  characters") could contradict what Supabase actually enforces.
- **`StaffProfile` is created before the invite is ever accepted**
  (`controllers/users.ts:99-109` runs immediately after
  `inviteUserByEmail` succeeds). An invite that's never accepted leaves a
  `StaffProfile` with `isActive: true` and no record of whether the
  human ever gained access. This plan does not propose changing that
  behavior (it would be a business-logic change, out of scope here) but
  flags it as an open question worth raising separately.
- **No automated tests exist for any IAM path** (confirmed in
  `01_ANALYSIS.md` §8), so this feature inherits that gap — verification
  will be manual only unless test infrastructure is introduced
  separately.
- **Testing an actual expired link is hard without dashboard access** to
  shorten the OTP/link expiry window for a controlled test — see §9.

---

## 9. Verification Strategy

To be executed when this feature is implemented (this plan does not
execute any of it):

- **Happy path — invite**: an account with `employees.create` creates a
  new user via the existing Users screen, confirms the invite email
  arrives, clicks it, confirms landing on the new page, sets a password
  meeting Supabase's actual policy, confirms automatic sign-in
  (`POST /api/auth/login` succeeds), and confirms normal Dashboard access
  with the roles/permissions assigned at creation time.
- **Happy path — self-service reset**: from the Login page's existing
  "forgot password" action, confirm the email arrives, the link lands on
  the same new page, and setting a new password results in a normal,
  working login afterward.
- **Admin-triggered reset**: use the existing "Reset Password" action on
  the Users screen (`UsersPage.tsx`, calling
  `POST /api/users/:id/reset-password`) and confirm the same completion
  page handles it correctly.
- **Replayed link**: click the same invite or recovery link a second
  time; confirm a friendly Arabic error is shown, not a crash or a
  misleading success state.
- **Expired link**: confirm the friendly-error path (may require
  temporarily lowering the link expiry in the Supabase dashboard to test
  in a reasonable timeframe — noted as a constrained test in §8).
- **Regression**: confirm the existing email-or-phone login flow
  (`LoginPage.tsx`/`AuthContext.tsx`) is unaffected — this feature is
  additive (a new route + small parameter additions), and should not
  change behavior for users who already have a password set.
- **Standard gates**: `npm run build`, `npm run typecheck`, `npm run
  lint` across `apps/web` (and `apps/api` for the small controller
  change), per the project's existing verification convention.

---

## Planning completed

Yes.

## Files inspected

`docs/AI/MASTER_PROMPT.md`, `docs/AI/PROJECT_MEMORY.md`,
`docs/AI/FEATURES/FEATURE-001-IAM/README.md`,
`docs/AI/FEATURES/FEATURE-001-IAM/01_ANALYSIS.md` (all read fresh, in
order, before this plan was written), plus the underlying source files
`01_ANALYSIS.md` itself cites and this plan re-cites directly:
`apps/web/src/lib/supabase.ts`, `apps/web/src/lib/api.ts`,
`apps/web/src/state/AuthContext.tsx`, `apps/web/src/pages/login/LoginPage.tsx`,
`apps/web/src/App.tsx`, `apps/api/src/controllers/users.ts`,
`apps/api/src/controllers/auth.ts`, `apps/api/src/routes/auth.ts`,
`apps/api/src/middlewares/requireAuth.ts`,
`apps/api/src/services/authContext.ts`,
`apps/api/src/services/auditService.ts`, `packages/shared/src/permissions.ts`.

## Files expected to change

See §7 above — 5 frontend files (1 new), 1 backend file, optionally 1
shared file, plus documentation. No database migration, no new API
route.

## Risks identified

7 — see §8. The highest-priority one (Supabase flow-type ambiguity) must
be resolved empirically, first, before any other implementation work on
this feature begins.

## Ready for implementation (Yes/No)

**No.** This plan identifies one concrete unknown that must be confirmed
against the live Supabase project before implementation starts (§4/§8:
which auth flow type — implicit hash-fragment or PKCE `?code=` — the
project actually uses), plus one design decision that needs to be made
deliberately rather than improvised
(`AuthContext.tsx`'s bootstrap sequencing around an invite/recovery
session, §2/§8). Once those two points are confirmed/decided, this plan
is otherwise complete and implementation can proceed against §7's file
list.
