# FEATURE-003 — Changelog

## Milestone 1 — Quotation Foundation

Extended the existing (Phase 1, schema-only) `Quotation`/`QuotationItem`
models with the fields needed to actually create, edit, and progress a
quotation: customer/internal notes, an independent internal approval
state, non-destructive versioning, and item-level product/service/
custom-item support. Built the first real API and UI for Quotations —
list, create, edit, status transitions, approval transitions, and
versioning — reusing the existing `ReadyProduct`/`Service` catalogs and
the existing `DocumentSequence` numbering mechanism rather than
introducing new ones.

No pricing, paper optimization, Order conversion, production workflow,
Customer Portal, or generic Workflow Engine — explicitly deferred to
future milestones.

## Milestone 2 — Order Conversion

Added the one action that turns an `ACCEPTED` Quotation into a real
`Order`: `POST /api/quotations/:id/convert`, reusing the
`ACCEPTED → CONVERTED` transition already declared in Milestone 1 and
the `Quotation.convertedOrderId` relation reserved since Phase 1.
Conversion freezes a snapshot of the Quotation's totals, notes, and
items onto the new `Order`/`OrderItem[]` (per ADR 0010) — nothing on the
Order references the Quotation by FK, so later edits never leak across.
Built the first-ever Order application code (`orderService.ts`,
`orders.ts` controller/routes) — deliberately minimal, a `GET
/api/orders/:id` read path only, no list/create/edit/delete. Added
`Attachment.category` (additive, unenforced) so a future upload feature
can tag Design/Customer/Internal/AI-generated files without another
migration. No new permissions — `quotations.convert` and `orders.view`
were already seeded, unused until now.
