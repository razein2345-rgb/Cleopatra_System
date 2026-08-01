# ADR 0013: Audit log schema reserved ahead of implementation

**Status:** Accepted

## Context

Legacy has no audit trail anywhere — settings/price changes, order edits, and employee password changes are silently overwritten with no record of who changed what, when (LEGACY_ANALYSIS.md §9). Explicit requirement: a complete audit log system covering every create, update, delete, approval, and status change, recording user, timestamp, action, entity, previous value, and new value — with the schema designed now, implementation allowed to happen in later phases.

## Decision

An `AuditLog` table exists now: `entityType` (a plain string, e.g. `"Order"`), `entityId`, `action` (`CREATE | UPDATE | DELETE | APPROVE | STATUS_CHANGE`), `performedById` (nullable — some future actions may be system-initiated), `branchId` (nullable), `previousValue`/`newValue` (JSON), `createdAt`. `entityType`/`entityId` is a generic reference rather than a formal foreign key, since a proper relation would require a separate FK column (or relation) per model it might reference — impractical for a table meant to log across all 20+ models.

No middleware, service hook, or route writes to this table yet.

## Consequences

- Whichever phase first needs audit logging (order status changes, quotation approval, treasury entries, etc.) can start writing to an already-correct table rather than designing the schema under time pressure alongside that feature.
- Because `entityType`/`entityId` isn't a real foreign key, referential integrity for audit rows is not enforced by the database — a deliberate trade-off; audit logs are additive, append-only records, and a dangling reference to a hard-deleted row (which shouldn't happen anyway, given ADR 0007's soft-delete policy) is an acceptable risk here that would not be acceptable for a real business relation.
- The specific set of actions that require an audit entry (every field update? just status changes? just financially significant ones?) is not decided by this ADR — that's a judgment call for whichever phase implements the write-path, informed by what's actually useful to a business owner reviewing the log, not a mechanical "log everything" rule.
