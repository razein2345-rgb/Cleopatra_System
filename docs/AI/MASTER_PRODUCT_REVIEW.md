# Master Product Review — Cleopatra Press ERP

**Status: audit only. No code was written or modified to produce this document.**

## Method Note — What Was Actually Reviewed

- **Source #1 (reference video)**: the provided `.mp4` could not be opened —
  this environment has no video-reading capability and no `ffmpeg` available
  to extract frames. **Substitute used**: `LEGACY_ANALYSIS.md` (repo root) —
  a full, line-by-line audit of `legacy/cleopatra_press_system.html`, the
  predecessor system this project has treated as "the immutable source of
  truth for calculations/workflows" since Phase 1. Its module list (Auth,
  Customers, Orders/Invoices, four pricing calculators, Boards & Banners,
  Ready Products & Services, Quotations, Work Orders, History, Treasury,
  Suppliers, Tenders, Reports, Settings, Dashboard) matches your own
  description of the video's modules almost exactly. Combined with your own
  textual description of the video in this request, this is a reasonable,
  but not equivalent, substitute — flagged here rather than silently
  assumed sufficient. If you want the video itself reviewed, describe
  specific screens/timestamps or provide frames and I'll fold that in.
- **Source #2 (Constitution)**: `cleopatra-press-business-logic-prompt.md`,
  read in full, as provided.
- **Source #3 (Approved Additions)**: your message above, read in full.
- **Current system**: read directly, not assumed — `docs/AI/VISION.md`,
  `docs/AI/PROJECT_MEMORY.md` (authoritative per `MASTER_PROMPT.md`), the
  full Prisma schema, `packages/shared/src/permissions.ts`, every backend
  service/controller/route file relevant to Quotations/Orders/Work
  Orders/Settings, `quotationService.ts`, `orderService.ts`,
  `workOrderService.ts`, `PartnerProfilePage.tsx`, and targeted greps across
  the whole repo for pricing-engine, treasury, supplier-ledger, and
  barcode/QR code. `docs/AI/HANDBOOK/*.md` (which `MASTER_PROMPT.md` names
  as Step 1 reading) are **empty scaffolding except `02_DATABASE_RULES.md`**
  — confirmed by reading each file; `VISION.md` and `PROJECT_MEMORY.md` are
  the documents actually governing this project in practice, and are what
  this review treats as authoritative.

---

## Executive Summary

The current system is **architecturally excellent and functionally
incomplete in one specific, critical way**: the Workflow Engine, RBAC,
Business Partner CRM, and UX/Dashboard layers are genuinely strong —
several are already better than the legacy reference. But **the Pricing/
Calculation Engine — the constitution's own words, "the most important
thing in the system" — does not exist as code anywhere.** Not simplified,
not approximated: zero. `Quotation`/`Order` currently accept a
caller-supplied `subtotal`/`finalTotal` number with no calculation behind
it; the confirmed golden-master example in the Constitution (100 notebooks,
10×15, numbering from 1 → 3 print runs, 5 numbering runs, numEnd=500) has no
code path in this repository that could reproduce it today.

This single gap cascades into most of what makes the system usable day to
day: no real invoice can be created because nothing computes its price; no
deposit can be collected because there is no create-Order or
create-Payment endpoint at all (`GET /orders/:id` is the *only* Order
route); Treasury has a complete, well-designed schema and zero API; a
customer's profile screen shows contact/commercial data but not one order,
invoice, or balance; and — a concrete, currently-verified finding, not a
guess — `PartnerProfilePage.tsx` is entirely in English, unlike the rest of
FEATURE-005's localized screens.

