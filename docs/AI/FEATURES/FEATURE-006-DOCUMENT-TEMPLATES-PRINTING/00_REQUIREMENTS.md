# FEATURE-006 — Document Templates & Printing — Requirements

**Revision note**: this document was expanded after the initial pass to
incorporate mandatory business requirements the user added before
implementation started — most significantly, document-level one-time
overrides (§4 below) and a financial foundation (direct Order/Invoice
creation, deposits/payments, Treasury as a first-class module) that the
Invoice document genuinely needs in order to show real, not merely
visual, paid/remaining amounts. See `02_PLAN.md`'s note on scope for how
this changes the milestone breakdown.

## Context

Cleopatra ERP can create Quotations (FEATURE-003) and, via conversion,
Orders/Invoices (FEATURE-003 M2), and can generate Work Orders on the
production side (FEATURE-004). None of the three can currently be
printed, previewed, or handed to a customer — there is no print layout,
no PDF flow, no business-identity/logo configuration beyond a bare
`logoUrl` string, and no concept of a document template anywhere in the
codebase (confirmed by inspection, see `01_ANALYSIS.md`). Separately,
there is no way to create an Order without first creating a Quotation, no
way to record a payment against an Order at all, and Treasury has a
complete database schema and zero application code — meaning an Invoice
document's "paid/remaining" fields would otherwise be fiction. This
feature builds the document-rendering capability **and** the minimum real
financial plumbing (Order creation, payments, Treasury) the Invoice
document depends on to be honest, not decorative.

## Requirements

### 1. Document Types

Printable documents for Quotation (عرض سعر), Invoice (فاتورة), and Work
Order (أمر تشغيل) — all three with a proper printable view and browser
print support. The result must read as a real, professional business
document — not a screenshot of an app screen.

### 2. Document Content

Where applicable and where the underlying data actually exists: business
logo, business name, address, phone, email, tax/commercial information
(if configured), document number, document date, customer information,
items/services, quantity, unit, unit price (when available), total,
discount (when applicable), VAT/tax (when applicable), final total,
paid/deposit amount (where applicable), remaining balance, notes, terms
& conditions, signature/approval areas (where appropriate). **No
fabricated fields** — see `01_ANALYSIS.md` for the exact field-by-field
data-availability audit; anything genuinely missing is additive schema/
Settings work, documented explicitly, never invented at render time.

### 3. Multiple Document Templates

Quotations specifically must support more than one template (e.g.
Standard / Premium / Special Design), selectable at creation/print time.
The same template architecture must be reusable for Invoice and Work
Order templates later, even though those two ship with one configured
default template for now. Templates are versioned; a historical document
stays tied to the exact template **version** used when it was created —
never silently re-rendered under a template that has since changed.

### 4. Document-Level One-Time Overrides

A single Quotation/Invoice/Work Order must be customizable — different
title, notes, terms, footer text, section visibility, business-identity
presentation, or template choice — **without** touching global Settings
or the default template, and without affecting any other document. See
the dedicated "Document-Level One-Time Overrides" section below for the
full resolution model.

### 5. Quotation Is Not Required for Every Customer

The real workflow is not always Customer → Quotation → Order → Invoice.
A customer may walk in and request work directly — Invoice/Order created
with no Quotation at all. Both paths (Quotation-first and direct) must
be fully supported end to end, not just tolerated as an edge case. See
the dedicated "Direct Customer → Order/Invoice Flow" section below.

### 6. Deposit / Payment Flow

The system must support creating an invoice directly, recording a
deposit at order time, recording additional payments later, computing
the remaining balance, and recording the final payment on delivery — the
standard 5,000 total / 2,000 deposit / 3,000 remaining → fully paid
example. This is **transactional data, not a typed-in display number** —
every payment must be a real, persisted record that also posts to
Treasury (§7).

### 7. Treasury / Cash

A real, first-class "الخزينة والنقدية" area, visible in the main
navigation — not folded into an invoice screen. At minimum: incoming
money (وارد), outgoing money (منصرف), customer payments/deposits,
supplier payments, other expenses, other income, current cash balance,
transaction history with date/description/related customer-order-invoice
where applicable. Customer deposits and final payments must **automatically**
create the matching incoming Treasury transaction — never a second,
manual step. Recording a payment must never require a Quotation to exist.

### 8. Customer Profile

Prepare the architecture so a customer's profile can show Quotations,
Orders, Invoices, Payments, outstanding balance, and payment history —
at minimum ensuring nothing built in this feature blocks that view; see
`02_PLAN.md`'s decision point on whether to build the actual tabs now or
defer them (`MASTER_PRODUCT_REVIEW.md`'s P0.5 already scopes this
separately). Arabic throughout, no exceptions without a stated technical
reason.

### 9. Document Numbering

Quotation, Invoice, and Work Order numbers follow the existing
`DocumentSequence`/ADR 0008 mechanism exactly — no second numbering
system. The number must appear prominently on the printed document.

### 10. Printing UX

Obvious actions — طباعة (Print), معاينة قبل الطباعة (Print Preview) — an
A4-optimized layout by default, correct Arabic RTL, and a **dedicated,
reusable document renderer** rather than printing a normal application
page and hoping the browser produces something usable.

### 11. Settings

A clear "إعدادات المستندات" Settings area covering: business identity,
logo, default Quotation template, the list of available Quotation
templates, the Invoice template, the Work Order template, default terms,
default footer, and document-numbering-related settings if applicable.

