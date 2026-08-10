# FEATURE-006 — Document Templates & Printing — Plan

## Note on Scope (read before the milestone table)

The requirements revision pulled in three capabilities that are, in
isolation, their own domain — Direct Order creation, Payment recording,
and Treasury — because the Invoice document is meaningless without them
("integrate with Treasury/Cash rather than being only a visual number").
`01_ANALYSIS.md` §8 found these need **no schema change at all** (the
data model already anticipated them: `TreasurySourceType.INVOICE_PAYMENT`
already exists, unused; `orders.*`/`treasury.*` permissions are already
seeded, unused) — so the actual implementation cost is service/
controller/route/UI work, not a second migration. Given that, this plan
keeps everything under **one feature, FEATURE-006**, organized into two
parts so the two concerns stay legible:

- **Part A — Financial Foundation** (M1–M4): the minimum real Order/
  Payment/Treasury plumbing the Invoice document needs to be honest.
- **Part B — Document Rendering** (M5–M11): the template/renderer
  architecture and the three document types.

If you'd prefer Part A tracked as its own feature folder (since Treasury
in particular is a real, standalone capability), say so and it becomes
FEATURE-007 with FEATURE-006 depending on it — noted as an open call in
the Decisions section below, not decided unilaterally here.

```
Part A — Financial Foundation
M1  Schema (DocumentTemplate + Setting identity + doc-override/snapshot
    fields — Part A needs none, but ships in the same migration as Part B)
M2  Direct Order/Invoice creation (POST /api/orders, no Quotation required)
M3  Payments (POST /api/orders/:id/payments) + automatic Treasury posting
M4  Treasury as a first-class module (manual entries, balance, nav entry)

Part B — Document Rendering
M5  Template service/controller/routes + versioning + set-default
M6  Settings UI: "إعدادات المستندات"
M7  Reusable DocumentRenderer + snapshot resolver + print CSS + RTL
M8  Quotation document (multi-template picker + one-time overrides)
M9  Invoice document (now backed by real M2/M3 data)
M10 Work Order document
M11 (optional, decision needed) Customer Profile financial tabs
```

Sequencing note: M1's migration is written once, covering both Parts —
splitting it into two migrations would be artificial since none of the
new columns depend on each other. M2–M4 (Part A) can be implemented and
verified independently of M5+ (Part B); M9 (Invoice document) is the one
milestone that structurally depends on Part A being done first, since
it's the milestone that makes "paid/remaining" genuinely real.

---

## Milestone 1 — Schema

**`packages/shared` new enum**: `documentTypeSchema = z.enum(['QUOTATION', 'INVOICE', 'WORK_ORDER'])`.

**`apps/api/prisma/schema.prisma`**:

```prisma
model DocumentTemplate {
  id           String       @id @default(uuid()) @db.Uuid
  documentType DocumentType
  name         String
  /// Header/footer/sections/terms/signature toggles, business-info
  /// presentation — flexible, same precedent as StageInstance.variableValues.
  config       Json

  isDefault Boolean @default(false)

  version           Int               @default(1)
  previousVersionId String?           @unique @db.Uuid
  previousVersion   DocumentTemplate? @relation("DocumentTemplateVersionChain", fields: [previousVersionId], references: [id])
  nextVersion       DocumentTemplate? @relation("DocumentTemplateVersionChain")
  publishedAt       DateTime?

  quotations Quotation[]
  orders     Order[]
  workOrders WorkOrder[]

  isDeleted Boolean   @default(false)
  deletedAt DateTime?
  deletedBy String?   @db.Uuid

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isDeleted])
  @@index([documentType])
}

enum DocumentType {
  QUOTATION
  INVOICE
  WORK_ORDER
}
```

**`Quotation`/`Order`/`WorkOrder`** each gain three nullable columns
(corrected per `01_ANALYSIS.md` §10):

```prisma
documentTemplateId String?           @db.Uuid
documentTemplate   DocumentTemplate? @relation(fields: [documentTemplateId], references: [id])
/// One-time, document-only presentation overrides. Never written back to
/// Setting or to the DocumentTemplate row.
documentOverrides  Json?
/// The fully resolved, frozen render configuration — Setting ⊕ template
/// config ⊕ documentOverrides — captured once at first print, reused on
/// every later print regardless of subsequent Settings/template edits.
documentSnapshot   Json?
```

**`Setting`** gains (all nullable, additive):

```prisma
businessNameAr           String?
businessNameEn           String?
address                  String?
phone                    String?
email                    String?
website                  String?
taxNumber                String?
commercialRegisterNumber String?
```

