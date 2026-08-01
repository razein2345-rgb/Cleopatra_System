# ADR 0008: Sequential, per-branch, human-readable document numbering

**Status:** Accepted

## Context

Legacy invoice/quotation/work-order "numbers" are just the last 8 characters of a random client-generated id (LEGACY_ANALYSIS.md §6), not sequential or human-meaningful. Explicit requirement: invoice numbers (and, by extension, quotation and work order numbers) must be sequential, human-readable, per-branch, with a configurable prefix — format `CLP-INV-2026-000001`.

Sequential numbering under concurrent writes is a genuine correctness hazard: reading "the last number" and incrementing it in application code races when two requests happen at once (exactly the class of bug LEGACY_ANALYSIS flags as risk #4, generalized).

## Decision

A `DocumentSequence` table holds one row per `(branchId, documentType, year)`, with a `prefix` (editable, not hardcoded) and a `lastNumber` integer. The number is incremented **atomically inside the same database transaction** that creates the document, using the table's unique constraint on `(branchId, documentType, year)` for row-level locking — never a separate read-then-write.

The human-readable number stored on `Order.invoiceNumber`, `Quotation.quotationNumber`, and `WorkOrder.workOrderNumber` is the formatted string `{prefix}-{year}-{lastNumber padded to 6 digits}`, computed once at creation time and never recalculated.

## Consequences

- Numbering resets per calendar year per branch (a new `DocumentSequence` row is created for each new year), matching the example format's embedded year.
- Today, with a single seeded branch, this behaves identically to global sequential numbering — the schema is ready for a second branch to get its own independent sequence without any migration.
- The atomic-increment logic itself is implemented in whichever phase creates each document type (Order in Phase 6, Quotation in Phase 7, Work Order in Phase 8) — this ADR fixes the schema and the concurrency approach, not the application code, which doesn't exist yet.
