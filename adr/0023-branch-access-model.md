# ADR 0023: Branch access model — home branch + explicit grants + Super Admin bypass

**Status:** Accepted

## Context

Explicit requirement: every user belongs to a branch; Super Admin may access all branches; other users can only access their own branch unless explicitly permitted. ADR 0009 (Phase 1) already made `branchId` required on every branch-scoped table but built no access-control logic on top of it — that was explicitly deferred to whichever phase first needed real branch-aware authorization. Phase 2 is that phase.

## Decision

`StaffProfile.branchId` is a user's home branch (required, exactly one). `UserBranchAccess` is a many-to-many join granting **explicit, additional** branch access beyond the home branch — e.g. a manager who covers two locations. `canAccessBranch(user, branchId)` (`src/services/authContext.ts`) is the single function that answers "may this user touch this branch's data": it returns `true` unconditionally for anyone holding the `SUPER_ADMIN` role, and otherwise checks the user's home branch plus their `UserBranchAccess` grants.

This is applied today to the one branch-scoped resource that exists (`StaffProfile` itself, via the Users list/detail/update endpoints) and is the pattern every future branch-scoped resource (Orders, Treasury, Suppliers, …) reuses rather than reinventing.

## Consequences

- `canAccessBranch()` is a plain function call inside a controller, not a generic Express middleware — because the branch to check is usually a property of the resource being accessed (e.g. "the target user's branch"), not a simple route parameter, so a one-size-fits-all middleware would need awkward per-route configuration anyway.
- Super Admin's bypass is a role-name check (`roleNames.includes('SUPER_ADMIN')`), not a `UserBranchAccess` row per branch — consistent with ADR 0022's wildcard-permission approach (a Super Admin is also granted the global `*` permission rather than every individual permission key).
- A user's `accessibleBranchIds` (home + grants) is computed once per request inside `loadAuthContext()` and attached to `req.auth`, so branch-scoped controllers never need an extra database round-trip to answer "can this user see this branch."