**Database Checklist** (new table only — `DocumentTemplate`): migration
created; soft delete reviewed (triad + the delete-protection rule from
`01_ANALYSIS.md`, enforced in M5's service layer, application-level like
`SizeFamily`'s protected sizes); audit reviewed (reuse generic
CREATE/UPDATE/DELETE with `entityType: 'DocumentTemplate'`); permissions
reviewed (reuse `settings.view`/`settings.edit` — no new module); RLS
enabled + `backend_only_deny_direct_access` policy created (mandatory);
verification completed below.

**Verification**: migration applies cleanly; existing `Setting`/
`Quotation`/`Order`/`WorkOrder` rows unaffected (new columns read back
`null`); RLS + deny policy present on `DocumentTemplate`; full-repo
`typecheck`/`build`.

---

## Milestone 2 — Direct Order/Invoice Creation

**Scope**: Requirement 5, "Direct Customer → Order/Invoice Flow."

**Backend**: `orderService.ts` gains `createOrder` (mirrors
`convertQuotationToOrder`'s numbering/snapshot shape — reserves the next
invoice number via `nextInvoiceNumber`, creates `Order`+`OrderItem[]` in
one transaction — but with no source `Quotation`, `quotationOriginId`
stays null). `controllers/orders.ts` gains `createOrderHandler`.
`routes/orders.ts` gains `POST /` gated on the already-seeded
`orders.create` permission (zero catalog change — confirmed in
`01_ANALYSIS.md` §8). `packages/shared/src/schemas/order.ts` gains
`createOrderSchema` (same shape as `createQuotationSchema`, since order
items still carry caller-supplied totals until the Pricing Engine
exists — no different in kind from how Quotations are created today).

**Frontend**: a minimal "New Invoice" entry point — the smallest form
that reuses `QuotationForm`'s existing item-entry pattern
(`QuotationDetail.tsx`) rather than duplicating it; exact placement
(new route vs. reusing/adapting `QuotationDetail.tsx` for a
Quotation-less mode) decided at implementation time, not invented here.

**Verification**: create an Order with no Quotation; confirm sequential
`invoiceNumber`, confirm `quotationOriginId: null`, confirm it's
structurally identical to a conversion-created Order in every other
respect (live cross-check against an existing conversion-created Order).

---

## Milestone 3 — Payments + Automatic Treasury Posting

**Scope**: Requirement 6.

**Backend**: `orderService.ts` gains `recordPayment(orderId, { method,
amount })` — **one transaction** that creates the `Payment` row **and**
its linked `TreasuryEntry` (`type: INCOME`, `sourceType:
INVOICE_PAYMENT`, `orderId`, `paymentId`, `partnerId` from the order,
`staffId` from the authenticated caller) — never two separate writes a
caller could invoke independently, so a payment can never exist without
its Treasury entry or vice versa. Remaining balance is a computed value
(`finalTotal - Σ payments`), never stored. `controllers/orders.ts`/
`routes/orders.ts` gain `POST /:id/payments` (reuses `orders.edit`,
already seeded). `packages/shared/src/schemas/payment.ts` (new) —
`createPaymentSchema`.

**Frontend**: a payment-recording action on the Invoice document view
(M9) — record a deposit, see remaining balance update, record the final
payment later.

**Verification**: the 5,000/2,000/3,000 example from the requirements,
run for real — record a 2,000 deposit, confirm remaining computes to
3,000 and exactly one `TreasuryEntry` (`INVOICE_PAYMENT`) exists; record
the final 3,000, confirm remaining is 0 and a second, independent
`TreasuryEntry` exists; confirm recording a payment against a
Quotation-less Order works identically (no quotation required, per the
explicit constraint).

---

## Milestone 4 — Treasury as a First-Class Module

**Scope**: Requirement 7.

**Backend**: `apps/api/src/services/treasuryService.ts` — manual
income/expense/transfer entry CRUD (`sourceType: MANUAL`), a current-
balance/by-method aggregate. `controllers/treasuryEntries.ts` +
`routes/treasuryEntries.ts`, gated on the already-seeded `treasury.*`
permissions (zero catalog change).

**Frontend**: `apps/web/src/pages/treasury/` (new) — list + filter +
manual-entry form; `AppShell.tsx` gains a "الخزينة والنقدية" nav entry,
matching the requirement's explicit "clearly visible in the main
navigation" instruction — not nested under Settings, not inside an
Order.

**Verification**: manual entries round-trip; balance aggregate matches a
hand sum; M3's auto-posted payment entries appear in this same list
(`sourceType: INVOICE_PAYMENT`) without any manual step, confirming the
"automatic, never a second step" requirement end to end.

---

## Milestone 5 — Template Service/Controller/Routes

*(Unchanged from the original plan — see prior revision for full detail;
summarized here for continuity.)*

