# FEATURE-003 — Quotation Engine — Requirements

## 0. Context and Priority

FEATURE-002 (Business Partners) is paused after Milestone 6, not abandoned
— M7–M14 remain on the roadmap. The Quotation Engine is now the highest
priority: the goal is a Production MVP usable by real employees inside
Cleopatra Press as soon as possible, built on top of the Business Partner
foundation FEATURE-002 already delivered.

This document covers **only the foundation milestone** — the structural
model a quotation is built from. Pricing calculation, paper optimization,
production workflow, and invoicing are explicitly future milestones (see
§3).

## 1. Purpose

The Quotation Engine is the central object every downstream feature is
built from: Product Catalog, Pricing Engine, Paper Calculator, Work
Orders, Production Workflow, Invoices, and Treasury all consume or
produce Quotations. Getting the foundation right now — flexible across
business lines, not hardcoded to Printing — determines how much rework
every one of those future features costs later.

## 2. Scope for This Milestone (Foundation Only)

- Create, view, edit, and list Quotations.
- Customer (Business Partner) selection.
- Multiple Quotation Items per Quotation.
- Item-level product/service reference, quantity, size, and notes.
- Attachments at the Quotation level.
- Status (lifecycle) and Expiration.
- Versioning (revising a quotation before it's accepted).
- Approval state (an internal gate, distinct from the customer's
  accept/reject decision).
- Internal Notes vs. Customer Notes, kept separately visible.
- A response shape that already separates Customer-visible fields from
  Internal-only fields, even though no Customer Portal exists yet to
  consume it (Portal Architecture readiness, not portal delivery).

## 3. Explicitly Out of Scope for This Milestone

- Pricing calculations of any kind (unit pricing, discounts, VAT
  computation, totals derived from items — `subtotal`/`finalTotal`
  remain present in the schema from Phase 1 but are not computed or
  enforced by this milestone; they are entered/left as-is, not derived).
- Paper optimization / the Paper Calculator.
- Production workflow / Work Orders.
- Invoices (Order conversion — the schema already has a
  `Quotation.convertedOrderId` relation from Phase 1; this milestone
  does not build the conversion action).
- A real Customer Portal (Portal Architecture is prepared for, not
  delivered — see §2's last bullet).
- A generic, admin-configurable Workflow Engine (see 01_ANALYSIS.md's
  Workflow Engine note — this is a deliberate, documented deferral, not
  an oversight).
- True Multi View System infrastructure (Side View / Modal / New Tab as
  reusable, cross-cutting UI capabilities) — see 01_ANALYSIS.md.

## 4. Quotation — Core Fields

Per the explicit request, a Quotation must support:

- Customer selection (a Business Partner).
- Multiple Quotation Items.
- Status.
- Versioning.
- Approval state.
- Expiration.
- Internal notes.
- Customer notes.
- Attachments.

## 5. Quotation Item — Fields

Per item:

- Reference to a Product or a Service, **or** a free-form custom
  description for items not yet in any catalog (future business lines —
  packaging, large format, creative services — must not require a
  schema change to be quoted).
- Quantity.
- Size.
- Notes (customer-visible).

## 6. Multi-Business-Line Flexibility

The Quotation structure must support, without changing the Quotation
architecture:

- Printing
- Digital Printing
- Offset Printing
- Large Format
- Packaging
- Future Creative Agency Services

## 7. Customer View

A customer (today: no real customer-facing client exists; this is a
response-shape requirement for forward compatibility) may see only:

- Product
- Quantity
- Size
- Price
- Notes
- Attachments

## 8. Internal View

Employees may additionally see:

- Cost
- Margin
- Workflow (internal status detail)
- Internal Notes
- Production preparation detail
- Future pricing data

## 9. UI

- Use the Multi View System architecture from VISION.md: Full Page,
  Side View, New Tab.
- Reuse components; never duplicate forms.

## 10. Permissions

Follow the existing permission architecture. No new permission module
is expected — `quotations.*` already exists in the approved catalog
(seeded since Phase 2, currently unused).

## 11. Documentation

Follow the mandatory Feature Development Standard lifecycle
(Requirements → Analysis → Planning → Implementation → Verification →
Documentation → Changelog), per VISION.md's Feature Development
Standard and Feature Evolution Policy.

---

# Milestone 2 — Order Conversion

Ten architectural decisions were given ahead of this milestone (verbatim
in `02_PLAN.md`'s Milestone 2 section). Requirements below translate them
into concrete scope.

## 12. Purpose

A Quotation's lifecycle ends when the customer accepts it. From that
point, everything is Order/production territory — Quotation itself must
never grow production logic. This milestone builds the one action that
crosses that boundary: **Convert an ACCEPTED Quotation into an Order**,
using the `Quotation.convertedOrderId`/`Order.quotationOrigin` relation
and `QuotationStatus.CONVERTED` value already reserved in the schema
since Phase 1 (M1's own `LEGAL_STATUS_TRANSITIONS` already declares
`ACCEPTED → CONVERTED` as the only legal move out of `ACCEPTED`).

## 13. Scope for This Milestone

- `POST /api/quotations/:id/convert` — the only entry point that creates
  an Order from a Quotation. Requires the Quotation to be `ACCEPTED` and
  not already converted.
- Copies a **frozen snapshot** of the Quotation's totals, notes, and
  items into a new `Order`/`OrderItem[]` — never a live reference back to
  the Quotation (Decision 8). Matches ADR 0010's already-decided default
  ("freeze… an explicit `recalculate: true` flag instead re-runs current
  pricing") — `recalculate` is explicitly deferred (§14), since there is
  no Pricing Engine yet to recalculate with.
- Atomic invoice numbering via the existing `DocumentSequence` model
  (`DocumentType.INVOICE`, prefix `CLP-INV`), mirroring
  `nextQuotationNumber` exactly.
- Sets `Quotation.status = CONVERTED` and `Quotation.convertedOrderId`
  in the same transaction that creates the Order.
- A minimal read path — `GET /api/orders/:id` — sufficient to show the
  resulting Order's summary (invoice number, status, total, date) next
  to the Quotation that produced it. No Order list, create, edit, or
  delete endpoint (that's a full Order module, out of scope here).
- `mapOrderToDto(record, canSeeInternal)` — same Customer View / Internal
  View split as `mapQuotationToDto`, prepared now even though no portal
  caller exists yet (Decision 5).
- `Attachment.category` — an additive, free-string field (no enum) so a
  future upload feature can tag Design/Customer/Internal/AI-generated
  files without another migration (Decision 9). No Attachment CRUD is
  built this milestone — Attachment upload/download doesn't exist yet
  for any entity.
- Frontend: a "Convert to Order" action on the existing Quotation detail
  component (visible only when `status === 'ACCEPTED'` and
  `convertedOrderId` is null), and a read-only Order summary shown
  inline once converted. No new page, no new route, no Side View
  (Decision 6) — the Quotation detail component stays exactly as
  presentation-independent as M1 left it.

## 14. Explicitly Out of Scope for This Milestone

- A Pricing Engine, or any price *calculation* — Quotation and Order
  totals are still entered/copied as-is, never computed (Decision 7).
- The `recalculate: true` conversion flag ADR 0010 anticipated — nothing
  exists yet to recalculate with; adding a flag with no effect would be
  misleading, so it is left out entirely rather than stubbed.
- A full Order module (list, standalone create, edit, delete, its own
  status-transition endpoints) — only what's needed to view a converted
  Order.
- Production Workflow / Work Orders — Order's own post-conversion
  lifecycle belongs to a future Order Workflow milestone (Decision 2).
- Attachment upload/download endpoints — only the categorization field
  is prepared.
- Side View / Multi View System infrastructure (Decision 6, still
  deferred from M1).

## 15. Customer View (Order)

Once a Customer Portal exists, it may see only: Product, Quantity, Size,
Files, Price, Status (Decision 5). Never: Internal Notes, Approval
History, Costs, Margins, Audit, Internal Workflow. Enforced today by
`mapOrderToDto`'s `canSeeInternal` parameter, even with zero portal
callers.

## 16. Customer Journey

The Order created by conversion carries `partnerId` on its audit `CREATE`
entry, continuing the exact `AuditLog.partnerId` convention established
ahead of FEATURE-002 M6 — a future CRM/timeline reads Quotation and Order
history through the same `partnerId`-scoped query, with nothing
duplicated into a separate "timeline" table (Decision 4).
