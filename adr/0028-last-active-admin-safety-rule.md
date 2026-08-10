# ADR 0028: Last-active-administrator safety rule

**Status:** Accepted

## Context

Explicit, mandatory safety requirement: the system must never allow the last
active Administrator to be deactivated, deleted, blocked, or stripped of
their administrator role — doing so would leave the system with nobody able
to manage staff accounts or roles at all, an unrecoverable lockout short of
direct database surgery.

Two roles carry administrative weight (ADR 0022): `SUPER_ADMIN` (the global
`*` wildcard) and `ADMIN` (`employees.*`, among other module wildcards —
critically, full create/edit/delete over `StaffProfile` and role assignment
within its branch). The requirement said "Administrator" without
disambiguating between the two. Excluding `SUPER_ADMIN` would miss the
scenario where the system loses its only role/permission manager; excluding
`ADMIN` would miss the literal, named role. Both are therefore treated as one
combined "Administrator" pool for this rule — losing every active holder of
either role is the lockout being prevented.

`StaffProfile` has no separate "Block" concept — `isActive: false` (set via
`updateUser`) is the only deactivation mechanism, and `deleteUser` is a soft
delete that also sets `isActive: false`. "Block" is therefore covered by the
same `isActive: false` path as "Inactive," not a fourth, separately-invented
field.

## Decision

`apps/api/src/services/adminSafety.ts` is the single place this decision is
made:

- `ADMIN_ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN']` — the combined pool.
- `wouldOrphanAdministrators(isCurrentlyActiveAdmin, willRemainActiveAdmin, otherActiveAdminCount)`
  — a pure, side-effect-free function holding the actual decision table, kept
  separate so it can be unit-tested without a database.
- `assertNotLastActiveAdmin(staffId, willRemainActiveAdmin)` — the thin
  DB-wiring wrapper: loads the staff member's current active/admin state,
  short-circuits if the change doesn't touch admin status, and only then
  counts other active administrators before calling the pure function.
  Throws `LastActiveAdminError` when the change would orphan the system.

Called from `apps/api/src/controllers/users.ts` before the mutation runs, in
all three places that can strip a staff member's active-administrator
status:

- `updateUser`, when `isActive` is being set to `false`.
- `deleteUser`, unconditionally (a soft delete always sets `isActive: false`).
- `setUserRoles`, when the new role set no longer includes `SUPER_ADMIN` or
  `ADMIN` for a currently-active administrator.

Each call site catches `LastActiveAdminError` and responds `409` with
`{ code: 'LAST_ACTIVE_ADMIN', message: 'You cannot deactivate the last
active administrator.' }` — the exact response specified by the requirement,
reused verbatim across all three operations rather than three separate
messages.

*(Superseded by the Extension section below: a rejected attempt now writes a
`SECURITY_REJECTION` audit entry — this rule is a deliberate departure from
the "rejected mutation, nothing to audit" precedent, not an omission.)*

## Consequences

- A branch can still end up with zero *local* admins if every `ADMIN` there
  deactivates while at least one `SUPER_ADMIN` remains active elsewhere —
  accepted, because a `SUPER_ADMIN` can always re-grant `ADMIN` to someone in
  that branch; the rule protects against total lockout, not against
  uneven administrative coverage per branch.
- Promoting a second person to Administrator before demoting the first is
  now the only way to ever change who administers the system — enforced by
  the API, not just a documented convention.
- The first automated test suite in the repository (`vitest`, scoped to
  `apps/api`) exists because of this rule. `wouldOrphanAdministrators` is
  unit-tested directly (mocked `prisma`, no live database); the reject path
  was additionally verified live against the real dev environment's sole
  administrator account (see `docs/AI/PROJECT_MEMORY.md`) — attempting to
  deactivate, delete, and de-role it in turn, each correctly rejected with
  `409`, with the account confirmed unchanged after each attempt.

## Extension: AdminSafetyService, Company Isolation, Security Audit, UI Protection

Approved as a direct follow-up, applying five further requirements to the
same rule (not a new decision — this section extends the Decision above).

1. **Single mandatory entry point, formalized.** The service module now
   exports `AdminSafetyService = { assertNotLastActiveAdmin }` — the name
   every future orphan-risk operation (Block, Archive, and whatever comes
   after) must call. `assertNotLastActiveAdmin` itself is no longer a bare
   named export; going through `AdminSafetyService` is not optional. The
   pure decision table (`wouldOrphanAdministrators`) and the role pool
   (`ADMIN_ROLE_NAMES`/`hasAdminRole`, now re-exported from
   `@cleopatra/shared` — see point 4) remain named exports since they're
   genuinely reusable primitives, not the guard itself.
2. **Company Isolation seam.** Today's "other active administrators" count
   is global (single-tenant). A private `otherActiveAdminScopeWhere(current)`
   function inside `adminSafety.ts` is the one place that will change when
   VISION.md's "Single Company → Multiple Companies" Scalability axis is
   built — it returns `{}` today and would return `{ companyId:
   current.companyId }` once a `Company` model exists. No controller
   computes or passes a scope; none will need to change when this seam is
   filled in.
3. **`SECURITY_REJECTION` audit entries.** `AdminSafetyService` itself
   (never the calling controller) records one `AuditLog` row —
   `entityType: 'StaffProfile'`, `action: 'SECURITY_REJECTION'`,
   `newValue: { reason: 'LAST_ACTIVE_ADMIN', operation }` — immediately
   before throwing `LastActiveAdminError`. Centralizing this inside the
   service (rather than in each controller's catch block) is what makes
   "never duplicate this logic" actually hold for audit logging too, not
   just for the headcount check. `operation` is one of `'DEACTIVATE' |
   'DELETE' | 'REMOVE_ADMIN_ROLE' | 'BLOCK' | 'ARCHIVE'` — the last two
   are reserved for operations that don't exist yet, so their audit shape
   is already correct when they're built.
4. **Frontend UI protection, not enforcement.** `ADMIN_ROLE_NAMES` moved
   to `@cleopatra/shared` (re-exported from `apps/api/src/services/
   adminSafety.ts` for backend call sites) specifically so
   `apps/web/src/lib/adminSafety.ts`'s `isLastActiveAdmin(user, allUsers)`
   uses the identical role pool, computed client-side from the already-
   loaded user list — not a second, independently-maintained list.
   `UsersPage.tsx` disables Deactivate, Delete, and any currently-checked
   admin-role checkbox for whichever user this evaluates true for. This is
   explicitly a UX convenience: the backend re-validates and remains the
   sole source of truth regardless of what the UI shows or disables.
5. **Error response, unchanged.** Still `409 { code: 'LAST_ACTIVE_ADMIN',
   message: 'You cannot deactivate the last active administrator.' }` for
   every operation this rule protects — never a different code or message
   depending on which operation triggered it.

See `docs/AI/VISION.md`'s Engineering Standards → Security section for the
standing rule this extension adds: **no future code may re-implement this
check; it must call `AdminSafetyService`.**

See ADR 0029 for the separate, database-layer Defense-in-Depth decision
(Row Level Security) — `AdminSafetyService` remains the sole place this
specific rule is decided; RLS does not and must not encode any part of it.
