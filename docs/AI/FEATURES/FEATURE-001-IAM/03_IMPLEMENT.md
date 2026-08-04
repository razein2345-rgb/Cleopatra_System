# FEATURE-001 — IAM — Implementation Checklist

> No code is written in this document. This is a checklist to track
> execution of `02_PLAN.md` only. Every item must map back to something the
> plan explicitly called for — do not check off work that expanded scope
> beyond the plan without updating `02_PLAN.md` first.

## Backend

- [ ] Changes match `02_PLAN.md` → API Changes exactly
- [ ] Every new/changed route registered behind `requireAuth`
- [ ] Every new/changed route behind the correct `requirePermission` key
- [ ] No permission key or role name hardcoded — read from the database
- [ ] Branch scoping enforced via `canAccessBranch()` where relevant
- [ ] Service layer contains validation, authorization, business logic,
      audit log, and error handling (per
      `docs/AI/HANDBOOK/02_DATABASE_RULES.md` → Services)

## Frontend

- [ ] Changes match `02_PLAN.md` → Frontend Changes exactly
- [ ] UI actions gated by `can()`/permission checks, understood as UX only
      — never trusted as the real authorization boundary
- [ ] No client-side-only check substitutes for a missing server check

## Database

- [ ] Changes match `02_PLAN.md` → Database Changes exactly
- [ ] Existing schema reused wherever possible — no duplicate tables
- [ ] Migration is forward-compatible; no column/table dropped or renamed
      silently
- [ ] Soft delete used instead of hard delete, unless explicitly planned
      otherwise

## Permissions

- [ ] New permission keys added to the shared catalog (not inline in a
      controller)
- [ ] Role-permission grants added via seed/migration data
- [ ] No role name or permission string duplicated in more than one place

## Validation

- [ ] Every new/changed endpoint validates input (Zod, shared schema)
- [ ] Every new/changed endpoint validates output shape
- [ ] Ownership/branch checks applied where the resource is branch-scoped

## Logging

- [ ] Relevant state changes are logged where the system already logs
      equivalent events (e.g. `morgan` request logging is unaffected)

## Audit

- [ ] Every Create produces an audit log entry
- [ ] Every Update produces an audit log entry
- [ ] Every Delete (soft or hard) produces an audit log entry
- [ ] Audit entries include actor, branch, entity type, entity id, action

## Testing

- [ ] Manual test of each new/changed flow performed against a real
      Supabase-backed dev environment
- [ ] Negative cases tested: missing token, expired token, wrong
      permission, wrong branch, inactive/deleted account

## Manual Verification

- [ ] `04_VERIFY.md` completed in full before this feature is marked done

---

# FEATURE-001.2 — Invite Acceptance & Password Setup — Implementation Record

> Executed against `02_PLAN.md`'s file list exactly — no redesign, no new
> architecture, no new API route. Checked items were actually verified in
> this session; unchecked items require a real invite email or dashboard
> access this session did not have.

## Backend

- [x] No new endpoint added — `POST /api/auth/login` and `GET /api/auth/me`
      reused unchanged, per `02_PLAN.md` §3.
- [x] `apps/api/src/controllers/users.ts` — `inviteUserByEmail()` and
      `generateLink({ type: 'recovery' })` now pass `redirectTo` (a new
      `ACCEPT_INVITE_REDIRECT_URL` constant built from the existing
      `env.CORS_ORIGIN`, no new env var).
- [x] No permission key or role name touched.
- [x] Branch scoping unaffected — no branch-scoped logic in this feature.

## Frontend

- [x] New page: `apps/web/src/pages/accept-invite/AcceptInvitePage.tsx`.
- [x] New public route `/accept-invite` registered in `apps/web/src/App.tsx`,
      outside `ProtectedRoute` (same level as `/login`).
- [x] `apps/web/src/state/AuthContext.tsx` — extracted the existing
      `/api/auth/login` + `setAuthContext` call into a shared
      `refreshAuthContext()`, reused by both `signIn()` and the new page
      (no duplicate logic).
- [x] `apps/web/src/pages/login/LoginPage.tsx` — `resetPasswordForEmail()`
      now passes `redirectTo` pointing at `/accept-invite`.
- [x] Leftover debug `console.log` lines removed from
      `apps/web/src/lib/supabase.ts` (flagged in `01_ANALYSIS.md` §7).

## Database

- [x] No schema change — confirmed by `02_PLAN.md` §7 and unchanged during
      implementation.

## Permissions

- [x] No new permission key — setting one's own password during onboarding
      is not permission-gated.

## Validation

- [x] Client-side: non-empty, minimum 8 characters, confirm-password match,
      checked before calling Supabase.
- [x] Authoritative validation is Supabase's own project password policy,
      surfaced via `updateUser()`'s returned error (mapped to Arabic).

## Logging

- [x] No new logging surface — no secrets or tokens logged anywhere in the
      new code (see Security section of the final report).

## Audit

- [x] Reuses `POST /api/auth/login`'s existing `LOGIN` audit entry
      (`apps/api/src/controllers/auth.ts`) — no separate audit path
      introduced or needed.

## Testing

- [x] Manual test: `/accept-invite` with no session and no URL params
      correctly shows the "no-context" state (verified in the Browser
      pane).
- [x] Regression: `/login` still renders and functions correctly after
      these changes (verified in the Browser pane).
- [ ] Real invite-link end-to-end test (admin creates a user, clicks the
      real email link, sets a password) — **not performed**; requires a
      real invite email to land in an inbox, outside what this session
      could trigger safely.
- [ ] Expired-link and already-used-link states — **not performed** against
      a real Supabase-issued link (would need a shortened OTP expiry in
      the Supabase dashboard, or a genuinely reused link, to trigger
      Supabase's real error response; flagged in `02_PLAN.md` §8/§9 as a
      constrained test even before implementation started).

## Manual Verification

- [ ] `04_VERIFY.md`'s FEATURE-001.2 section — partially complete; see
      that file for exactly what was and wasn't verified.
