# FEATURE-001 — Identity & Access Management (IAM)

## Feature Name

Identity & Access Management (IAM)

## Purpose

Provide authentication and database-driven authorization for every user of
Cleopatra System: who can sign in, who they are, what they are allowed to do,
and which branch(es) they may operate in.

## Business Goal

Ensure every action taken in the system is tied to an identifiable, active
staff member with an explicit, auditable set of permissions — no shared
logins, no hardcoded access rules, and no action that bypasses branch
scoping.

## Scope

- Authentication (Supabase Auth: email/password sign-in, session handling,
  remember-me, sign-out, forgot-password).
- StaffProfile: the application-level identity linked 1:1 to a Supabase Auth
  user.
- Role-Based Access Control: Role, Permission, RolePermission, UserRole —
  fully database-driven, nothing hardcoded in application code.
- Branch access model: a staff member's home branch plus explicit
  `UserBranchAccess` grants; Super Admin bypasses branch scoping entirely.
- Audit logging of authentication and identity/permission-management events.
- Frontend: login screen, auth context/session bootstrap, and management
  screens for Users, Roles, and Permissions.

## Out of Scope

- Any business module built on top of IAM (Orders, Quotations, Work Orders,
  Treasury, Inventory, Suppliers, Tenders, Reports).
- Pricing/calculation engine.
- Self-service sign-up (accounts are provisioned by an administrator via the
  Users screen, or via the one-time bootstrap path for the first account).
- Multi-factor authentication, SSO/OAuth providers, and phone-based OTP flows
  beyond what Supabase Auth provides natively.

## Dependencies

- Supabase Auth (authentication provider).
- Supabase Postgres via Prisma (StaffProfile, Role, Permission, UserRole,
  RolePermission, UserBranchAccess, Branch, AuditLog tables).
- `packages/shared` — permission-key catalog and Zod schemas shared between
  frontend and backend.
- `docs/AI/HANDBOOK/02_DATABASE_RULES.md` — the database is the single
  source of truth; roles/permissions are never hardcoded.

## Acceptance Criteria

- A user cannot access any protected API route without a valid Supabase
  session AND an active, non-deleted `StaffProfile` linked to that session.
- A user's available permissions are always computed from their assigned
  role(s) in the database — never from a client-supplied value, never from
  a hardcoded list in code.
- A user can only act within their accessible branch(es) unless they hold
  the Super Admin role.
- Every login, logout, and identity/permission-management action produces
  an audit log entry.
- The client never makes an authorization decision the server does not
  independently re-verify.

## Deliverables

- Prisma schema: `StaffProfile`, `Role`, `Permission`, `UserRole`,
  `RolePermission`, `UserBranchAccess`.
- Backend: `requireAuth` / `requirePermission` middleware, auth context
  loader, auth/users/roles/permissions/branches controllers and routes.
- Frontend: `AuthContext`, `ProtectedRoute`, login page, Users/Roles/
  Permissions management pages.
- Seed data: default roles and permission grants.
- Documentation: this feature folder, plus the relevant ADRs
  (0005, 0021–0026) and `ARCHITECTURE.md` / `API_CONVENTIONS.md` sections.

## Current Status

**Implemented, with confirmed gaps.** Core authentication (Supabase Auth)
and authorization (database-driven RBAC + branch access) were built and
committed as Phase 2 (`ab7ecb8`), and are enforced end-to-end on every
audited route. A full engineering audit (see `01_ANALYSIS.md`) found two
things that mean "implemented" is not the same as "complete":

- There is no frontend page to complete a Supabase invite or
  password-recovery flow — `createUser()` sends a real invite email today
  that has nowhere to land (`01_ANALYSIS.md` §8).
- There is no seed-time or self-service way to create the first
  `StaffProfile` in a fresh environment — it currently requires a manual,
  ad hoc script.

Additionally, three files are currently modified but **uncommitted** in
the working tree (a phone-or-email login field and its supporting
`AuthContext` change, plus two leftover debug `console.log` lines in
`apps/web/src/lib/supabase.ts` that must be removed before that work is
committed).

## Risks

- Any change to permission-key naming or role structure is a breaking
  change for every other feature that calls `requirePermission(...)`.
- Branch-access logic is easy to accidentally bypass if a new endpoint
  forgets to call `canAccessBranch()` — this must be checked on every new
  route that touches branch-scoped data.
- The bootstrap path for creating the very first `StaffProfile` (before any
  admin exists) is a manual, one-off operation, not a UI flow — this is a
  known gap, not a bug.
- `canAccessBranch()`'s Super Admin bypass is a string comparison against
  `Role.name` (`"SUPER_ADMIN"`); renaming that role is permitted today and
  would silently break the bypass with no error surfaced anywhere
  (`01_ANALYSIS.md` §9).
- Inviting a new user today produces an account that cannot complete
  sign-up, since no page exists to handle the invite link
  (`01_ANALYSIS.md` §8).

## Notes

- See `docs/AI/HANDBOOK/02_DATABASE_RULES.md` for the standing rule that
  roles and permissions must never be hardcoded and must always be inspected
  in the existing schema before being extended.
- See `adr/0021` through `adr/0026` for the specific design decisions made
  during IAM's implementation.
