# Project Memory

> This file represents the current project state, per
> `docs/AI/MASTER_PROMPT.md`. It is updated whenever an inspection finds the
> real project state differs from what's written here. Last updated during
> the FEATURE-001-IAM engineering audit.

## Stack

- Frontend: React + Vite + TypeScript, Tailwind, shadcn/ui (`apps/web`).
- Backend: Express 5 + TypeScript, running as a traditional
  `app.listen()` process (`apps/api/src/index.ts`), not a serverless
  function.
- Database: Supabase Postgres via Prisma 7 (custom `prisma-client`
  generator, driver adapter `@prisma/adapter-pg`).
- Auth: Supabase Auth (authentication) layered under a custom
  database-driven RBAC (authorization) — see ADR 0021.
- Shared code: `packages/shared` — Zod schemas and the permission-key
  catalog, consumed by both `apps/web` and `apps/api`.
- Monorepo: npm workspaces (`apps/*`, `packages/*`).

## Migration status

This is a migration from a single-file legacy Artifact
(`legacy/cleopatra_press_system.html`, never modified — treated as
immutable source of truth for calculations/workflows) to this monorepo.
Phases completed and committed:

- Phase 1 — database foundations, settings/reference-data CRUD
  (`f25f2d5`, `5514a70`).
- Phase 1.6 — legacy function-to-module mapping (`28318bf`).
- Phase 1.7 — development standards docs + ADR folder (`22c3426`).
- Phase 2 — Identity & Access Management (`ab7ecb8`): Supabase Auth,
  database-driven RBAC (8 seeded roles), branch access model, audit
  logging, Users/Roles/Permissions management UI.
- Two post-Phase-2 build fixes: monorepo build self-containment for
  Vercel (`19adbd5`), and a Helmet/TypeScript `NodeNext` import fix
  (`14b06e8`).

Business modules (Customers, Orders, Quotations, Work Orders, Treasury,
Inventory, Suppliers, Tenders, Reports, and the pricing/calculation
engine) have not been started yet.

## Known gaps (as of the FEATURE-001-IAM audit; updated after FEATURE-001.2)

- ~~No frontend route exists to complete a Supabase invite or
  password-recovery flow~~ — **closed by FEATURE-001.2, and field-verified
  against a real Supabase-issued invite link** (genuine
  `generateLink`/`inviteUserByEmail`-equivalent token, a disposable test
  `StaffProfile`, real callback, real `otp_expired` error on reuse — see
  `docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md`). Confirmed working:
  callback detection (both implicit and PKCE code paths), the `expired`/
  `no-context` error states, and — critically — that the session Supabase
  establishes at invite-click time already flows correctly through
  `requireAuth` → `/api/auth/me` → RBAC → branch-scoped nav filtering.
  **Not verified**: the literal "type a password and submit" action and
  the resulting `success` state (this session does not type passwords
  into any form field, even for disposable test accounts) — recommend a
  human complete that one click to close the loop.
- Two **pre-existing** (not caused by FEATURE-001.2) issues were found
  during this field verification, neither fixed (out of that task's
  scope):
  - `apps/api/src/services/userService.ts`'s `mapStaffToUser()` omits the
    user's home branch from the `accessibleBranchIds` it returns to the
    frontend (only includes explicit `UserBranchAccess` grants) — unlike
    `authContext.ts`'s `loadAuthContext()`, which correctly includes both.
    Real authorization is unaffected (`canAccessBranch()` uses the
    correct source), but any UI trusting this DTO field would
    undercount accessible branches.
  - `apps/web/src/state/AuthContext.tsx`'s `signOut()` is fire-and-forget;
    navigating away immediately after clicking "Sign out" can outrace its
    async cleanup, leaving a stale Supabase session in `localStorage`.
    Reproduced directly during this verification.
  - **Update**: both issues have fixes implemented under
    FEATURE-001.4 (`docs/AI/FEATURES/FEATURE-001-IAM/FEATURE-001.4/`),
    each in its own separate worktree/branch
    (`claude/musing-ardinghelli-442f94` for the `signOut()` fix,
    `claude/silly-goldstine-315a52` for the `accessibleBranchIds` fix).
    Both independently pass build/typecheck/lint. **Not yet merged to
    `main`, not yet live-retested** — see FEATURE-001.4's `04_VERIFY.md`
    for exact status. The `signOut()` fix also introduced the
    architectural decision recorded below.
