# ADR 0005: Supabase Auth for authentication

**Status:** Accepted

## Context

The legacy system's "authentication" is a plaintext password list compared client-side in the browser, with the full employee list (passwords included) loaded into the page (LEGACY_ANALYSIS.md §9). This is explicitly not carried forward. The project already uses Supabase for Postgres hosting (ADR 0004), and Supabase bundles an Auth service.

## Decision

Use **Supabase Auth** for all authentication. `apps/web` calls the Supabase client SDK directly for sign-in; `apps/api` never sees or stores a password, and verifies incoming requests by validating the bearer JWT via `supabase.auth.getUser(token)` using a service-role Supabase client.

A `StaffProfile` table links a Supabase Auth user (`supabaseUserId`) to this system's own staff concept (name, role, branch) — Supabase Auth owns credentials; this system owns everything else about a staff member.

## Consequences

- Legacy's plaintext employee passwords **cannot and will not** be migrated as data — this is a deliberate security improvement, not a like-for-like port (see MIGRATION_PLAN.md Phase 2). Each staff member needs a fresh invite/reset once Phase 2 ships.
- Role-based authorization (`ADMIN`/`STAFF`) is modeled on `StaffProfile.role`, not in Supabase Auth's own metadata — keeps role logic entirely within this system's own database and Prisma queries.
- The API has zero password-handling code of its own to secure or audit — that surface is entirely Supabase's responsibility.