The good news: this is not a rebuild. The data model is, in almost every
place checked, already shaped correctly for the Constitution — `Setting`
already has every pricing constant the legacy system used, by the same
names; `Payment` is a real one-to-many relation (better than the legacy
system's own JSON array) with a `TreasuryEntry` link already reserved in
the schema; `OrderItem.breakdown` is already a `Json` field explicitly
reserved for the calculation engine's output; External Supplier stages
already track supplier/cost/dates. **The roadmap below is almost entirely
about building the calculation and transaction logic the schema is already
waiting for — not redesigning the schema itself.**

---

## Answers to the 15 Audit Questions

**1) What from the reference video/legacy system already exists?**
Customers (far exceeds legacy — full CRM with contacts/addresses/
categories/tags/notes/commercial profile), Quotations (exceeds legacy —
versioned, status-gated, approval-gated, real DB entity vs. legacy's
print-only cart), Quotation→Order conversion, Work Order + a genuinely
better production system (department queues, Workflow Engine, Production
Board/Dashboard — legacy had none of this), Settings pricing constants
(field-for-field match to legacy's `DEFAULT_SETTINGS`), paper/size-family
CRUD, sequential document numbering (better than legacy's random ids).

**2) What from the reference video/legacy system is missing?**
The pricing calculators themselves (see Q4), Treasury (any API/UI),
Suppliers' purchases/payments ledger (any API/UI), Tenders (schema exists,
zero API/UI — not checked in the search above but absent from the
services/controllers/routes listing), Reports, a revenue/cash/top-clients
home Dashboard (today's Dashboard is production-only), Fixed Assets/
Machines (not even a schema placeholder), Employee Salaries, invoice/
quotation printing.

**3) What from the Constitution already exists?**
The Constitution's exact pricing *constants* (`Setting` model — zinc,
print run, numbering run, envelope*, design, waste sheets, profit%,
notebook/loose thresholds, sellophane, all board prices, boards gap mm),
`SizeFamily`/`SizeFamilyEntry` with delete-protection groundwork,
`SheetType` split by `SheetBase` (regular/gayer, independently priced —
correct per Constitution §5.4), sequential invoice numbering, real
one-to-many `Payment`, `Order`/`Invoice`/`WorkOrder` as separate entities,
the customer-visible/internal split pattern (`canSeeInternal`).

**4) What Constitution requirements are missing or incorrectly implemented?**
**Missing entirely, confirmed by grep — not one match anywhere in
application code**: `resolveTieredCalc`, size-family repeat-count math,
the independent numbering-size function, notebook/loose/envelope/folder/
boards calculators, the `profitPercent`/VAT application. **`vatRate`
(14%) has no field anywhere** — `Setting` has every other constant but
this one; it's presumably hardcoded somewhere in a future calculator that
doesn't exist yet, or simply not decided. Nothing is "incorrectly
implemented" — there is nothing implemented to be incorrect. The one
correctly-implemented related piece: `vatOn` as a boolean toggle (not a
number), exactly matching the Constitution's explicit instruction.

**5) What of the approved additions already exists?**
(G) External Supplier Workflow — substantially real (`assignedSupplierId`,
`sentDate`, `expectedReturnDate`, `actualReturnDate`, `externalCost`,
`supplierStatus`, `notes` all live on `StageInstance`, built and verified
in FEATURE-004/005). Everything else in Sources A–O is either schema-ready-
but-unimplemented or fully unimplemented (see Q6).

**6) What additions are missing?**
(A) Quotation-specific overrides — no field, no mechanism. (B) Direct
invoice without a quotation — impossible today (`Order` has no create
endpoint). (C) Treasury as first-class — zero API. (D) Real customer
financial-history screen — zero (confirmed by reading
`PartnerProfilePage.tsx` in full: five tabs, none of them Quotations/
Invoices/Work Orders/Payments/Balance). (E) Practical invoice UX — no
invoice creation/collection UI exists at all. (F) Work Order production
fields (paper, colors, numbering range) — not modeled on any entity.
(H) Supplier Service Costing formula — explicitly "not implemented now" in
`VISION.md` itself. (I)–(L) Marketing/Goals/Advisor — explicitly future in
`VISION.md`, correctly not built. (M) Library/barcode/QR — zero anywhere.
(N) Settings as admin center — mostly there, missing `vatRate` and the
override distinction. (O) Arabic-first — confirmed incomplete
(`PartnerProfilePage.tsx` is 100% English; other Partner-adjacent screens
not individually re-checked in this pass and should be assumed similarly
incomplete until swept).

