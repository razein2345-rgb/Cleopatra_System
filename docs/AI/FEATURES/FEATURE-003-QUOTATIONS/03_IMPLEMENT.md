# FEATURE-003 — Quotation Engine — Implementation

> See `00_REQUIREMENTS.md`, `01_ANALYSIS.md`, and `02_PLAN.md` for what
> was requested, what already existed, and what was decided before any
> code was written. This document records what was actually built.

## Milestone 1 — Quotation Foundation

**Status: Implemented.** All 12 approved architectural decisions from
`02_PLAN.md` were applied; nothing outside the foundation scope
(00_REQUIREMENTS.md §3) was built.

### As Implemented

- **Extended, not replaced**, the Phase 1 `Quotation`/`QuotationItem`
  models — no parallel object was created (per the explicit "never
  create parallel business objects" instruction).
- **`Quotation`** gained: `customerNotes`/`internalNotes` (matching
  `Order`'s existing naming), `approvalState` (new
  `QuotationApprovalState` enum: `PENDING`/`APPROVED`/`NEEDS_REVISION`,
  independent of `QuotationStatus`), `version`/`previousVersionId` (a
  self-referencing, `@unique` chain — new version = new row, nothing
  overwritten).
- **`QuotationItem`** gained: `itemType` (free string discriminator —
  `READY_PRODUCT`/`SERVICE`/`CUSTOM`/`BRANDING`/... — zero-migration
  extensible, same pattern as `OrderItem.kind`), `quantity`, `size`,
  `notes`, `description`, and nullable `readyProductId`/`serviceId` FKs
  into the **existing** `ReadyProduct`/`Service` catalogs (Phase 1, no
  new catalog models). `kind`/`modelName`/`breakdown` (the future
  Pricing Engine's reserved fields) were **relaxed to nullable** — they
  were `NOT NULL` under the old schema-only definition, and the table
  held zero rows in every environment, so this milestone would otherwise
  have had to write meaningless placeholder data into them just to
  satisfy the constraint.
- **Quotation numbering** reuses the existing `DocumentSequence` model
  exactly as its own Phase 1 doc comment intended — atomic
  upsert-and-increment inside the same transaction that creates the
  Quotation (`nextQuotationNumber` in `quotationService.ts`).
- **Status transitions are service-layer-only** (decision 1, "Workflow
  Ready"): `LEGAL_STATUS_TRANSITIONS` in `quotationService.ts` is the
  single place transition legality is decided. `PUT
  /api/quotations/:id/status` is the only mutation path; the frontend
  submits a plain `<select>` of every possible status value and displays
  whatever error the server returns for an illegal one — it does not
  encode a "legal next states" table itself.
- **Approval transitions are independent** (decision 5): `PUT
  /api/quotations/:id/approval` is unrestricted (any of the three states
  is settable at any time) — there was no business rule given for when
  approval applies, so none was invented.
- **Versioning** (decision 6): `POST /api/quotations/:id/versions`
  copies the current Quotation + its full item set into a new row,
  `version + 1`, `previousVersionId` pointing back, `status` reset to
  `DRAFT` and `approvalState` reset to `PENDING` (a new version is a new
  draft to be re-reviewed) — the prior row is never modified.
  `nextVersionExists` (derived from the `nextVersion` relation) lets the
  UI show "a newer version exists" without a separate query.
- **Customer View vs. Internal View** (decisions 3 & 7): one Quotation
  service, one `mapQuotationToDto` function, one DTO shape — never two
  response types. `canSeeInternal` is computed once, in the controller,
  from the caller's own permission grants, and passed into the mapper as
  an explicit boolean parameter (not read from `req.auth` inside the
  mapper itself) — so a future Customer Portal endpoint can call the
  identical function with its own capability source. Today, every caller
  is internal staff (the route requires `quotations.view`), so
  `internalNotes` is visible to anyone holding `quotations.edit`; a
  portal caller would compute `canSeeInternal` as `false`.
- **Commercial Separation** (decision 4): confirmed by construction —
  nothing in this milestone reads or writes `PartnerCommercialProfile`
  (M6). `Quotation`'s pricing fields (`subtotal`/`discountPercent`/
  `vatOn`/`vatAmount`/`finalTotal`) are this specific document's figures,
  entered as-is (no calculation performed — 00_REQUIREMENTS.md §3), never
  the partner's general commercial terms.
- **Item validation is server-side, pre-transaction** (matching this
  project's established pattern — see `contactPersons.ts`/
  `partnerAddresses.ts`): `validateQuotationItemRefs` confirms any
  referenced `ReadyProduct`/`Service` exists and isn't soft-deleted, and
  that a reference-less item carries a `description`, before the
  create/update transaction runs.
- **No new permissions** — `quotations.view/create/edit/delete` (seeded
  since Phase 2) gate every endpoint; `quotations.convert` remains
  defined but unused (Order conversion is out of scope for M1).
- **Audit logging**: `CREATE`/`UPDATE`/`DELETE`/`STATUS_CHANGE` (existing
  generic values, `entityType: 'Quotation'`) plus one new value,
  `APPROVAL_CHANGED` — every call also passes `partnerId`, continuing the
  pre-M6 Timeline-readiness convention (decision 10, CRM Integration) —
  a future CRM/Sales-Funnel feature reads `Quotation`/`AuditLog` directly
  by `partnerId`, no duplicated data anywhere.
- **Frontend**: `QuotationsPage.tsx` (list, mirrors `PartnersPage.tsx`),
  `QuotationDetail.tsx` (the single view/edit component — genuinely
  presentation-independent: no `useParams`, no page chrome, accepts
  `quotationId?`/`onSaved?` as props only), hosted today via a thin
  `QuotationDetailPage.tsx` full-page route wrapper (decision 8, Multi
  View Compatibility — Side View/Modal/Workspace Tab hosts are not built
  this milestone, but `QuotationDetail` needs no changes to be dropped
  into one later). Item rows offer a curated `itemType` preset list
  (`KNOWN_QUOTATION_ITEM_TYPES`, not an enforced enum) plus
  product/service dropdowns or a free-text description depending on the
  selected type.

### Known Limitation Surfaced (Pre-Existing, Not Introduced Here)

`GET /api/ready-products` and `GET /api/services` require
`settings.view`, which SALES does not hold (SALES has `quotations.*`/
`partners.*`/`orders.*` but not `settings.*`, per Phase 2's seed data).
This means SALES — the role that will actually create most
quotations — cannot populate the Product/Service dropdown convenience,
though CUSTOM items with a free-text description remain fully available
regardless. `QuotationDetail.tsx` fetches both catalogs and falls back
to an empty list on failure, the same pattern already established for
the M1 sales-rep dropdown (`GET /api/users` requiring `employees.view`).
**Not fixed here** — changing an existing Settings-area permission gate
as a side effect of this feature would go beyond "extend the Quotation
Engine," and per the M1 review's Permission Cleanup Governance rule,
permission changes should be their own dedicated, reviewed change. Flagged
for a future decision, not silently worked around.

### Live-Verified, Not Yet UI-Click-Tested (Documented Gap)

Live verification for this milestone was performed via direct API calls
(not `computer`-tool clicks through the rendered UI) — a Browser-pane
navigation carrying an embedded recovery-link auth token was blocked by
the session's safety classifier partway through verification. Every
business rule below was confirmed against the real, running API; the
actual React form/button interactions were not separately exercised
this round. See `04_VERIFY.md` for the exact sequence and results.

## Milestone 2 — Order Conversion

**Status: Implemented.** All ten decisions from `02_PLAN.md`'s
Milestone 2 section were applied; nothing beyond conversion + a minimal
Order read path was built (00_REQUIREMENTS.md §14).

### As Implemented

- **`POST /api/quotations/:id/convert`** (`convertQuotation` in
  `quotations.ts`) — the only entry point that creates an Order from a
  Quotation. Reuses `assertLegalStatusTransition`/
  `IllegalStatusTransitionError` unchanged for the `ACCEPTED →
  CONVERTED` guard; a re-conversion attempt on an already-`CONVERTED`
  quotation falls out of the same check for free
  (`LEGAL_STATUS_TRANSITIONS['CONVERTED']` is `[]`) — no separate
  "already converted" error code needed.
- **Frozen snapshot, not a live reference** (decision 8): `Order`'s
  `subtotal`/`discountPercent`/`vatOn`/`vatAmount`/`finalTotal`/
  `customerNotes`/`internalNotes` are copied by value from the
  Quotation at conversion time. Each `QuotationItem` becomes an
  `OrderItem` with `kind = itemType`, `modelName` = the referenced
  `ReadyProduct`/`Service`'s name at that moment, and `breakdown` — a
  plain JSON object carrying every item field plus the product/service
  *name* (not just its id) — so the Order remains fully readable even
  if the source Quotation or catalog entry is later edited or deleted.
  Matches ADR 0010's freeze default exactly; the `recalculate: true`
  alternative it also describes is not implemented (00_REQUIREMENTS.md
  §14 — no Pricing Engine exists yet to recalculate with).
- **`Order.status = CONFIRMED`** at creation (ADR 0010's own worked
  example) and **`Order.staffId` = the Quotation's own `staffId`**, not
  the converting user's — ownership of the sale doesn't change because
  someone else clicked Convert (01_ANALYSIS.md's Open Decision).
- **Atomic invoice numbering**: `nextInvoiceNumber` in the new
  `orderService.ts`, a direct copy of `nextQuotationNumber`'s shape,
  reusing `DocumentSequence` with `documentType: 'INVOICE'`, prefix
  `CLP-INV` — first real use of that reserved enum value.
- **`GET /api/orders/:id`** (`orders.ts` controller/routes, first-ever
  Order application code) — detail only, `orders.view`. No list,
  create, edit, or delete; a full Order module is future work.
- **`mapOrderToDto(record, canSeeInternal)`** (`orderService.ts`)
  mirrors `mapQuotationToDto` exactly (decision 5, Customer View) —
  `internalNotes` forced to `null` when the caller lacks
  `orders.edit`, even though no portal caller exists yet.
- **`Attachment.category String?`** added (decision 9) — additive,
  nullable, no enum, no upload/download endpoint (none exists for any
  entity yet); prep only.
- **Audit logging**: one `CREATE` entry (`entityType: 'Order'`) and one
  `STATUS_CHANGE` entry (`entityType: 'Quotation'`, `ACCEPTED →
  CONVERTED`) per conversion, both carrying the same `partnerId`
  (decision 4, Customer Journey) — confirmed live: a single
  `partnerId`-scoped `AuditLog` query returns the Quotation's and the
  resulting Order's history interleaved, with zero duplication into any
  separate table.
- **Frontend**: `QuotationLifecycle` (in `QuotationDetail.tsx`) gained a
  "Convert to Order" button, shown only when `status === 'ACCEPTED' &&
  !convertedOrderId` and the caller holds `quotations.convert`, and a
  read-only Order summary (invoice number, status, total, date) fetched
  once `convertedOrderId` is set. No new page, route, or Side View
  (decision 6) — added entirely inside the existing,
  presentation-independent component.
- **No new permissions** — `quotations.convert` and `orders.view`
  (both seeded since Phase 2, unused until now) gate the two new
  endpoints.

### Bug Found and Fixed During Live Verification

The first conversion call returned `quotationOriginId: null` in its
immediate response, even though the Order *was* correctly linked. Cause:
`tx.order.create({ include: ORDER_INCLUDE })` runs its own read for the
`quotationOrigin` reverse relation *before* the following
`tx.quotation.update(...)` (which sets `convertedOrderId`) had committed
— so the relation genuinely didn't exist yet at the moment it was read,
within the same transaction. Fixed by re-fetching the Order with
`ORDER_INCLUDE` *after* the Quotation update, still inside the same
transaction (`quotations.ts`'s `convertQuotation`). Confirmed via a
second live conversion that `quotationOriginId` is now correct in the
`201` response itself, not just on a later `GET`.

### Known Limitation Surfaced (Pre-Existing, Not Introduced Here)

Same `settings.view` gap on `ready-products`/`services` noted for M1 —
unaffected by this milestone (conversion reads Quotation items, which
already resolved their catalog reference at creation time; it performs
no new catalog lookup of its own beyond resolving names for the
snapshot).
