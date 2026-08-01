# ADR 0006: UUID primary keys for every entity

**Status:** Accepted

## Context

Explicit requirement: "Every database entity must use UUID as the primary key." Beyond satisfying that requirement directly, sequential integer IDs leak information (row counts, creation order) and complicate merging data across environments or, eventually, across branches/tenants.

## Decision

Every Prisma model uses `id String @id @default(uuid()) @db.Uuid`. The UUID is generated **client-side by Prisma** (not via a Postgres `gen_random_uuid()` default), so it doesn't depend on a specific Postgres extension being enabled on a given Supabase project — a portability choice over a marginal performance difference.

Human-facing sequential identifiers (invoice numbers, quotation numbers, work order numbers) are a **separate concept**, layered on top via `DocumentSequence` — see ADR 0008. UUIDs are the internal/relational key; sequential numbers are what a human reads on a printed document.

## Consequences

- Every foreign key column is `String @db.Uuid`, consistently, across all 20+ models — no model uses an integer ID, so there's no special-casing needed anywhere that joins across tables.
- IDs are safe to expose in URLs/API responses without revealing row counts or creation order.
- Slightly larger index size than integer keys — an accepted, standard trade-off at this system's scale.