**7) Which current screens are technically implemented but practically
unusable?**
Quotation creation — the form must exist somewhere (route/schema do), but
it can only work today by having a human type a `subtotal`/`finalTotal`
number with no calculator behind it; for a printing business this is not
"usable," it's "some field to type a number into." `PartnerProfilePage` —
functionally complete CRM data entry, but an owner opening a customer's
page cannot see what that customer has ordered, owes, or paid. Production
Dashboard/Board — genuinely usable, the one clear exception.

**8) Which workflows are broken or incomplete from a real shop-owner
perspective?**
The entire "customer walks in → invoice → deposit → production →
balance" flow (Approved Addition B, Path 2) cannot happen at all — there
is no create-Order path outside quotation conversion, and no
create-Payment path at all, for either path. Treasury never receives a
record of any money that moves, because nothing writes to it. A supplier's
running debt (legacy had this, correctly) cannot be seen anywhere.

**9) What data models already support the requested features?**
`Setting` (pricing constants — ready), `SizeFamily`/`SizeFamilyEntry`/
`SheetType` (ready), `QuotationItem`/`OrderItem.breakdown: Json` (ready to
receive calculator output, deliberately reserved and unpopulated per
`PROJECT_MEMORY.md`), `Payment` + `TreasuryEntry` (1:1 relation already
modeled — a payment can point at its treasury entry the day the create
logic exists), `Attachment` (ready for a Library feature, `storagePath`
already reserved for Supabase Storage), `StageInstance`'s External Supplier
fields (ready for Supplier Service Costing's inputs).

**10) What needs schema changes?**
Genuinely little. Candidates, all additive: `Setting.vatRate` (one
column); a `WorkOrder`/`OrderItem`-level home for the Constitution's
internal-production fields (paper, colors, ink, binding, numbering range —
likely: populate `OrderItem.breakdown` with the calculator's own output,
which already fits this need, rather than adding parallel columns);
Quotation/QuotationItem override storage (Decision needed, see below);
`qrCodeUrl`/`qrCodePayload` on `WorkOrder`; a Library/Document concept if
`Attachment` alone isn't judged sufficient (it likely is). **Treasury,
Suppliers, Reports, Inventory need zero schema changes** — the tables
already exist; they need service/controller/route/UI.

**11) What can be implemented without schema changes?**
The entire Treasury module (service/controller/routes/UI over the
existing `TreasuryEntry` model). The entire Supplier purchases/payments
ledger (over `SupplierPurchase`/`SupplierPayment`, both already
Prisma-generated, zero service exists). `POST /api/orders` (direct
invoice creation) and `POST /api/orders/:id/payments` (deposit/balance
collection) — `Order`/`Payment` already have every field needed.
Customer profile's Quotations/Invoices/Payments tabs — pure read
aggregation over existing tables. The Arabic sweep of `PartnerProfilePage`
and any other still-English screen.

**12) What should be corrected before adding new features?**
Nothing structural — the architecture is sound and should not be
reworked. The one process item: three files are noted in
`PROJECT_MEMORY.md` as uncommitted in the working tree
(`apps/web/src/lib/supabase.ts` with leftover debug `console.log`s,
`LoginPage.tsx`, `AuthContext.tsx`), and two FEATURE-001.4 fixes sit
unmerged in separate worktrees — worth resolving before this review's
roadmap adds more surface area on top, so a diff review isn't fighting
unrelated pending changes.

**13) What should be preserved exactly?**
Every formula, threshold, and rule in the Constitution's §3–§5, verbatim
— the golden-master example in §3.5 is the acceptance test for the
Notebook calculator, not a suggestion. The existing `canSeeInternal`
customer/internal-view-split pattern. The Workflow Engine's department-
queue/stage-configuration model (already matches VISION.md's own
description of the Constitution's production needs). `DocumentSequence`'s
numbering mechanism. The `Setting` singleton-row, editable-from-UI
pricing-constants pattern already established.

**14) What should be redesigned?**
Nothing identified requires redesign. `PartnerProfilePage`'s tab
composition should be *extended* (new tabs), not redesigned.

