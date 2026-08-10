# ADR 0029: Row Level Security as a Defense-in-Depth layer, never the authorization source

**Status:** Accepted

## Context

Supabase's linter flagged `rls_disabled_in_public`: every table in the `public`
schema had Row Level Security disabled. A live audit (not a theoretical
check) confirmed the actual exposure — using the `anon` key already embedded
in the deployed frontend bundle, a direct `GET` against Supabase's
auto-generated PostgREST API returned full rows from `StaffProfile`,
`AuditLog`, `RolePermission`, and `PartnerCommercialProfile`, completely
bypassing the Express API, `requireAuth`, and the entire RBAC model (ADR
0021/0022). Both `anon` and `authenticated` roles already held full
`SELECT/INSERT/UPDATE/DELETE` grants on every table (Supabase's default
schema-level grants) — RLS was the only thing that could have stopped this,
and it wasn't enabled anywhere.

The same audit confirmed the fix is safe: every table is backend-only (the
frontend's only Supabase calls are `.auth.*` — verified by grepping the
entire frontend, not assumed), and the roles the backend actually connects
as — `postgres` (Prisma's `DATABASE_URL`) and `service_role`
(`supabaseAdmin`) — both carry `rolbypassrls = true` in Postgres. Enabling
RLS anywhere cannot break the backend, regardless of what policies exist or
don't.

Two implementation questions remained, both decided here:

1. Rely on Postgres's implicit "RLS enabled + zero policies = deny all," or
   write an explicit policy?
2. Where does this leave the existing service-layer authorization (ADR
   0021/0022, `AdminSafetyService` per ADR 0028) — does RLS replace any of
   it?

## Decision

**Explicit deny policies, not implicit deny.** Every table gets:

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access"
  ON "<table>" FOR ALL TO anon, authenticated USING (false);
```

The same policy name, verbatim, on every table — not because Postgres
requires it, but because a security posture that has to be inferred from
the *absence* of policies is exactly the kind of thing that gets silently
reverted by a future well-meaning `CREATE POLICY "allow read" ... USING
(true)` added to fix an unrelated bug, with nobody noticing the table had
been implicitly deny-all the whole time. An explicit, identically-named
policy is self-documenting in `pg_policies` — a future engineer or auditor
sees *why* a table denies access, not just that it happens to.

**No grants were touched, and none needed to be.** `anon`/`authenticated`
keep their existing table grants; the deny policy alone is what blocks
them, regardless. Revoking grants was deliberately left alone — it would
duplicate what the policy already guarantees, and Supabase re-applies its
own default grants on schema changes in ways this project doesn't control,
so the policy is the more durable barrier of the two.

**RLS is Defense-in-Depth, not the authorization system.** ADR 0021/0022
already established that authorization is entirely the ERP Service Layer's
concern — `requirePermission()` middleware, `StaffProfile` → `UserRole` →
`Role` → `RolePermission` → `Permission`, and rule-specific services like
`AdminSafetyService` (ADR 0028). This ADR adds a second, independent
barrier at the database boundary; it does not move, replace, or duplicate
any of that decision-making into Postgres policies. Concretely:

- No RLS policy encodes a business rule (branch scoping, role checks,
  the last-active-admin rule) — every current policy is a flat `USING
  (false)` for the two roles that should never reach these tables at all.
- If a future caller ever legitimately needs narrower-than-deny-all direct
  database access (e.g. a Realtime subscription scoped to a user's own
  rows), that policy encodes *the same rule the service layer already
  enforces*, expressed a second time for the database boundary — it is
  never the first or only place the rule is decided. See VISION.md's
  Database Security section.
- **Why no frontend business access is ever allowed, restated as an
  architectural constant, not a current-implementation detail**: this
  project's entire authorization model — permission catalog, wildcard
  matching, audit logging, `AdminSafetyService`'s orphan-prevention rule —
  lives in Express and is only reachable through it. A frontend client
  that queried Postgres directly, even successfully authenticated as
  `authenticated`, would bypass every one of those checks; there is no
  version of "direct table access from the frontend" that doesn't mean
  "some subset of business rules stops applying." This is a permanent
  constraint on the architecture, not a gap waiting to be closed by a
  sufficiently clever RLS policy.

**Why backend authorization remains the primary security layer**: it is
the only layer that has ever had the full picture — `requirePermission`
already knows the caller's resolved permission set, active status, and
branch access before a query is even built; a Postgres RLS policy
evaluating `auth.uid()` against a row has none of that context unless it's
rebuilt as SQL, which means either duplicating the permission engine in
two languages (a direct violation of "never duplicate business logic") or
letting RLS drift from what the service layer actually enforces. Keeping
authorization in one place, in Express, is what lets the permission model
stay a single source of truth (ADR 0022) at all.

Migration is purely additive — `ENABLE ROW LEVEL SECURITY` and
`CREATE POLICY`, no `DROP`, no data change, fully reversible per table
(`DROP POLICY` + `DISABLE ROW LEVEL SECURITY`).

## Consequences

- Every table in `public` (37 application tables plus `_prisma_migrations`)
  now has RLS enabled with an identical, explicitly-named deny policy —
  confirmed live post-migration by re-running the same direct-PostgREST
  requests that originally exposed `StaffProfile` et al.; they now return
  empty results instead of data.
- The Express API, Prisma, and the `supabaseAdmin` service-role client are
  provably unaffected (`postgres`/`service_role` bypass RLS at the
  Postgres-role level, independent of any policy) — verified live, not
  just reasoned about.
- Any future table (a new Prisma model, a new migration) does **not**
  automatically inherit this protection — `ENABLE ROW LEVEL SECURITY` +
  the deny policy must be added explicitly for each new table, the same
  way a new business object needs its own permission catalog entries (ADR
  0022). This is a standing checklist item now recorded in VISION.md's
  Database Security section, not a one-time fix.
- If a genuine frontend-facing use of Supabase Storage or Realtime is
  built later, it does not get to skip this ADR's reasoning: Storage
  bucket policies and Realtime's own RLS-gated broadcast are a different,
  separately-designed surface from table access, evaluated against the
  same "Defense-in-Depth, never the source of truth" standard when they're
  actually built (see VISION.md's Database Security section).

See ADR 0030 for the underlying, mechanism-independent rule this ADR
defends in depth: business tables are never accessed directly by frontend
applications, regardless of client type, regardless of whether RLS exists
at all.
