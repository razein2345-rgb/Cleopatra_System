# External Dependency: Supabase Supavisor pooler-layer stalls (upstream issue #49991)

**This is not a normal "known issue" entry** — it documents a dependency on
a bug in infrastructure this project does not control, so that if the same
symptoms return after the 2026-09-22 fix below, nobody assumes "we're back
to the same bug we already fixed" without first checking whether the
underlying upstream issue is still open.

## What was observed here (2026-09-22)

During live browser verification of the Cutover screens, `Connection
terminated unexpectedly` (a `node-postgres`/`@prisma/adapter-pg` error)
fired repeatedly — on login, on `/orders/new`'s initial load, and once
mid-save — despite the `keepAlive`/`idleTimeoutMillis` fix already applied
in `apps/api/src/lib/prisma.ts` (commit `815fc58`). Investigation found:

- A direct `pg_stat_activity` check during the incident showed only 18 of
  60 available connections in use — ruling out pool/connection exhaustion
  on our side.
- Every failure hung for a fixed, repeating duration (~10s, ~20s, or ~30s
  — matching this project's own configured `connectionTimeoutMillis`/
  `idleTimeoutMillis` values) before erroring, rather than failing
  instantly — a "the pooler layer itself is slow/stuck to respond" shape,
  not "the connection was refused outright."
- The API process itself never restarted during the session (confirmed via
  the server's own startup log, which printed exactly once) — ruling out
  `tsx watch`/HMR cold-starts as the cause.

## The upstream issue this matches

**[supabase/supabase#49991](https://github.com/supabase/supabase/issues/49991)**
— "Both Supavisor poolers intermittently take 12–93 s to accept a
connection while PostgREST against the same database stays at 0.35 s
median — so Postgres is healthy and the pooler layer is not." This is
Supabase's own connection pooler (the thing sitting between this app and
the actual Postgres instance on the `DATABASE_URL`, port 6543), reported
by other users as intermittently stalling for exactly the kind of
multi-second-to-tens-of-seconds duration observed here, while the
database itself and even Supabase's own PostgREST layer (which bypasses
Supavisor) stay fast. This is external, third-party infrastructure —
nothing in this codebase's Prisma config, connection pool settings, or
application logic can fix a stall inside Supavisor itself.

## Why this matters for future debugging

If `Connection terminated unexpectedly` (or its downstream symptoms — a
spurious 401, a frontend crash) resurfaces after the 2026-09-22
idempotency/error-boundary fix (see `KNOWN_ISSUES.md`'s entry on this),
**do not assume it's a regression of the same bug this fix targeted.**
That fix protects the *consequences* of a stall (duplicate submissions,
silent UI death) — it cannot and does not fix the stall itself, because
the stall's root cause lives inside Supavisor, not this codebase. Before
re-investigating this project's own code:

1. Check whether [supabase/supabase#49991](https://github.com/supabase/supabase/issues/49991)
   (or a successor issue, if Supabase closed it and something similar was
   opened) is still open/unresolved.
2. Re-run the same `pg_stat_activity` connection-count check used here —
   if it's still well under `max_connections`, the pooler-layer theory
   still holds and this is very likely the same external dependency, not
   a new bug in this project.
3. Check whether Supabase's status page or support reports anything for
   the project's specific region (`aws-0-eu-west-1`).

## What would actually resolve this (not ours to build)

Nothing on our end resolves the stall itself. Options if it keeps causing
real operational pain: (a) escalate to Supabase support referencing
`#49991` directly, (b) evaluate moving off the shared Supavisor
transaction-mode pooler to a dedicated/direct connection tier if Supabase
offers one on the current plan, (c) keep the mitigations in place (frontend
never treats a 5xx/timeout as a 401; idempotency keys survive a reload;
an error boundary keeps a stall from blanking the whole page) since those
are the only parts actually within this project's control.
