# ADR 0007: Soft delete for business entities

**Status:** Accepted

## Context

Explicit requirement: business records must never be permanently destroyed by a normal delete action — an invoice, customer, or supplier record has audit/financial significance that outlives a user's decision to "remove" it. Legacy has no such protection (LEGACY_ANALYSIS.md §9): deletion is unconditional and permanent.

## Decision

Every independently-addressable business entity (`Branch`, `StaffProfile`, `Customer`, `Supplier`, `Tender`, `Order`, `Quotation`, `WorkOrder`, `TreasuryEntry`, `ReadyProduct`, `Service`, `SheetType`, `SizeFamily`, `InventoryItem`, `Attachment`, `BusinessPartner`, `ContactPerson`, `PartnerAddress`, `PartnerCategory`, `PartnerTag`, `PartnerNote`) carries three fields: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedBy String? @db.Uuid`. A `DELETE` endpoint on these sets these fields rather than issuing a SQL `DELETE`.

`ContactPerson`, `PartnerAddress` (FEATURE-002 M2/M3), and `PartnerCategory`/`PartnerTag` (M4) additionally each carry a separate `isActive Boolean @default(true)` business toggle, deliberately independent of `isDeleted`: `isActive` is a reversible, user-facing "currently in use" flag (e.g. a contact who left the company, an address no longer valid, a retired category), while `isDeleted` is the soft-delete lifecycle flag from this ADR. The two are never conflated — a row can be inactive-but-not-deleted (still listed, just flagged) or deleted (excluded from listings entirely, `isActive` no longer meaningful). Any future entity that needs both a soft-delete lifecycle and a separate business-toggle should follow this same two-flag split rather than overloading one flag for both meanings. **`PartnerNote` (M5) is the first counter-example on purpose**: it has no `isActive`-equivalent toggle at all — a note is either present (`isDeleted: false`) or soft-deleted; "pinned" (`isPinned`) is an orthogonal display-priority flag, not a business-toggle in this sense, and does not affect whether a note is listed.

Plain child/line-item records with no independent lifecycle — `OrderItem`, `QuotationItem`, `Payment`, `SupplierPurchase`, `SupplierPayment`, `SizeFamilyEntry`, `StockLevel`, `StockMovement`, and (FEATURE-002 M6) `PartnerCommercialProfile` — are **excluded** and hard-deleted along with their parent, or (for `SizeFamilyEntry`) individually hard-deleted as a plain line-item edit. Append-only log tables (`AuditLog`, `DocumentSequence`) are also excluded — soft-deleting a log entry would defeat its purpose.

`PartnerCommercialProfile` is included in that exclusion deliberately, not by oversight: unlike `ContactPerson`/`PartnerAddress`/`PartnerNote` (a list of many rows per partner, each independently addressable), it is a one-to-zero-or-one *detail record* of `BusinessPartner` — there is nothing to independently "delete" beyond clearing its fields via an update, and the correct soft-delete unit is the owning `BusinessPartner` itself. `onDelete: Cascade` on its FK handles the (app-never-exercises-this, since partners are always soft-deleted) hard-delete case at the database level.

`deletedBy` is stored as a bare UUID value, not a formal Prisma relation to `StaffProfile` — a deliberate simplification to avoid ~15 duplicate named relations cluttering the `StaffProfile` model.

## Consequences

- Every read query on a soft-deletable model must filter `isDeleted: false` explicitly — Phase 1 creates the columns but no ORM-level middleware auto-filters them. This is a recurring responsibility for every controller, called out again per-phase as each one is built.
- "Restoring" a soft-deleted record is a simple update (`isDeleted: false`), not a data-recovery exercise — a real operational benefit for an ERP where "I didn't mean to delete that customer" is a predictable support request.
- Unique constraints (e.g. `Branch.code`, `SizeFamily.key`) apply globally, including to soft-deleted rows — a soft-deleted `Branch` with code `"MAIN"` would block creating a new branch with the same code. No current code path exercises this edge case; it's a known sharp edge to handle explicitly (e.g. a partial unique index excluding `isDeleted: true` rows) if it ever becomes a real scenario.
