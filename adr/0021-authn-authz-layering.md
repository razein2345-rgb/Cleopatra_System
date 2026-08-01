# ADR 0021: Supabase Auth (authentication) layered under custom RBAC (authorization)

**Status:** Accepted

## Context

ADR 0005 committed to Supabase Auth for authentication. Phase 2's requirements go further: full RBAC with configurable roles, granular per-module permissions stored in the database, branch-scoped access, and a complete audit trail — none of which Supabase Auth provides or is designed to provide (its role/claims model is metadata on the auth user, not a relational permissions system). The question this ADR resolves: does "use Supabase Auth" mean building authorization inside Supabase's user metadata, or does authorization live entirely in this system's own database?

## Decision

Two layers, cleanly separated, each answering a different question:

- **Authentication ("who is this?")** stays exactly as ADR 0005 describes — Supabase Auth owns credentials, password hashing, sessions, and JWT issuance in full. This system never stores or sees a password at any point, including for the new admin-triggered password reset (which uses the Supabase Admin API server-side, not a custom implementation).
- **Authorization ("what can they do here?")** is entirely this system's own concern, modeled relationally (`StaffProfile` → `UserRole` → `Role` → `RolePermission` → `Permission`, see ADR 0022) and stored in this system's Postgres database, with zero dependency on Supabase's role/claims features.

The only link between the two layers is `StaffProfile.supabaseUserId` — a foreign key in name only (Prisma can't model a cross-schema FK into Supabase's `auth.users` table without the multi-schema preview feature, which this project doesn't use), resolved at request time by `requireAuth` middleware.

## Consequences

- Supabase could be swapped for a different auth provider in principle without touching the RBAC schema at all — only `requireAuth`'s token-verification step and `StaffProfile.supabaseUserId`'s meaning would need to change.
- A valid Supabase session is necessary but not sufficient to use the API: `requireAuth` also requires a matching, active `StaffProfile` to exist, and rejects with `403` otherwise (see ADR 0022, API_CONVENTIONS.md).
- Every authorization decision is auditable and reportable via normal SQL queries against this system's own tables — "which roles have access to treasury" is a `SELECT`, not a support ticket to whoever manages the auth provider's dashboard.
