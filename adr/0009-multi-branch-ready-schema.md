# ADR 0009: Multi-branch-ready schema from day one

**Status:** Accepted

## Context

Explicit requirement: the system must support future multi-branch expansion, even though the first installation has exactly one branch. Retrofitting a tenant/branch dimension onto an already-populated schema later is a materially harder migration (backfilling a required column, resolving ambiguous ownership of existing rows) than including it from the start.

## Decision

A `Branch` model exists from Phase 1, with one row seeded (`code: "MAIN"`, `isDefault: true`). `branchId` is a **required** (not nullable) foreign key on every table a real multi-branch printing business would scope per-location: `StaffProfile`, `Order`, `Quotation`, `WorkOrder`, `TreasuryEntry`, `DocumentSequence`. It's required rather than nullable specifically because a valid branch always exists to assign — there is no meaningful "no branch" state to model.

`Customer`, `Supplier`, `Tender`, and the pricing/product catalog (`Setting`, `SizeFamily`, `SheetType`, `ReadyProduct`, `Service`, `InventoryItem`) are treated as **shared across branches**, not branch-scoped — the common default for a business whose customer list, supplier list, and product catalog don't change per location.

No multi-branch UI, branch switcher, or per-branch access control exists yet — this decision is schema-only.

## Consequences

- Adding a second branch later is additive (insert a `Branch` row, assign staff/new records to it) rather than a breaking migration.
- If it later turns out pricing or catalogs genuinely need to vary by branch, that's a bigger schema decision (a `BranchSetting` override layer) to make explicitly with its own ADR — not something this decision silently precludes, but also not something it solves.
- Every query against a branch-scoped table technically should filter or reason about `branchId` even today, even though there's only one value it can ever be — this keeps the code path identical to what multi-branch will require, rather than needing to be retrofitted alongside the schema change.