**15) What should NOT be built yet?**
Everything in your P2/P3: Goals, ERP Advisor, hiring/machine/department
recommendations, AI Marketing Advisor and all its sub-capabilities,
capacity-aware marketing, profitability prediction, machine ROI
prediction, automation. `VISION.md` itself already says so, repeatedly and
explicitly ("not implemented now," "prepare, don't implement") — this
review's roadmap does not touch any of it, matching your own instruction.

---

## Architecture Decisions Needed From You

Two genuine design questions, not implementation details — recommendation
given for each, but these are yours to confirm before P0 work starts.

### Decision 1 — Where do Quotation-specific price overrides live?

**Recommendation: item-level, not quotation-level, and it is a
Pricing-Engine-dependent feature, not an independent one.**

Every example in Source #3 (A) — paper price, print run price, zinc price,
binding, finishing, supplier cost — is a *per-calculator input*, and every
calculator in the Constitution operates per `QuotationItem` (one item may
be loose paper, another a notebook, another a board — each with its own
inputs). A quotation-level override has no clean meaning here: "override
the paper price for this quotation" is ambiguous the moment a quotation has
two items using different paper. The natural home is a new, optional field
on `QuotationItem` — e.g. `priceOverrides: Json?`, keyed by the same
setting names the calculator already reads (`paperPrice`, `zincPrice`,
`printRunPrice`, ...) — read by the calculator in place of the global
`Setting` value *only for that item*, and copied into `breakdown` at
calculation time exactly the way every other input already is (so
"preserve the values used at creation" — Source #3 A's own requirement —
falls out of the existing snapshot pattern for free, not a new mechanism).

**This cannot be built before the Pricing Engine itself** — there is
nothing yet for an override to override. It is correctly sequenced in P0
below as the calculation engine's own follow-on, not a parallel track.

### Decision 2 — Where should Barcode/QR actually apply?

**Recommendation, in priority order: (1) Work Order only for P0/P1** — the
Constitution is explicit that Work Order needs a QR code, and this is the
one place the legacy system already had it (the third-party QR API,
noted as a hard external dependency in `LEGACY_ANALYSIS.md` §9 — worth
replacing with a local QR-generation library rather than porting that
specific dependency verbatim). **(2) Invoice, as a P1 nice-to-have** — a
scannable link to the invoice's own record, useful for lookup, not
required by the Constitution. **(3) Customer/Products/Inventory/Library**
— no confirmed operational need surfaced anywhere in the three sources;
do not build these until a real use case is named, per your own
instruction not to build every possible use automatically.

---

## Prioritized Roadmap

Each item: **Current state → Gap → Business impact → Dependencies →
Milestone → Backend/Frontend/DB → Verification.**

### P0 — Core Daily Operation

#### P0.1 — Pricing / Calculation Engine

- **Current state**: does not exist. `Setting` holds every constant it
  needs; `QuotationItem.breakdown`/`OrderItem.breakdown` are reserved and
  empty.
- **Gap**: 100% — no size-family tiering, no numbering resolution, no
  per-product calculator (loose/notebook/envelope/folder/boards/ready/
  service).
- **Business impact**: critical — nothing downstream (real quotations,
  real invoices, real work orders) can be accurate without this. This is
  the constitution's own top priority.
- **Dependencies**: none — every input it needs already exists in
  `Setting`/`SizeFamily`/`SheetType`.
- **Proposed milestone(s)**: one feature, milestoned exactly as
  `cleopatra-press-business-logic-prompt.md` §6 instructs — pure functions
  first, unit-tested against the §3.5 golden master, before any API/UI:
  M1 Size-family tiering + numbering resolution (pure, tested). M2
  Per-product calculators (loose, notebook, envelope, folders, boards,
  ready/service — pure, tested). M3 Wire into `QuotationItem` create/update
  (server computes `breakdown`/`subtotal`, caller no longer supplies them
  raw).
- **Backend**: new `apps/api/src/services/pricingEngine.ts` (or a
  directory, given six calculators) — pure functions, zero DB/HTTP
  dependency, per `02_DATABASE_RULES.md`'s "Only one Calculation Engine
  exists" rule. `quotationService.ts`/`createQuotationItemSchema` updated
  to call it instead of accepting a caller-supplied `breakdown`.
