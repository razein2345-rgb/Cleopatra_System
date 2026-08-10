# FEATURE-003 — Quotation Engine — Plan

This plan implements 00_REQUIREMENTS.md's foundation scope only, as an
**extension** of the existing Phase 1 `Quotation`/`QuotationItem` schema
(01_ANALYSIS.md), not a new parallel model.

**Status: Approved with modifications.** The 12 architectural decisions
below were applied to this plan before implementation began (see each
section for where). None required a different model — all sharpen the
same extension-of-existing-schema approach.

## Approved Architectural Decisions (applied throughout this plan)

1. **Workflow Ready** — no UI code decides or knows how a quotation
   changes state. `PUT /api/quotations/:id/status` is the only mutation
   path for `status`; the legal-transition table lives in
   `quotationService.ts` alone. The frontend calls the endpoint with a
   target status and renders whatever comes back — it never contains an
   "allowed next states" table itself. This keeps every status decision
   swappable later for a real Workflow Engine without touching the API
   contract or any component.
2. **Product Type Agnostic** — `QuotationItem` gets an explicit
   `itemType String` discriminator (not a Prisma enum — same
   zero-migration extensibility as `OrderItem.kind`), plus the
   already-planned nullable `readyProductId`/`serviceId` FKs and
   free-text `description` for anything without a catalog yet
   (Marketing Service, Graphic Design, Photography, Video Editing,
   Branding, and whatever comes after). New item types are a new string
   value, never a schema change.
3. **Customer View vs Internal View** — unchanged from the original
   plan (one record, permission-shaped DTO), with Commercial Information
   added explicitly to the never-shown-to-customer list (ties to
   decision 4 — there is no commercial data on `Quotation` to
   accidentally leak, but the DTO-shaping function documents the
   exclusion explicitly rather than by omission).
4. **Commercial Separation** — confirmed, not changed: `Quotation`'s
   Phase-1 pricing fields (`subtotal`/`discountPercent`/`vatOn`/
   `vatAmount`/`finalTotal`) are this *specific quotation's* figures,
   never the partner's general commercial terms (credit limit, price
   tier, payment terms — M6's `PartnerCommercialProfile`). Nothing in
   this plan reads from or writes to `PartnerCommercialProfile`; a
   future Pricing Engine is the one allowed to read it.
5. **Approval Architecture** — the approval enum is aligned to the
   exact example given, not the earlier draft's 4-value version:
   `QuotationApprovalState { PENDING, APPROVED, NEEDS_REVISION }`,
   default `PENDING`, entirely independent of `QuotationStatus`. A
   dedicated `PUT /api/quotations/:id/approval` endpoint, same
   "one entry point changes this field" shape as status.
6. **Versioning** — confirmed, not changed: new version = new
   `Quotation` row, `previousVersionId` self-reference,
   `quotationNumber` and `id` independent per version, nothing ever
   overwritten. A future Timeline reconstructs full history via
   `partnerId` (all versions share the same partner) plus the
   `previousVersionId` chain for version-specific lineage.
7. **Future Portal Compatibility** — the permission-shaped DTO function
   (decision 3) is written to take an explicit capability input (e.g.
   "does this viewer have Internal View access"), not to read
   `req.auth.staffId`/branch assumptions directly — so a future
   Customer Portal or mobile client can call the exact same mapping
   function with a different capability source, not a rewritten one.
8. **Multi View Compatibility** — confirmed, not changed: `Side
   View`/`Workspace Tabs` are not built this milestone;
   `QuotationDetail` is still built as a self-contained,
   presentation-independent component per the original plan.
9. **Future Production Flow** — confirmed compatible, not built: the
   service-layer-only status machine (decision 1) and the fact that
   `Quotation.convertedOrderId` already exists as a schema anchor (Phase
   1) mean a future Order/Design/Production pipeline attaches without
   restructuring `Quotation` itself.
10. **CRM Integration** — confirmed, not changed: `Quotation.partnerId`
    is already a real FK (Phase 1), and every `recordAudit()` call in
    this plan passes `partnerId` (the pre-M6 Timeline convention) — a
    future CRM/Sales-Funnel/Reminder feature queries `Quotation`/
    `AuditLog` directly by `partnerId`, no duplicated quotation data
    anywhere.
11. **API First** — every rule above that says "service layer only" is
    this principle applied concretely: item-type validation, status
    transition legality, approval transition legality, and view-shaping
    are all server-side (Zod + service checks), never duplicated or
    re-decided in the frontend.
12. **Continue** — this plan proceeds directly to Milestone 1
    implementation after this update, per this instruction.

## Schema Changes (additive only, per the Migration Safety Rule)

### `Quotation` — new fields

