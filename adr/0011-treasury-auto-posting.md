# ADR 0011: Automatic Treasury posting from invoice payments

**Status:** Accepted

## Context

In legacy, Treasury is a fully manual ledger (LEGACY_ANALYSIS.md §2) — recording that an invoice was paid and recording the corresponding treasury income are two unconnected actions a staff member must remember to do separately, with no link between them if both are done. Explicit requirement: every invoice payment must automatically create a treasury transaction, with manual entries remaining supported, and each transaction must reference the invoice, payment, customer, employee, and branch it relates to.

## Decision

`TreasuryEntry` carries `sourceType` (`MANUAL` | `INVOICE_PAYMENT`, default `MANUAL`) plus direct references: `orderId` (the invoice — `Order` doubles as invoice in this system), `paymentId`, `customerId`, `staffId`, `branchId`. When an order's payment is recorded (Phase 6), the matching `TreasuryEntry` is inserted **in the same database transaction** — a payment and its treasury entry can never exist independently of each other. Manual entries continue to work exactly as in legacy, with `sourceType: MANUAL` and null `orderId`/`paymentId`.

`INVOICE_PAYMENT`-sourced entries are not directly editable/deletable from the Treasury UI once built (Phase 10) — correcting one means voiding/adjusting the source payment, so the ledger can never silently diverge from the invoices it reflects.

## Consequences

- The `TreasuryEntry` table had to be created in Phase 1 (schema only) rather than in Phase 10 (its own UI/API phase), specifically so Phase 6 has somewhere to write to — this is why Phase 1's scope grew beyond "settings and reference data" to include the full schema for every later phase.
- Treasury balance reporting (Phase 10/13) will reflect real invoice income automatically, closing a real reconciliation gap that exists in the legacy system today (a missed manual entry means the treasury balance silently understates reality).
- Deciding whether `TRANSFER`-type entries count toward the balance (legacy counts them in neither direction) remains an open, low-priority question for whoever builds Phase 10 — this ADR doesn't resolve it, only the schema and the auto-posting mechanism.