- **Frontend**: a real per-product calculator UI (today's quotation form,
  wherever it lives, currently just accepts numbers) — out of P0.1's own
  scope if M1–M3 above ship engine-only first with `apps/web` still typing
  a total; **recommend a P0.1b milestone** for the UI once the engine
  exists, so this isn't silently left half-built.
- **DB**: none. Possibly `Setting.vatRate` (see P0.6).
- **Verification**: the Constitution §3.5 example as a literal unit test
  (100 notebooks, 10×15, print runs=3, numbering runs=5, numEnd=500) plus
  a handful of additional golden-master cases per calculator, run against
  the **legacy** calculators' own output where feasible (per
  `LEGACY_ANALYSIS.md`'s own recommended mitigation).

#### P0.2 — Direct Order/Invoice Creation (no Quotation required)

- **Current state**: `GET /api/orders/:id` is the only Order route.
- **Gap**: no `POST /api/orders` at all — Approved Addition B's Path 2 is
  impossible.
- **Business impact**: critical — this is literally "can a walk-in
  customer be invoiced," the most common real-shop transaction.
- **Dependencies**: ideally after P0.1 (so a direct order is priced for
  real, not typed in) — but the *endpoint* can exist before the engine
  does, accepting the same caller-supplied totals `Quotation` does today,
  if you want this unblocked sooner. Flagging the sequencing choice rather
  than assuming it.
- **Proposed milestone**: `orderService.ts` gains `createOrder` (mirrors
  `convertQuotationToOrder`'s snapshot/numbering shape but with no
  quotation source), `POST /api/orders` route (`orders.create` permission
  already seeded, unused today).