```
customerNotes   String?
internalNotes   String?
approvalState   QuotationApprovalState @default(PENDING)
version         Int      @default(1)
previousVersionId String? @unique @db.Uuid
previousVersion   Quotation? @relation("QuotationVersionChain", fields: [previousVersionId], references: [id])
nextVersion       Quotation? @relation("QuotationVersionChain")
```

New enum (aligned to the approved example exactly — decision 5):

```
enum QuotationApprovalState {
  PENDING
  APPROVED
  NEEDS_REVISION
}
```

No change to `QuotationStatus` — reused as-is (01_ANALYSIS.md's
Workflow Engine note: kept isolated behind the service layer).

### `QuotationItem` — new fields

```
itemType        String
quantity        Int
size            String?
notes           String?
description     String?
readyProductId  String? @db.Uuid
readyProduct    ReadyProduct? @relation(fields: [readyProductId], references: [id])
serviceId       String? @db.Uuid
service         Service?      @relation(fields: [serviceId], references: [id])
```

`itemType` (decision 2, Product Type Agnostic) is a plain `String`, not
a Prisma enum — the explicit, self-documenting discriminator for what
kind of thing this line item represents (`READY_PRODUCT`, `SERVICE`,
`CUSTOM` today; `GRAPHIC_DESIGN`, `PHOTOGRAPHY`, `VIDEO_EDITING`,
`BRANDING`, or any future module's own type tomorrow — all zero-migration,
same extensibility as `OrderItem.kind`).

`kind`, `modelName`, `breakdown` are **not touched** — left exactly as
Phase 1 defined them, unpopulated by this milestone, reserved for the
future Pricing Engine.

**Validation, not a DB constraint**: `itemType` determines which of
`readyProductId`/`serviceId`/`description` is required (`READY_PRODUCT`
→ `readyProductId`; `SERVICE` → `serviceId`; anything else → 
`description`) — enforced in the service layer (Zod + a service-level
check), matching how FEATURE-002's category/tag exclusivity rules were
enforced in services rather than as a DB CHECK constraint.

### `ReadyProduct` / `Service` — new back-relations only

`quotationItems QuotationItem[]` added to both, for the new FKs above.
No other change to either model.

### Migration safety

Purely additive: two `ALTER TABLE ... ADD COLUMN` sets, one
`CREATE TYPE`, two new FKs, one new self-referencing FK. No
`DROP`/`DELETE`. Reviewed before applying, per the Migration Safety
Rule, exactly like every FEATURE-002 migration this session.

## API Endpoints

