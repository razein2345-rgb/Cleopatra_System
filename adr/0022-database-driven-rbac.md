# ADR 0022: True database-driven RBAC — roles and permissions, nothing hardcoded

**Status:** Accepted

## Context

Explicit requirement: implement true Role-Based Access Control with default roles (Super Admin, Admin, Sales, Cashier, Production Manager, Designer, Printing Operator, Viewer) and granular permissions (`customers.view`, `orders.*`, etc.) — with permissions stored in the database, not hardcoded. Legacy has no authorization model at all beyond an unused `role` field (LEGACY_ANALYSIS §9).

## Decision

Four tables model RBAC relationally: `Role` (the 8 seeded defaults plus any custom roles, `isSystem` protecting the defaults from deletion), `Permission` (the key catalog, `<module>.<action>` plus `<module>.*` and `*` wildcards, `isSystem` protecting keys real code checks against), `UserRole` (many-to-many, a staff member can hold multiple roles), `RolePermission` (many-to-many, a role's granted keys).

`requirePermission(key)` middleware — the only place in the codebase that makes an authorization decision — always queries `req.auth.permissions`, itself populated by a database query in `requireAuth` (`loadAuthContext()`). There is no `if (role === 'ADMIN')` anywhere in the codebase, and there must never be one added: any new permission-gated action gets a `Permission` row and a `RolePermission` grant, not a code branch.

Wildcard matching (`hasPermission()`, `packages/shared/src/permissions.ts`) treats `module.*` as satisfying any `module.action` request, and `*` (granted only to `SUPER_ADMIN` in the seed) as satisfying everything — this lets a role be granted coarse ("all of orders") or fine ("just view orders") without different code paths for each.

The seed script populates default role→permission grants as a **starting point**, not a fixed mapping — every grant is editable afterward through the Role management screens (`PUT /api/roles/:id/permissions`), and the seed is never re-applied over existing data (each `upsert` is a no-op if the row already exists).

## Consequences

- Adding a new business module later (e.g. Orders in Phase 6) means adding permission catalog entries (`orders.view`, `orders.create`, …) and deciding which default roles get them — a data change, not a code change to any authorization logic.
- An administrator can invent an entirely new role (e.g. "Regional Manager") with an arbitrary permission set through the UI alone, with no deployment required.
- This is more moving parts than a simple `role` enum field (which is what Phase 1's schema originally had, before this ADR) — a deliberate trade-off, since the explicit requirement was for real RBAC, not a role label.
- `Permission.isSystem` and `Role.isSystem` exist specifically to prevent an admin from deleting a permission or role that a live `requirePermission()` call in code depends on, which would otherwise silently lock everyone out of that action with no obvious cause.