- **Backend**: `orderService.ts`, `controllers/orders.ts`, `routes/orders.ts`.
- **Frontend**: a real "New Invoice" screen/entry point — none exists
  today (Quotation's own detail page is the only order-adjacent UI).
- **DB**: none.
- **Verification**: create an order with no quotation, confirm sequential
  `invoiceNumber`, confirm it's identical in shape to a conversion-created
  order.

#### P0.3 — Payments / Deposits / Remaining Balance

- **Current state**: `Payment` model exists (real relation, better than
  the Constitution's own JSON-array spec), zero create/list endpoint.
- **Gap**: no way to record a payment against an order at all, anywhere.
- **Business impact**: critical — deposit collection, remaining-balance
  tracking, "no delivery until paid" (Constitution §4) are all impossible.
- **Dependencies**: P0.2 conceptually pairs with this (an order needs to
  exist to pay against) but P0.3 also applies to conversion-created
  orders, which already exist — not strictly blocked by P0.2.
- **Proposed milestone**: `POST /api/orders/:id/payments` (multiple calls
  = multiple payments, matching Constitution §4's split-payment
  requirement), remaining-balance computed server-side
  (`finalTotal - Σpayments`), the "لا يُسلَّم الشغل إلا بعد سداد الباقي" /
  "تم السداد بالكامل" states as a computed, not stored, value.
- **Backend**: `orderService.ts` (`recordPayment`), `controllers/orders.ts`,
  route addition. **This is also where P0.4's Treasury auto-link is
  wired** — one payment write, one treasury entry write, one transaction.
- **Frontend**: a payment-collection UI on the (new) Order/Invoice screen.
- **DB**: none — `Payment.treasuryEntry` relation already exists.
- **Verification**: record two split payments (cash + bank transfer) on
  one order, confirm `remaining` computes correctly, confirm exactly one
  `TreasuryEntry` per payment exists afterward.

#### P0.4 — Treasury as a First-Class Module

- **Current state**: `TreasuryEntry` model complete and correct (type,
  amount, category, note, date, method via `Payment`, source via
  `orderId`); `treasury.*` permissions already seeded; zero service,
  controller, or route file exists anywhere.
- **Gap**: 100% of the application layer.
- **Business impact**: critical — Source #3 (C)'s explicit requirement;
  currently the business has no visible cash position anywhere in the
  product.
- **Dependencies**: independent of P0.1–P0.3 for manual entries (income/
  expense/transfer typed directly, exactly like the legacy system);
  benefits from P0.3 for the auto-linked collection entries.
- **Proposed milestone(s)**: M1 `treasuryService.ts` + CRUD
  controller/routes (manual income/expense/transfer, matching
  `LEGACY_ANALYSIS.md` §2's Treasury row) + current-balance/by-method
  aggregate. M2 frontend — a dedicated "الخزينة والنقدية" nav entry (not
  inside Settings, not inside an Order), list + filter + manual-entry form.
- **Backend**: `apps/api/src/services/treasuryService.ts`,
  `controllers/treasuryEntries.ts`, `routes/treasuryEntries.ts`.
- **Frontend**: `apps/web/src/pages/treasury/` (new), `AppShell.tsx` nav
  entry.
- **DB**: none.
- **Verification**: manual income/expense/transfer entries round-trip;
  balance aggregate matches a hand sum; a P0.3 payment produces a
  Treasury row visible in this same list without a second manual entry.

#### P0.5 — Customer Profile: Real Financial/Operational Screen

- **Current state**: `PartnerProfilePage.tsx` has Overview/Contacts/
  Addresses/Notes/Commercial — confirmed via full file read, zero
  Quotations/Invoices/Work Orders/Payments/Balance content.
- **Gap**: exactly the tabs Source #3 (D) names.
- **Business impact**: high — "what has this customer ordered and do
  they owe us money" is a daily question this page cannot answer.
- **Dependencies**: reads existing `Order`/`Quotation`/`Payment` data —
  no new backend module required, but is far more useful once P0.2/P0.3
  exist (otherwise there's little real data to show).
- **Proposed milestone**: two new tabs — Quotations & Invoices (list,
  reusing existing list endpoints filtered by `partnerId`, which already
  exists as an indexed column on both), and a Financial Summary (total
  business value, outstanding balance, current/completed jobs) as a
  read-only aggregate, following `VISION.md`'s own "Customer Retention"
  section's explicit instruction: **derived, read-only, over data already
  captured — no new fields.**
- **Backend**: likely a small aggregate endpoint
  (`GET /api/partners/:id/summary`) rather than N separate calls — mirrors
  the `dashboard-summary` precedent from FEATURE-005 Sprint 2.
- **Frontend**: two new tabs in `PartnerProfilePage.tsx`.
- **DB**: none.
- **Verification**: a partner with real orders/payments shows correct
  totals/balance, cross-checked against a manual sum.

#### P0.6 — Settings Completion

- **Current state**: near-total match to the Constitution already.
- **Gap**: `vatRate` (14%) has no field — confirm whether it should be a
  configurable `Setting` column (Constitution §5.6 explicitly says it
  must be) versus discovering it was meant to be genuinely fixed; add
  the Quotation-item override mechanism from Decision 1 once P0.1 exists.
- **Business impact**: medium — VAT is currently presumably hardcoded
  nowhere (no calculator to hardcode it in yet), so this surfaces the
  moment P0.1 is built, not before.
- **Dependencies**: none for the `vatRate` field itself; overrides depend
  on P0.1.
- **Proposed milestone**: one-line additive migration
  (`Setting.vatRate Decimal`, default `14.000`), read by P0.1's engine
  instead of a hardcoded `0.14`.
- **Backend/Frontend/DB**: trivial — same shape as every other `Setting`
  field already editable in `PrintingSettings.tsx`/`PricingSettings.tsx`.
- **Verification**: changing `vatRate` in Settings changes a subsequent
  calculation's VAT amount.

#### P0.7 — Supplier Service Costing (formula only, not the advisor)

- **Current state**: `StageInstance.externalCost` exists as a single
  figure; `VISION.md`'s own costing model (Supplier + Transport + Handling
  + Margin) is explicitly "not implemented now."
  `SupplierPurchase`/`SupplierPayment` exist in schema only.
- **Gap**: the costing *formula* itself, and the supplier purchases/
  payments ledger UI (Approved Addition H and legacy's Suppliers module).
- **Business impact**: high for any externally-sourced job (offset dark-
  background jobs, business cards, Stamps/Brass Plates/Acrylic Signs per
  `VISION.md`'s own examples) — `External Cost` today is whatever a human
  types, with no breakdown.
- **Dependencies**: benefits from, but doesn't strictly require, P0.1 —
  the formula is simple arithmetic, not a calculator.
- **Proposed milestone(s)**: M1 supplier purchases/payments ledger
  (`supplierPurchaseService.ts`/`supplierPaymentService.ts` +
  controllers/routes — zero schema change) with a running balance, exactly
  matching legacy's Suppliers module. M2 break `externalCost` into its
  three named components on `StageInstance` (Supplier/Transport/Handling)
  plus a computed customer price, per `VISION.md`'s own model.
- **Backend**: two new service/controller/route trios; `workflowInstanceService.ts`
  extension for M2.
- **Frontend**: a Suppliers list/detail page (currently: `BusinessPartner`
  with `SUPPLIER` role has no ledger view at all); `EditQueueItemDialog.tsx`
  extension for the three-part cost entry.
- **DB**: M1 none; M2 additive columns on `StageInstance` (or keep
  `externalCost` as the sum and add three new fields alongside it —
  decide which when this milestone is planned).
- **Verification**: a supplier's purchases/payments net to the correct
  running balance; an external-stage cost breaks down and sums correctly.

---

### P1 — Operational Visibility

| Item | Current state | Gap | Impact | Depends on |
|---|---|---|---|---|
| **Home Dashboard** (revenue/cash/top-clients) | Production-only Dashboard exists (FEATURE-005) | Legacy's revenue/treasury-balance/supplier-debt/top-5-clients view has no equivalent | Medium — owner has no single daily-glance financial view | P0.3/P0.4 (needs real data to show) |
| **Production Board** | Done, verified, iterated twice (Sprint 2/2.5) | None significant | — | — |
| **Supplier ledger UI** | See P0.7 | — | — | P0.7 |
| **Expenses view** | Folds into Treasury (`type: EXPENSE`) | Same gap as P0.4 | Medium | P0.4 |
| **Inventory** | `InventoryItem`/`StockLevel`/`StockMovement` schema-only, explicitly "no API/UI/logic anywhere" | 100% of application layer | Medium — legacy didn't have real inventory either; not urgent | None (schema ready) |
| **Reports** | `reports.view` permission seeded; zero controller/service/route | 100% | Medium-high — no financial reporting anywhere | P0.1–P0.4 (reports over data that must first exist) |
| **Library/Documents** | `Attachment` model ready, zero upload endpoint | Upload/list/download API+UI | Low-medium | None |
| **QR/Barcode on Work Order** | Zero | Full feature | Medium (Constitution-named) | P0.2 (needs a real Work Order to encode) |
| **Arabic sweep completion** | `PartnerProfilePage.tsx` confirmed 100% English; other screens not individually re-audited this pass | Unknown until swept | Medium — violates `VISION.md`'s own Core Principle | None |
| **Fixed Assets & Machines** | Not in schema at all | Full feature (new model) | Low for P1 — legacy tracked this but no current data depends on it | None |
| **Employee Salaries** | Not modeled | Full feature | Low for P1 | None |

---

### P2 — Growth (explicitly not built yet, per `VISION.md` and your own instruction)

Goals, ERP Advisor, hiring/machine/department-growth recommendations,
Marketing Opportunity Detection, Campaign Recommendations, Internal
Marketing Department, AI Marketing Advisor. Every one of these is already
architected in `VISION.md`'s Strategic Goals & Business Intelligence
section with an explicit "not implemented now." This review adds nothing
here beyond confirming that stance — building any of it before P0/P1 exist
would be recommending against data the system doesn't have yet.

### P3 — Advanced Intelligence

Capacity-aware marketing, profitability prediction, machine ROI
prediction, advanced AI decision support, automation. Same status as P2 —
explicitly deferred in `VISION.md`, correctly not touched here.

---

## Files/Modules That Would Change, Per P0 Milestone (exact, for approval)

- **P0.1 (Pricing Engine)**: new `apps/api/src/services/pricingEngine.ts`
  (or `pricingEngine/` directory); `apps/api/src/services/pricingEngine.test.ts`
  (golden-master unit tests, first test file since `adminSafety.test.ts`);
  `quotationService.ts` (item creation path); `packages/shared/src/schemas/quotationItem.ts`
  (server-computed fields no longer caller-supplied).
- **P0.2 (Direct Order)**: `apps/api/src/services/orderService.ts`,
  `apps/api/src/controllers/orders.ts`, `apps/api/src/routes/orders.ts`;
  `packages/shared/src/schemas/order.ts` (new `createOrderSchema`); a new
  frontend page (name/location TBD when this milestone is planned).
- **P0.3 (Payments)**: same three `orderService.ts`/`controllers/orders.ts`/
  `routes/orders.ts` files as P0.2; `packages/shared/src/schemas/payment.ts`
  (new); frontend addition to the Order/Invoice screen from P0.2.
- **P0.4 (Treasury)**: new `apps/api/src/services/treasuryService.ts`,
  `apps/api/src/controllers/treasuryEntries.ts`,
  `apps/api/src/routes/treasuryEntries.ts`; `packages/shared/src/schemas/treasuryEntry.ts`
  (new); new `apps/web/src/pages/treasury/`; `apps/api/src/routes/index.ts`
  (register route); `apps/web/src/components/AppShell.tsx` (nav entry).
- **P0.5 (Customer profile)**: `apps/web/src/pages/partners/PartnerProfilePage.tsx`
  (new tabs), possibly a new small aggregate endpoint/service.
- **P0.6 (Settings vatRate)**: `apps/api/prisma/schema.prisma` (additive
  migration), `packages/shared/src/schemas/setting.ts`, the existing
  Settings pricing screen component, `pricingEngine.ts` (P0.1) reading it.
- **P0.7 (Supplier costing)**: new `apps/api/src/services/supplierPurchaseService.ts`/
  `supplierPaymentService.ts` + matching controllers/routes;
  `packages/shared/src/schemas/supplierPurchase.ts`/`supplierPayment.ts`
  (new); a new Suppliers frontend page;
  `apps/api/src/services/workflowInstanceService.ts` +
  `EditQueueItemDialog.tsx` for the M2 cost breakdown.

Every item above is additive — no existing file's public contract is
removed or broken, consistent with `VISION.md`'s Feature Evolution Policy
and `MASTER_PROMPT.md`'s "never rewrite working systems."

---

## Decisions Needed From You Before Any Implementation

1. **P0 sequencing** — this review sequences the Pricing Engine (P0.1)
   first because everything else in P0 either depends on it or is far
   less useful without it. Confirm, or reorder.
2. **Decision 1 above** (Quotation overrides: item-level `Json`, deferred
   until after P0.1) — confirm or redirect.
3. **Decision 2 above** (QR/Barcode: Work Order only for now) — confirm
   or redirect.
4. **P0.2's sequencing relative to P0.1** — should direct Order creation
   ship *before* the Pricing Engine (accepting typed totals, like
   Quotation does today) so Path 2 is unblocked sooner, or wait until
   pricing is real? Flagged above as an open choice, not decided.
5. **P0.7's schema shape** — when the Supplier Service Costing formula is
   built, should `StageInstance.externalCost` become a computed sum of
   three new columns, or stay as-is with three new columns added
   alongside it? Both are additive; this is a modeling preference.
6. **The video** — confirm whether the `LEGACY_ANALYSIS.md` substitute is
   sufficient for Source #1, or whether you want specific screens/
   timestamps described so they can be folded in before P0 work starts.
7. **Scope of "Arabic sweep"** — should this become its own P1 milestone
   (audit every screen, not just the one confirmed here) before or after
   P0 ships new screens that would need the same treatment?

**Waiting for your approval before any implementation begins**, per your
instruction. Nothing in this document should be read as a plan already
in motion.
