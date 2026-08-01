# ADR 0007: Soft delete for business entities

**Status:** Accepted

## Context

Explicit requirement: business records must never be permanently destroyed by a normal delete action — an invoice, customer, or supplier record has audit/financial significance that outlives a user's decision to "remove" it. Legacy has no such protection (LEGACY_ANALYSIS.md §9): deletion is unconditional and permanent.

## Decision

Every independently-addressable business entity (`Branch`, `StaffProfile`, `Customer`, `Supplier`, `Tender`, `Order`, `Quotation`, `WorkOrder`, `TreasuryEntry`, `ReadyProduct`, `Service`, `SheetType`, `SizeFamily`, `InventoryItem`, `Attachment`) carries three fields: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedBy String? @db.Uuid`. A `DELETE` endpoint on these sets these fields rather than issuing a SQL `DELETE`.

Plain child/line-item records with no independent lifecycle — `OrderItem`, `QuotationItem`, `Payment`, `SupplierPurchase`, `SupplierPayment`, `SizeFamilyEntry`, `StockLevel`, `StockMovement` — are **excluded** and hard-deleted along with their parent, or (for `SizeFamilyEntry`) individually hard-deleted as a plain line-item edit. Append-only log tables (`AuditLog`, `DocumentSequence`) are also excluded — soft-deleting a log entry would defeat its purpose.

`deletedBy` is stored as a bare UUID value, not a formal Prisma relation to `StaffProfile` — a deliberate simplification to avoid ~15 duplicate named relations cluttering the `StaffProfile` model.

## Consequences

- Every read query on a soft-deletable model must filter `isDeleted: false` explicitly — Phase 1 creates the columns but no ORM-level middleware auto-filters them. This is a recurring responsibility for every controller, called out again per-phase as each one is built.
- "Restoring" a soft-deleted record is a simple update (`isDeleted: false`), not a data-recovery exercise — a real operational benefit for an ERP where "I didn't mean to delete that customer" is a predictable support request.
- Unique constraints (e.g. `Branch.code`, `SizeFamily.key`) apply globally, including to soft-deleted rows — a soft-deleted `Branch` with code `"MAIN"` would block creating a new branch with the same code. No current code path exercises this edge case; it's a known sharp edge to handle explicitly (e.g. a partial unique index excluding `isDeleted: true` rows) if it ever becomes a real scenario.