- No seed step or self-service path creates the first `StaffProfile`.
  `apps/api/prisma/seed.ts` never touches `StaffProfile`. The first
  account in this environment was created via a one-off manual script,
  not a repeatable setup step.
- Three files are currently modified but uncommitted in the working tree:
  `apps/web/src/lib/supabase.ts` (contains two leftover debug
  `console.log` lines that must be removed before committing),
  `apps/web/src/pages/login/LoginPage.tsx`, and
  `apps/web/src/state/AuthContext.tsx` (a working phone-or-email login
  field).
- `apps/web/apps/api/...` is a stray, empty, untracked directory tree
  (no files, just nested folders) sitting inside `apps/web/` — harmless,
  never committed (git doesn't track empty directories), but unexplained
  clutter worth removing eventually.
- No automated tests exist yet for any part of the system.

## Architectural decisions

### Authentication cleanup must never depend on network requests

**Decision**: Authentication cleanup must never depend on network
requests.

**Reason**: Authentication cleanup is security-critical. Audit logging is
best-effort and must not block local session cleanup.

**Implementation**: Local Supabase sign-out happens immediately. Audit
logging uses a best-effort keepalive request.

Concretely (`apps/web/src/state/AuthContext.tsx`'s `signOut()`, fixed
under FEATURE-001.4): the access token is captured first, then
`supabase.auth.signOut({ scope: 'local' })` clears the local session with
no awaited network call — this cannot be interrupted by navigation the
way an awaited `fetch` can. Only afterward is the `LOGOUT` audit entry
sent, via `apiPostBeacon()` (`apps/web/src/lib/api.ts`), a
`fetch(..., { keepalive: true })` call that isn't awaited and is allowed
to outlive the page if the user navigates away — the browser platform's
standard mechanism for exactly this "must survive unload" requirement.

This reverses the previous ordering (which awaited the backend logout
call *before* clearing the local session, specifically so the request
would still have a valid token) without losing the audit trail: the
token remains valid for the beacon request even after local `signOut()`
runs, because `scope: 'local'` only removes the browser's copy — it
doesn't revoke the token server-side.

**Applies to**: any future auth-adjacent cleanup work (e.g. session
invalidation on account deactivation, forced logout) should follow the
same shape — the user-facing state change must complete with no network
dependency; anything that needs the backend (audit, revocation) is
best-effort and fired after, not gating.

Background: found and fixed as part of FEATURE-001.4
(`docs/AI/FEATURES/FEATURE-001-IAM/FEATURE-001.4/`), itself triggered by
a real bug found during FEATURE-001.2's field verification (a stale
session surviving a sign-out interrupted by navigation).

## Environment notes

- Windows/PowerShell dev environment; Node and npm are not reliably on
  `PATH` in fresh shells — prefix commands with the Node install
  directory (`C:\Program Files\nodejs`) when a command isn't found.
- Dev servers: API on port 4000 (`npm run dev --workspace=apps/api`), web
  on port 5173 (`npm run dev --workspace=apps/web`). `.claude/launch.json`
  has both configured for the Browser-pane preview tool.
- Real Supabase project credentials live in `apps/api/.env` /
  `apps/web/.env` (gitignored) — never echoed in chat, never asked for
  again once confirmed present.

## Documentation structure

- `docs/AI/HANDBOOK/` — engineering rules. Only
  `02_DATABASE_RULES.md` currently has content; all other numbered
  handbook files are empty scaffolding.
- `docs/AI/FEATURES/FEATURE-00N-<name>/` — per-feature
  README/analysis/plan/implement/verify docs. `FEATURE-001-IAM` is the
  first, created retroactively for the already-implemented IAM feature.
- Root-level `ARCHITECTURE.md`, `API_CONVENTIONS.md`, `CODING_STANDARDS.md`,
  `CONTRIBUTING.md`, `MIGRATION_PLAN.md`, `LEGACY_ANALYSIS.md`,
  `LEGACY_MAPPING.md`, and `adr/` (27 ADRs) predate the `docs/AI/`
  structure and remain the authoritative source for architecture/decision
  history — `docs/AI/` does not replace them.
