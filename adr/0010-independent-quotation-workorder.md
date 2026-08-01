# ADR 0010: Independent Quotation and Work Order entities

**Status:** Accepted

## Context

In legacy, a "quotation" is just the current in-memory cart printed with a different flag — never saved, no history, no lifecycle (LEGACY_ANALYSIS.md §2). A "work order" is a print view derived from a saved order, sharing that order's single status field, which conflates sales/billing status with production-floor status into one 10-stage list. Explicit requirements: quotations must be independently stored records supporting one-click conversion to an invoice; work orders must be independent entities with their own production status tracking.

## Decision

- `Quotation`/`QuotationItem` are real, persisted tables mirroring `Order`/`OrderItem`'s shape, with their own lifecycle (`DRAFT → SENT → ACCEPTED/REJECTED/EXPIRED → CONVERTED`) and a `convertedOrderId` back-reference once converted into an order.
- Quotation-to-invoice conversion defaults to **freezing** the quoted `breakdown` snapshots exactly as approved; an explicit `recalculate: true` flag on the conversion endpoint instead re-runs current pricing — freeze is the default because a quote is a promise at a point in time, matching how the denormalized `breakdown` snapshot already works for orders (LEGACY_ANALYSIS.md §8).
- `WorkOrder` is a separate table, one-to-one with `Order`, carrying its own `productionStatus` (`WAITING → DESIGN → PREPRESS → PLATE_MAKING → PRINTING → FINISHING → QUALITY_CHECK → READY_FOR_DELIVERY → COMPLETED`), fully decoupled from `Order.status` (`DRAFT, QUOTATION, CONFIRMED, IN_PRODUCTION, READY, DELIVERED, CANCELLED`), which now represents only the sales/billing lifecycle.

## Consequences

- A quotation that's never converted is now a representable, queryable state — impossible in legacy, where an un-saved quotation simply vanished after printing.
- The sales team and the production floor can now track genuinely different states for the same order (e.g. `Order.status = CONFIRMED` while `WorkOrder.productionStatus = PRINTING`) without one status list awkwardly serving both audiences, as legacy's did.
- This is a deliberate, requested **behavior change** from legacy, not a like-for-like port — the calculation math inside a quotation/order item is still ported verbatim (ADR 0016); only the surrounding persistence/lifecycle model changes.
