# FEATURE-003 — Quotation Engine — Analysis

> Per MASTER_PROMPT.md Step 3 ("Inspect Existing Code... Never assume.
> Never duplicate. Always reuse.") — this analysis is the result of
> reading the actual current schema before proposing anything, not
> assuming a blank slate.

## Critical Finding: The Foundation Already Exists (Phase 1)

`Quotation`, `QuotationItem`, `ReadyProduct`, `Service`, and `Attachment`
were already modeled in Phase 1 (`schema.prisma`, marked "schema only —
API/UI in Phase 7"), and the `quotations.*` permission set was already
seeded in Phase 2. **This is not a green-field feature.** Building a new,
parallel model would violate the Database Rules' Golden Rule ("Claude
must NEVER duplicate existing tables... If something already exists:
Reuse it. Never recreate it.") and MASTER_PROMPT's "Never invent database
schema." The plan (02_PLAN.md) extends this existing schema; it does not
replace it.

### What already exists and is directly reusable

| Concern | Already exists as |
|---|---|
| Customer selection | `Quotation.partnerId` → `BusinessPartner` (FEATURE-002) |
| Status | `QuotationStatus` enum: `DRAFT`/`SENT`/`ACCEPTED`/`REJECTED`/`EXPIRED`/`CONVERTED` |
| Expiration | `Quotation.validUntil DateTime` |
| Multiple items | `Quotation.items QuotationItem[]` |
| Attachments | `Attachment` (polymorphic via nullable `quotationId`/`orderId`/`workOrderId`/`partnerId`, `storagePath` already reserved for Supabase Storage) |
| Products | `ReadyProduct` (id, name, price) — has working API/UI since Phase 1 |
| Services | `Service` (id, name, price, category) — has working API/UI since Phase 1 |
| Permissions | `quotations.view/create/edit/delete/convert` — seeded since Phase 2; `ADMIN` and `SALES` already hold `quotations.*` |
| Order conversion | `Quotation.convertedOrderId` ↔ `Order.quotationOrigin` (1:1, already wired) — not built in this milestone, but the schema anchor point already exists so a future conversion milestone doesn't need a migration for the relation itself |
| Customer vs. Internal notes precedent | `Order` (Phase 1, same feature family) **already has** `customerNotes String?` and `internalNotes String?` — `Quotation` does not yet have these; adding them to `Quotation` matches an existing, shipped naming convention rather than inventing one |

### What's present but reserved for a *later* milestone, not this one

`QuotationItem.kind` (`String`, not an enum — deliberately open-ended,
per its sibling `OrderItem.kind`'s doc comment: `"loose | notebook |
envelope | folders | boards | product | service"`), `modelName`
(`String?`), and `breakdown` (`Json`) are the **Pricing/Calculation
Engine's** output snapshot shape (`OrderItem`'s doc comment: "Full
denormalized calculator output snapshot... a historical line item never
changes even if the underlying paper/price catalog does" — LEGACY_ANALYSIS
§8). Per 00_REQUIREMENTS.md §3, pricing calculation is explicitly out of
scope for this milestone. **These three fields are left untouched and
unpopulated by this milestone** — a future Pricing Engine milestone
populates them; this milestone does not repurpose them for something
else, which would risk a real conflict once that milestone lands.

Because `kind` is a plain string (not a Prisma enum), new business lines
(packaging, large format, creative services) can introduce new `kind`
values with **zero migration** — this is already-existing evidence the
Phase 1 schema was designed for exactly the "without changing the
Quotation architecture" flexibility 00_REQUIREMENTS.md §6 asks for, not
something this milestone needs to newly invent.

## Real Gaps (What This Milestone Actually Needs to Add)

Cross-referencing 00_REQUIREMENTS.md against the table above, the
genuine gaps are:

- **`Quotation.customerNotes` / `Quotation.internalNotes`** — do not
  exist yet (Order has them; Quotation doesn't). Add, matching Order's
  existing naming.
- **Item-level quantity, size, notes** — `QuotationItem` has none of
  these today (only the pricing-engine-reserved `kind`/`modelName`/
  `breakdown`). Add as new columns, additive to the existing shape.
- **Item-level catalog reference** — no FK to `ReadyProduct`/`Service`
  exists on `QuotationItem` today. Add nullable references to both
  (mutually exclusive by convention, enforced at the service layer, not
  the database — matching how `PartnerAddress`/`PartnerNote`-style
  business rules in FEATURE-002 were enforced in services, not
  constraints), plus a free-text path for custom/uncataloged items.
- **Versioning** — no concept of a quotation revision exists anywhere
  in the schema today. New.
- **Approval state** — `QuotationStatus` covers the *customer's*
  response (`ACCEPTED`/`REJECTED`) and the document's own lifecycle
  (`DRAFT`/`SENT`/`EXPIRED`/`CONVERTED`), but nothing represents an
  *internal* approval gate (e.g., a manager approving pricing before a
  quotation is sent) as a concept distinct from the customer's decision.
  New, and deliberately optional/unenforced in this milestone (see
  02_PLAN.md) — *when* approval is required is a business-rule decision
  this milestone does not make.

## Architectural Tension: Workflow Engine Architecture vs. `QuotationStatus`

VISION.md's Workflow Engine Architecture states business modules "never
hardcode workflow stages" and that a workflow is a configurable
template. The existing `QuotationStatus` is a hardcoded Prisma enum —
in tension with that principle, at face value.

**Recommendation, not yet applied — for the Plan to decide explicitly:**
treat the current enum as the *concrete shape of the Printing Workflow
template* for this foundation milestone, not a replacement for a future
generic engine. 00_REQUIREMENTS.md §3 explicitly excludes "production
workflow" and this document does not read that as excluding "an admin-
configurable status engine" too — building a genuine generic Workflow
Engine (template CRUD, per-document-type stage configuration, migration
of every existing `*Status` enum onto it) is a substantially larger,
cross-cutting undertaking than "the Quotation foundation," and forcing
it now would block shipping the MVP the priority change explicitly asks
for. The enum-based status is kept **isolated behind the service layer**
(controllers/services expose "current status" and "transition to X,"
never raw enum comparisons scattered through business logic) so a future
migration to a real Workflow Engine is a service-internals change, not
an API-contract or schema-cascading rewrite. This is proposed as the
approach in 02_PLAN.md; flagged here as a deliberate, documented
trade-off rather than a silent shortcut.

## Business Object Architecture Applied

Per VISION.md: **Quotation exists only once. Customer View and Internal
View are different permission-scoped projections of the same record,
never two data models.** Concretely: one `GET` endpoint, one Quotation
service, one DTO-mapping function that branches on the caller's
permissions to decide which fields to include — not a
"CustomerQuotation" and an "InternalQuotation" type. This mirrors how
FEATURE-002 M6's Commercial Profile is a single record gated by
permission, not a duplicated one.

## Multi View System — Honest Gap

VISION.md's Multi View System (Full Page / Side View / Modal / New Tab,
"same single React component, four presentations") **does not exist
anywhere in the codebase yet.** Every screen built so far (Partners,
Users, Settings, ...) is a plain full-page React Router route. Building
genuine Side View / New Tab infrastructure from scratch, bespoke, just
for Quotations, would itself violate Component Architecture's "never
duplicate UI implementations" the moment a second feature wants the same
capability — it needs to be a shared, cross-cutting mechanism, built
once, not per-feature.

**Recommendation for the Plan:** ship the Quotation List + Full Page
detail/edit view now, using the same pattern already proven for
Partners, and build `QuotationDetail` as a self-contained component that
does not assume it owns the full page (no direct dependence on route
params beyond an injected `quotationId`; no page-level chrome baked in)
— so it can be dropped into a future Side Panel/Modal/Tab host without a
rewrite once that shared infrastructure exists. Building the actual
Side View/Modal/New Tab host mechanism is flagged as its own future
cross-cutting task, not part of this milestone.

## Service Boundaries (Reuse Before Create)

- **Quotation service** owns the Quotation and QuotationItem lifecycle.
- **Reuses**, does not reimplement: `BusinessPartner` lookup (via the
  same `loadPartnerOr404`-style pattern? — no, Quotation is not a
  partner-child resource the way Contacts/Addresses/Notes are; it's a
  peer object that *references* a partner, so it gets its own
  `/api/quotations` top-level resource, not nested under
  `/api/partners/:id/quotations` — see 02_PLAN.md), `ReadyProduct`/
  `Service` catalog lookups (existing Settings-area controllers), and
  `Attachment` (existing polymorphic model, no changes needed to use it
  for Quotations — the `quotationId` FK already exists).
- **Does not reuse** or duplicate: no new "Product" or "Service" model
  is created — `ReadyProduct`/`Service` from Phase 1 are the catalog.

## Permission Mapping

No new permission keys. `quotations.view`/`create`/`edit`/`delete`
already exist and are already granted to `ADMIN`/`SALES` via their
`quotations.*` (and `SUPER_ADMIN`'s `*`) wildcards — zero seed changes
needed. `quotations.convert` remains defined but **unused** until a
future Order-conversion milestone actually implements it — not invoked,
not removed (removing an already-approved, already-seeded permission
key without cause would itself be an unnecessary schema/seed change).

**Internal View fields** (cost, margin, workflow detail, internal
notes, production preparation, commercial information, future pricing
data) are gated the same way M6's Commercial Profile was: a specific
capability check in the DTO-mapping step, not a route-level gate, since
the *same* GET response needs to include or exclude fields based on the
caller, not block the whole endpoint. Per the approved decisions'
Future Portal Compatibility rule, this check is written as an explicit
capability input to the mapping function (e.g. `canSeeInternal:
boolean`), not a direct read of `req.auth`/branch — internal callers
derive it from `can('quotations.edit')`-or-similar today; a future
Customer Portal or mobile client derives it as `false` from its own
auth model, calling the identical mapping function, not a rewritten
one. Given no pricing/cost data is being captured yet
(00_REQUIREMENTS.md §3), this gate has nothing to hide yet in this
milestone besides `internalNotes` — but the seam is built now so a
future pricing-engine milestone has an obvious, already-proven place to
add the check, not a redesign to do.

## Open Decisions Resolved for the Plan (not left ambiguous)

- **Versioning mechanism**: a self-referencing `previousVersionId` +
  `version Int` on `Quotation` (new version = new row, not a separate
  `QuotationVersion` child table) — reuses the existing `Quotation`
  model and its existing `quotationNumber` uniqueness/audit machinery
  per version, rather than introducing a second, parallel versioning
  concept.
- **Approval state**: a new, independent field (`approvalState`,
  default `NOT_REQUIRED`) — not folded into `QuotationStatus`, since
  conflating "has the customer accepted this" with "has this been
  internally approved" would make future queries and audit trails
  ambiguous about which kind of decision happened.
- **Item catalog reference**: nullable `readyProductId`/`serviceId` FKs
  plus free-text `description` for uncataloged items — not a single
  polymorphic "itemRefId + itemRefType" pair, since Prisma FKs give real
  referential integrity for the two cases that already have real tables,
  while the free-text path covers what doesn't.

---

# Milestone 2 — Order Conversion Analysis

## Critical Finding: Order Conversion Was Already Designed, Not Just Reserved

Unlike a blank schema-only table, the conversion path was already
*decided*, not just scaffolded, before this milestone started:

- **ADR 0010** (written at Phase 1) already states the exact default
  behavior: "Quotation-to-invoice conversion defaults to **freezing**
  the quoted breakdown snapshots exactly as approved; an explicit
  `recalculate: true` flag… instead re-runs current pricing." This
  milestone implements the freeze default and defers the flag (no
  Pricing Engine exists to recalculate with — see 00_REQUIREMENTS.md
  §14).
- `Quotation.convertedOrderId` / `Order.quotationOrigin` — a `@unique`
  1:1 relation named `"QuotationConversion"` — already exists.
  `QuotationStatus.CONVERTED` and M1's own
  `LEGAL_STATUS_TRANSITIONS['ACCEPTED'] = ['CONVERTED']` already exist.
  Nothing about the Quotation side needs a schema change.
- `quotations.convert` ("Convert a quotation to an invoice") is already
  in the seeded permission catalog, unused until now — no new permission
  needed.
- `DocumentType.INVOICE` already exists in `DocumentSequence`'s enum,
  parallel to `QUOTATION` — `nextInvoiceNumber` is a direct copy of
  `nextQuotationNumber` with `documentType: 'INVOICE'`, `prefix:
  'CLP-INV'`.
- `OrderItem.kind`/`modelName`/`breakdown` already exist with a doc
  comment describing exactly the snapshot semantics Decision 8 asks
  for: "a historical line item never changes even if the underlying
  paper/price catalog does." The conversion writes each
  `QuotationItem`'s `itemType`/`quantity`/`size`/`notes`/`description`
  plus the *name* (not just the id) of any referenced `ReadyProduct`/
  `Service` into `breakdown` as a plain JSON object — never a live FK
  back to the Quotation's own item row.
- `Order` (branchId, partnerId, staffId, subtotal, discountPercent,
  vatOn, vatAmount, finalTotal, paymentTerms, deliveryDate,
  customerNotes, internalNotes, status, items, attachments,
  treasuryEntries, workOrder) is fully modeled but has **zero
  application code anywhere** — no controller, service, route, or shared
  schema. This is the same "dormant since Phase 1" pattern M1's analysis
  found for Quotation itself.

## Real Gap (What This Milestone Actually Needs to Add)

Only the things ADR 0010 and the schema didn't already decide:

1. The conversion transaction itself (`convertQuotationToOrder` in
   `quotationService.ts`) — guard clauses (`status === 'ACCEPTED'`,
   `convertedOrderId === null`), the snapshot-copy mapping from
   `QuotationItem` → `OrderItem`, and which Quotation fields map to
   which Order fields (§ below).
2. `orderService.ts` — `nextInvoiceNumber`, `mapOrderToDto`. First-ever
   Order service file.
3. `GET /api/orders/:id` — first-ever Order controller/route. Minimal:
   detail only, `orders.view`.
4. `Attachment.category` — the one genuine schema change this milestone
   makes (additive, nullable, free string — same zero-migration
   extensibility as `QuotationItem.itemType`/`OrderItem.kind`).

## Field Mapping (Quotation → Order at Conversion)

| Quotation field                     | Order field                                    |
| ------------------------------------ | ----------------------------------------------- |
| `branchId`                           | `branchId` (copied)                              |
| `partnerId`                          | `partnerId` (copied)                             |
| `staffId`                            | `staffId` — the original quoting rep, **not** the staff member who clicks Convert (preserves "who sold this"; see Open Decision below) |
| `subtotal`/`discountPercent`/`vatOn`/`vatAmount`/`finalTotal` | copied verbatim (freeze default) |
| `customerNotes`/`internalNotes`      | copied verbatim                                  |
| — (no Quotation equivalent)          | `status = CONFIRMED` (ADR 0010's own example: "`Order.status = CONFIRMED` while `WorkOrder.productionStatus = PRINTING`") |
| — (no Quotation equivalent)          | `paymentTerms = null`, `deliveryDate = null` — not derivable from a Quotation; left for a human to fill in on the Order later (out of scope: no Order edit endpoint exists yet to set them, so they start empty) |
| `items[].itemType/quantity/size/notes/description/readyProductId/serviceId` | snapshotted into `items[].kind/modelName/breakdown` (JSON) — see above |

## Open Decision Resolved for the Plan

- **`Order.staffId` on conversion**: set to `Quotation.staffId` (the
  rep who owns the sale), not `req.auth.staffId` (whoever happens to
  click Convert — could be a manager or admin). A sale's ownership
  shouldn't change because someone else pressed a button.