`documentTemplateService.ts` — create/version/set-default (generalizing
`partnerChildEntity.ts`'s exclusivity-lock pattern per
`01_ANALYSIS.md`'s recommendation) / delete-protection (`409` if any
document's `documentTemplateId` references it). Controller/routes reuse
`settings.view`/`settings.edit`.

**Verification**: version chain behaves like `WorkflowTemplate`'s
(old version's `id` still resolves after a new version publishes); exactly
one default per `documentType` under concurrent set-default calls;
delete blocked when referenced.

---

## Milestone 6 — Settings UI: "إعدادات المستندات"

**Scope**: Requirement 11 (renamed/expanded from the original plan's
"نماذج المستندات" — now explicitly covers business identity + logo +
templates + default terms/footer + numbering settings in one place, per
the revised requirement wording).

**Frontend**: new Settings category (`categories.ts`), covering: business
identity + logo (the new `Setting` fields from M1), Quotation templates
(list/add/edit/duplicate/set-default/preview/activate-deactivate),
Invoice template (single default, same edit form), Work Order template
(same), default terms/footer if modeled as their own `config` keys
rather than requiring a full template edit for a trivial text change
(implementation-time UX call, not a schema question).

**Verification**: live — business identity fields save and reload;
Quotation template CRUD round-trip through the UI; RTL check.

---

## Milestone 7 — Reusable DocumentRenderer + Snapshot Resolver + Print CSS + RTL

**Scope**: Requirements 10, 12, 13, and the corrected snapshot design
from `01_ANALYSIS.md` §10.

**Frontend**: `apps/web/src/lib/documents/` —
- `resolveDocumentSnapshot(setting, template, overrides)` — pure
  function, the literal implementation of the Global Settings → Template
  → Overrides merge hierarchy from `00_REQUIREMENTS.md`'s
  "Document-Level One-Time Overrides" section. Called once, at first
  print, output persisted to `documentSnapshot` (a small backend
  endpoint, `PUT .../:id/document-snapshot`, or folded into the print
  action's own request — decided at implementation time).
- `DocumentRenderer.tsx` — the one component every document type calls,
  reading a **persisted** `documentSnapshot` once one exists (never
  re-resolving live on every render, per the frozen-snapshot rule) or
  the live-resolved value as a preview-before-first-print convenience.
- One shared print stylesheet (`@media print`, hides app chrome, shows
  only the mounted document) — not duplicated per document type,
  correcting the legacy system's own documented weakness of four
  independently duplicated inline `<style>` blocks.
- Print/Preview: `window.print()` for Print (browser-native, no PDF
  library); Preview renders the identical `<DocumentRenderer>`,
  guaranteeing preview = print output by construction.
- RTL: inherits the app's global `dir="rtl"`; numbers/dates/document
  numbers/phone numbers wrapped in `dir="ltr"` spans, the same documented
  exception pattern FEATURE-005 already established.

**Verification**: `resolveDocumentSnapshot` unit-tested (Setting-only,
Setting+template, Setting+template+overrides — confirm override keys win,
confirm untouched keys fall through correctly); print CSS hides chrome
in a live browser check; RTL/LTR-exception rendering confirmed visually.

---

## Milestone 8 — Quotation Document

**Scope**: Requirements 1–4 (Quotation half).

**Frontend**: `QuotationDetail.tsx` gains a template picker ("اختيار
نموذج العرض," M5's list endpoint, Quotation-type templates only), an
overrides editor (title/notes/terms/footer/section-visibility/business-
identity-presentation — a form over `documentOverrides`' own shape,
mirroring `config`'s field set so the override editor and the template
editor share the same field list, not two different ones), and Print/
Preview actions. Item fields render strictly from what
`01_ANALYSIS.md` confirmed exists — no invented `unitPrice`/`unit`.

**Verification**: two+ templates produce visibly different output for
the same Quotation; setting an override changes only that one document,
confirmed by checking a second Quotation using the same template is
unaffected; printing freezes `documentSnapshot`; a subsequent Settings
edit (e.g. changing the business phone number) does **not** change the
already-printed Quotation's re-rendered output — the single most
important test in this milestone, since it's the one the entire
snapshot design exists to satisfy.

---

## Milestone 9 — Invoice Document

**Scope**: Requirements 1–2, 5–7 (Invoice half) — this is the milestone
that makes Part A's work visible. Depends on M2 (direct creation) and M3
(payments) for real data, and M7 (renderer) for rendering.

**Frontend**: `apps/web/src/pages/orders/OrderDocumentPage.tsx` — loads
an Order (reachable both from `QuotationDetail.tsx`'s existing
conversion summary and from M2's new direct-creation flow), renders via
`DocumentRenderer` with the Invoice template, shows paid/remaining
computed from real `Payment[]` (M3), hosts M3's payment-recording action,
Print/Preview.

**Verification**: print an Order created via Quotation conversion **and**
one created directly (M2) — confirm both render correctly, confirm
paid/remaining reflects real M3 payments, confirm the 5,000/2,000/3,000
example prints correctly at each stage (before/after deposit, after
final payment).

---

## Milestone 10 — Work Order Document

**Scope**: Requirement 1 (Work Order half).

**Frontend**: a Print/Preview entry point from `ProductionBoardPage.tsx`/
`WorkOrderTimelinePage.tsx`, rendering `WorkOrder` + `workflowInstance`
via `DocumentRenderer`. Only real fields — paper/colors/numbering-range
show only if present in `OrderItem.breakdown` (currently empty),
department/stage from `workflowInstance` (real), external-supplier info
from `StageInstance` (real). No QR code (explicitly deferred, per the
original plan — unchanged).

**Verification**: print a Work Order; confirm internal-only fields never
leak onto a customer-configured template variant; confirm External
Supplier info renders only when a stage is actually external.

---

## Milestone 11 (Decision Needed) — Customer Profile Financial Tabs

**Scope**: Requirement 8. **Not committed to this plan's milestone
sequence** — flagged as a decision point rather than assumed in scope,
since `MASTER_PRODUCT_REVIEW.md` already scopes this identically under
its own P0.5. Two options:

- **(A) Build it here**, once M2/M3 make Orders/Payments real — two new
  tabs on `PartnerProfilePage.tsx` (Quotations & Invoices list,
  Financial Summary), reading existing `partnerId`-indexed data, no new
  backend beyond a small aggregate endpoint.
- **(B) Defer to `MASTER_PRODUCT_REVIEW.md` P0.5** as its own,
  separately-scheduled item, once FEATURE-006 closes.

**Recommendation: (A)**, since M2/M3 will have already made this data
real and worth showing — doing it as one more milestone here is
cheaper than reopening this feature's context later — but this is your
call, not assumed.

---

## Explicit Non-Goals

No PDF-generation library. No change to pricing/calculation logic. No
QR/barcode. No full Order module (list/edit/delete — only create +
payment-record). No customer-facing delivery (email/WhatsApp/portal). No
new permission module (every permission this feature needs is already
seeded). If implementation discovers one of these is actually required,
that is a stop-and-ask moment, not a silent scope expansion.

---

## Report

1. **Existing models/UI**: fully inspected — Quotation/Order/WorkOrder
   models solid, zero UI for Order/Invoice/WorkOrder printing today
   (`01_ANALYSIS.md` §1–7).
2. **Numbering**: fully reusable, zero changes (§1–7, ADR 0008).
3. **Logo/business settings**: logo exists, business identity does not —
   added in M1.
4. **Print/PDF**: none exists; browser-native approach per your
   instruction.
5. **Template architecture**: none exists; `WorkflowTemplate`'s
   versioning shape is the reusable precedent.
6. **Historical/versioning**: corrected in this revision — a persisted
   `documentSnapshot`, not a live recomputation, is required once
   mutable `Setting` business-identity fields are in the picture (§10).
7. **Payments/Treasury data readiness**: **no schema change needed** —
   `TreasurySourceType.INVOICE_PAYMENT` and the full `orders.*`/
   `treasury.*` permission set already exist, unused, in anticipation of
   exactly this work (§8).
8. **Schema/migration required overall**: **yes**, additive only — one
   new `DocumentTemplate` table, three nullable columns each on
   `Quotation`/`Order`/`WorkOrder` (`documentTemplateId`,
   `documentOverrides`, `documentSnapshot`), eight nullable `Setting`
   columns. No existing data affected.

## Decisions Needed From You

1. **Should Part A (M2–M4: Order creation, Payments, Treasury) become
   its own feature (FEATURE-007) that FEATURE-006 depends on**, or stay
   inside FEATURE-006 as planned above? Both are viable; this plan
   defaults to keeping them together since you directed all of this in
   one message.
2. **Template selection timing** — print time (recommended) vs. creation
   time.
3. **Snapshot re-resolution trigger** — automatic on override/template
   edit (recommended) vs. an explicit separate "re-generate" action.
4. **`setExclusiveDefault` generalization** vs. a parallel implementation
   for `DocumentTemplate`'s default-per-type rule.
5. **Milestone 11 (Customer Profile tabs)** — build now (recommended) or
   defer to `MASTER_PRODUCT_REVIEW.md` P0.5.
6. **Logo upload** — confirm whether an upload endpoint already exists
   before M1/M6 commit to "URL field only."

**Waiting for approval before implementation.**