Top-level resource — **not** nested under `/api/partners/:id`, since a
Quotation *references* a partner but is not owned/scoped by it the way
Contacts/Addresses/Notes are (01_ANALYSIS.md's Service Boundaries note):

- `GET /api/quotations` — list (filterable by `partnerId`, `status`),
  `quotations.view`.
- `GET /api/quotations/:id` — detail, `quotations.view`. Response is
  permission-shaped: Internal-only fields (cost/margin/internal notes —
  none populated yet in this milestone besides `internalNotes` itself)
  are included only if the caller's grants pass the same
  DTO-mapping-level check pattern M6 established.
- `POST /api/quotations` — create (with nested items), `quotations.create`.
- `PUT /api/quotations/:id` — update core fields + full item
  replace-set (mirroring how M4's `setPartnerTags` replaces a whole set
  in one call, not per-item CRUD, since items are always edited together
  as part of one quotation edit), `quotations.edit`.
- `POST /api/quotations/:id/versions` — create a new version (copies the
  current quotation + items into a new row, links `previousVersionId`),
  `quotations.edit`.
- `PUT /api/quotations/:id/status` — status transition (dedicated
  endpoint, not folded into the general update — same "only one entry
  point may change the exclusivity/lifecycle field" pattern as M2's
  Set Primary / M3's Set Default / M5's Pin), `quotations.edit`.
- `PUT /api/quotations/:id/approval` — approval-state transition,
  same dedicated-endpoint pattern, `quotations.edit`.
- `DELETE /api/quotations/:id` — soft delete (ADR 0007 — `Quotation`
  already has the triad from Phase 1), `quotations.delete`.

Attachments reuse the existing polymorphic `Attachment` model — no new
attachment-specific endpoints beyond what a generic
`/api/attachments`-style upload path needs, which is itself a
cross-cutting concern (used by Partners, Orders, Work Orders, and now
Quotations alike) rather than something to build Quotation-specific.
**If no generic attachment upload endpoint exists yet, this milestone
adds the minimum one** (upload + list + delete, scoped by whichever
parent id is provided), not a Quotation-only variant.

## Audit Logging

Reuses existing generic actions (`CREATE`/`UPDATE`/`DELETE`/
`STATUS_CHANGE`) with `entityType: 'Quotation'`, matching the M2/M3
convention (not M4's per-entity-name exception — no explicit
per-action-name list was given this time). One new value is needed:

- `APPROVAL_CHANGED` — a relationship/state change distinct from
  `STATUS_CHANGE`, same rationale as `PRIMARY_CHANGED`/`DEFAULT_CHANGED`/
  `CATEGORY_CHANGED`/`PIN`/`UNPIN`: "who approved this and when" should
  stay independently queryable from the customer-facing status.

Every `recordAudit()` call here passes `partnerId` (the referenced
Business Partner), continuing the Timeline-readiness convention
established ahead of M6 — a Quotation's activity becomes part of its
customer's future Timeline automatically.

## Frontend

- `QuotationsPage.tsx` — list, mirroring `PartnersPage.tsx`'s
  directory/quick-create pattern.
- `QuotationDetail.tsx` — the single component for view/edit, built
  **decoupled from full-page routing** per 01_ANALYSIS.md's Multi View
  System note, so it can be reused inside a Side Panel/Modal/Tab later
  without rewrite. Rendered today via a plain full-page route
  (`/quotations/:id`), matching every other feature's current pattern.
- Item editor: a repeatable row component (add/remove items), each row
  choosing Product / Service / Custom and showing quantity/size/notes —
  reusing `<select>`/`<input>` patterns already established in
  `ContactsTab`/`AddressesTab`/`NotesTab`, not a new form paradigm.
- View is permission-shaped client-side the same way the Commercial tab
  is (fields conditionally rendered), backed by the server already
  omitting Internal-only fields for a caller without them — never
  relying on hiding fields in the UI alone.

## Explicitly Deferred (not built this milestone)

- Pricing calculation, paper optimization, `breakdown` population.
- Order conversion (`POST /api/quotations/:id/convert` /
  `quotations.convert`).
- Production workflow / Work Orders.
- Customer Portal.
- Generic Workflow Engine (template CRUD, configurable stages).
- Generic Multi View System host (Side Panel/Modal/New Tab
  infrastructure) — `QuotationDetail` is built ready for it, the host
  itself is not built.
- Approval-requirement business rules (when approval is required, who
  may approve) — the field exists and is settable, but no rule forces
  its use yet.

## Verification Plan

Same standard as every FEATURE-002 milestone this session: `prisma
format`/`validate`/`generate`, review generated migration SQL before
applying (additive only), typecheck/lint/build across `shared`/`api`/
`web`, then live verification against the running dev environment —
create a partner, create a quotation with multiple items (a
`ReadyProduct`-linked item, a `Service`-linked item, and a custom
item), create a new version, transition status, transition approval
state, confirm audit entries (including `partnerId` wiring), confirm
the Internal-only fields are actually absent from a response shaped for
a caller without the relevant grant (not just hidden in the UI), then
clean up test data.

## Milestone Breakdown

Given the size, this plan is itself split into two implementation
milestones under FEATURE-003, matching the Feature Development
Standard's own guidance (small, independently verifiable slices):

- **M1 — Quotation Foundation** (this plan): schema extension, CRUD +
  status/approval/versioning endpoints, list + detail/edit UI, audit
  logging. No pricing, no conversion, no generic Workflow Engine.
- **M2+ (future, not this plan)**: Pricing Engine, Paper Calculator,
  Order conversion, Production Workflow, Customer Portal — each its own
  future FEATURE, consuming this foundation without changing it, per
  00_REQUIREMENTS.md §1.

**This document proposes M1 only, and stops here for approval before
implementation begins**, per MASTER_PROMPT.md Step 5 ("If the change is
large, STOP and wait for approval. Do not implement until approved.").

---

# Milestone 2 — Order Conversion Plan

**Status: Approved.** Ten architectural decisions were given ahead of
this milestone, with an explicit instruction to proceed directly to
implementation (no separate approval round this time — contrast with
M1, where the plan alone was submitted and approval was requested
before writing code). Recorded verbatim below, each with where it's
applied in this plan; see 01_ANALYSIS.md's Milestone 2 section for the
schema/ADR groundwork each decision builds on.

## Decisions (applied throughout this plan)

1. **Quotation is not Printing-only** — unchanged from M1's `itemType`
   design; conversion doesn't add any printing-specific field to
   `Order`/`OrderItem` either. `OrderItem.breakdown` stores whatever
   JSON shape the source `QuotationItem` had, generically.
2. **Production Workflow starts after Order** — conversion creates the
   `Order` row and stops. `WorkOrder` (Phase 8, still schema-only) is
   untouched by this milestone; nothing here decides or references
   production status.
3. **Workflow Engine Ready** — `convertQuotationToOrder` lives in
   `quotationService.ts`, called from one controller endpoint
   (`POST /:id/convert`). No route/controller/frontend code duplicates
   the `status === 'ACCEPTED' && !convertedOrderId` guard.
4. **Customer Journey** — the new Order's audit `CREATE` entry carries
   `partnerId` (same convention as every Quotation audit call since
   pre-M6). No new timeline/history table.
5. **Customer View** — `mapOrderToDto(record, canSeeInternal)` mirrors
   `mapQuotationToDto` exactly; `internalNotes` forced to `null` when
   `canSeeInternal` is false, same "one DTO, shaped by value" pattern.
6. **Side View Ready** — the new "Convert to Order" control and Order
   summary are added to the existing, already presentation-independent
   `QuotationDetail` component (props only, no `useParams`, no page
   chrome) — no new page, no new route.
7. **Pricing Engine** — conversion copies `subtotal`/`discountPercent`/
   `vatOn`/`vatAmount`/`finalTotal` verbatim; nothing is computed. The
   `recalculate` flag ADR 0010 anticipated is not implemented (deferred
   — 00_REQUIREMENTS.md §14).
8. **Order Conversion (snapshot)** — `OrderItem.kind`/`modelName`/
   `breakdown` are populated from each `QuotationItem` at the moment of
   conversion; nothing in `OrderItem` references `QuotationItem` by FK.
   Editing or deleting the original Quotation item after conversion
   cannot change the Order.
9. **Attachments** — `Attachment.category String?` added (additive,
   nullable). No upload/download endpoint exists for any entity yet, so
   this milestone only adds the field, not a feature.
10. **Continue** — implementation proceeds directly below.

## Database

- `Attachment.category String?` — the only schema change. Additive,
  nullable, no default needed, no backfill (existing rows simply have
  `null`, meaning "uncategorized").
- Everything else (`Order`, `OrderItem`, `Quotation.convertedOrderId`,
  `QuotationStatus.CONVERTED`, `DocumentType.INVOICE`) already exists
  from Phase 1 — confirmed in 01_ANALYSIS.md, not assumed.

## API

- `POST /api/quotations/:id/convert` — `quotations.convert` permission
  (already seeded). No request body. Conversion *is* the
  `ACCEPTED → CONVERTED` transition, so it reuses
  `assertLegalStatusTransition`/`IllegalStatusTransitionError` unchanged
  — `400 { code: 'ILLEGAL_STATUS_TRANSITION' }` for both "not yet
  accepted" and "already converted" (the latter falls out for free:
  `LEGAL_STATUS_TRANSITIONS['CONVERTED']` is `[]`, so re-converting an
  already-`CONVERTED` quotation is already illegal — no separate
  `convertedOrderId` check or error code needed). Returns the created
  Order DTO, `201`.
- `GET /api/orders/:id` — `orders.view` permission (already seeded).
  Returns `mapOrderToDto`. `404` if missing/soft-deleted.
- No `GET /api/orders` list, no create/edit/delete — explicitly out of
  scope (00_REQUIREMENTS.md §14).

## Frontend

- `QuotationDetail`'s `QuotationLifecycle` sub-component gains a
  "Convert to Order" button, shown only when `status === 'ACCEPTED'`
  and `convertedOrderId` is null. On success, refetches the Quotation
  (now `CONVERTED`, with `convertedOrderId` set) and fetches+displays
  the Order summary (invoice number, status, total, date) inline —
  read-only, no edit affordance (there's no Order edit endpoint).

## Business Rules

- Convert requires `status === 'ACCEPTED'` and `convertedOrderId ===
  null` — both enforced service-side, not just by hiding the button.
- Conversion is one atomic transaction: reserve the invoice number,
  create `Order` + `OrderItem[]`, update the `Quotation`
  (`status = CONVERTED`, `convertedOrderId`). Either all of it commits
  or none of it does.
- `Order.staffId` = the Quotation's own `staffId` (see 01_ANALYSIS.md's
  Open Decision), not the converting user.
- `Order.status` is set to `CONFIRMED` at creation (ADR 0010's own
  worked example).
- No audit entry for a rejected conversion attempt (nothing happened —
  same precedent as `IllegalStatusTransitionError` elsewhere in this
  feature).

## Verification Plan

Same standard as M1: typecheck/lint/build across `shared`/`api`/`web`,
then live verification against the dev environment — accept a real
quotation, convert it, confirm the resulting Order's fields match the
frozen snapshot, confirm re-converting is rejected, confirm converting
a non-`ACCEPTED` quotation is rejected, confirm the Order's audit
`CREATE` entry carries the same `partnerId` as the Quotation's own
entries, clean up test data afterward.
