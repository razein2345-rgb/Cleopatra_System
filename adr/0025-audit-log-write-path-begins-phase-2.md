# ADR 0025: Audit log write-path begins with Phase 2's auth events

**Status:** Accepted

## Context

ADR 0013 (Phase 1) created the `AuditLog` schema with no write-path, deferring "when do we actually write to this" to whichever phase first needed it. Phase 2's explicit requirement: every login, logout, password reset, user update, and permission change must create an audit log entry.

## Decision

`src/services/auditService.ts` exports `recordAudit()`, the first and — by convention — only function anywhere in the codebase that writes to `AuditLog`. It is called from: `POST /api/auth/login` (action `LOGIN`), `POST /api/auth/logout` (`LOGOUT`), `POST /api/users/:id/reset-password` (`PASSWORD_RESET`), and every mutating endpoint on Users, Roles, and Permissions (`CREATE`/`UPDATE`/`DELETE`). The `AuditAction` enum gained `LOGIN`, `LOGOUT`, and `PASSWORD_RESET` values this phase (previously only `CREATE`/`UPDATE`/`DELETE`/`APPROVE`/`STATUS_CHANGE` existed, unused).

## Consequences

- Every future phase that mutates data follows the same pattern established here: call `recordAudit()` at the point of mutation, inside the same logical operation, rather than trying to reconstruct history later from application logs.
- `recordAudit()` deliberately never throws in a way that would roll back the primary operation it's documenting — an audit-write failure is logged but does not currently block e.g. a successful login from completing. This is a pragmatic default for Phase 2; a stricter "audit or fail the whole operation" requirement for specific high-stakes actions (e.g. permission changes) can be introduced explicitly later if needed, rather than assumed now.
- Audit entries for authentication events (`LOGIN`/`LOGOUT`) use the acting user's own `staffId` as both `entityId` and `performedById` — there is no separate "session" entity being audited, just the `StaffProfile` the login/logout happened against.