### 12. Design Direction

Clean, fast, easy to understand, printable, Arabic RTL, visually
organized, suitable for handing directly to a customer. A practical
business document, not a dashboard card — do not over-design.

### 13. No Duplicated Rendering Logic

One reusable architecture: `DocumentTemplate` → `DocumentSnapshot`
(resolved document configuration) → reusable `DocumentRenderer` →
Quotation/Invoice/WorkOrder data. Never three separate print
implementations.

### 14. Relationship to the Pricing Engine

This feature does not build a Pricing/Calculation Engine (that gap is
tracked separately, `MASTER_PRODUCT_REVIEW.md` P0.1) and must not invent
one. Where `OrderItem`/`QuotationItem` don't yet carry enough structured
pricing detail (they don't — see `01_ANALYSIS.md`), the renderer displays
what exists and omits what doesn't, rather than fabricating it.

### 15. Additive / Safe Changes

Preserve all existing business rules and architecture. No existing
functionality removed or replaced. Migrations additive only. No change to
existing pricing calculations or Workflow Engine rules.

---

## Direct Customer → Order/Invoice Flow

Two workflows must both work, fully, with no artificial step forced onto
either:

**A) Quotation-based**: Customer → Quotation → Approval → Order/Invoice
→ Deposit → Work Order → Production → Delivery → Remaining payment.
(Already substantially built — FEATURE-003.)

**B) Direct**: Customer → Order/Invoice created directly (no Quotation)
→ Deposit → Work Order → Production → Delivery → Remaining payment.
(Currently impossible — `01_ANALYSIS.md` confirms `Order` has no create
endpoint at all today; this feature adds one.)

`Order.quotationOrigin` is already nullable in the schema — Path B is not
a schema change, it's a missing endpoint. Nothing in the document
renderer, the Treasury posting logic, or the Work Order generation may
assume a Quotation exists anywhere in the chain.

## Document-Level One-Time Overrides

**Hierarchy** (each layer overrides only the keys it explicitly sets;
everything else falls through to the layer below):

```
Global Settings (business identity: name, logo, address, phone, email, tax info)
        ↓
Selected Document Template's config (title, header/footer, section
        visibility, terms, signature areas — this template's own defaults)
        ↓
Document-level one-time overrides (only for this one document)
        ↓
Resolved Document Snapshot — frozen, persisted, what actually renders/prints
```

**The critical rule this hierarchy exists to satisfy**: once a document
has been printed, **nothing above it in this chain may change its
appearance retroactively** — not a later Settings edit (business name/
logo/address changing), not a later template edit (a new published
version), not anything. This means the *resolved* configuration must be
captured and persisted at print time (a real `DocumentSnapshot`, not a
live re-computation from mutable `Setting` on every render) — see
`01_ANALYSIS.md`'s corrected design for why the initial plan's
"just point at an immutable template version" wasn't sufficient once
`Setting`'s business-identity fields (themselves mutable) enter the
picture.

Overrides never write to `Setting` or to the `DocumentTemplate` they
were selected from — they live only on the specific Quotation/Order/
WorkOrder row, exactly like `02_PLAN.md`'s earlier (superseded) per-item
pricing-override idea in spirit, but scoped to document *presentation*,
not pricing inputs.

---

## Explicitly Out of Scope

- Any change to pricing/calculation logic — the future Pricing Engine
  remains a separate, prerequisite-adjacent piece of work
  (`MASTER_PRODUCT_REVIEW.md` P0.1).
- A full Order module (list/edit/delete) — this feature adds direct
  *creation* and *payment recording* only, the minimum the Invoice
  document and Treasury integration need; list/edit/delete remain future
  work.
- A PDF-generation library/service — browser print only.
- Customer Portal or any customer-facing delivery (email/WhatsApp/portal
  download).
- QR/barcode on any document (flagged as a clean future milestone, not
  bundled in — no library/payload decision has been made).
- The full Customer Profile financial tabs (§8) — architecture-ready,
  build decision flagged in `02_PLAN.md`.
- Any change to Workflow Engine internals or existing RBAC beyond the
  permission wiring this feature's own new endpoints need (mostly
  already-seeded, unused permission keys — see `01_ANALYSIS.md`).

## Non-Negotiable Constraints

- No faked document data; no hardcoded business values; only fields that
  exist in the current data model, with every gap named explicitly.
- No change to existing pricing/quotation calculations.
- Quotation is never mandatory before an Order/Invoice.
- Recording a payment never requires a Quotation.
- Every real payment automatically posts to Treasury — never a manual
  second step.
- Internal supplier costs never appear on a customer-facing document
  unless explicitly configured.
- Editing global Settings or a document template must never silently
  alter an already-printed document's appearance.
- No duplicated business objects, no duplicated document-rendering logic
  per document type.
- No unrelated changes.
- Schema changes must be reported explicitly before implementation
  (`01_ANALYSIS.md`), additive only, and not implemented until approved.

## Documentation Lifecycle

`00_REQUIREMENTS.md` (this file) → `01_ANALYSIS.md` → `02_PLAN.md` →
implementation → `03_IMPLEMENT.md` → `04_VERIFY.md` → `CHANGELOG.md`. Per
explicit instruction, this turn stops after `02_PLAN.md` — no code is
written.
