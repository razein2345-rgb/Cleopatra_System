# FEATURE-006 — Document Templates & Printing — Analysis

**Revision note**: expanded after the initial pass. Two changes of
substance versus the original analysis: (1) a corrected design for
document snapshots — the original plan under-solved the "later Settings
edits must not alter a printed document" requirement, see §10; (2) a full
audit of what Direct Order creation, Payments, and Treasury actually need
— the answer is close to nothing schema-wise, which is documented in §11.

Based on reading the current implementation, not assumption: everything
read for the original analysis pass, plus the full `TreasuryEntry`/
`Payment`/`Order` models and their enums (`TreasuryType`,
`TreasurySourceType`, `OrderStatus`), `packages/shared/src/permissions.ts`
(re-confirmed), and `orders.ts`/`quotations.ts` controllers.

## 1–7. (Unchanged from the original analysis pass)

Quotation/Order/WorkOrder models and UI, numbering, logo/business
settings, print/PDF absence, and template-architecture absence were all
already fully audited and remain accurate — summarized rather than
repeated in full:

- `Quotation`/`QuotationItem`, `Order`/`OrderItem` are structurally
  identical, versioned/snapshotted, but **no per-item `unitPrice`/`unit`
  column exists** — `breakdown: Json` is reserved for the future Pricing
  Engine and is currently always empty (`createQuotationSchema` requires
  the caller to supply `subtotal`/`finalTotal` directly).
- `WorkOrder` is deliberately thin; no paper/colors/numbering-range
  fields exist anywhere — the closest real data is `StageInstance`'s
  populated External Supplier fields and `OrderItem.breakdown` (empty).
- `GET /api/orders/:id` is the **only** Order route today. No Payment
  create/list endpoint exists anywhere.
- `DocumentSequence`/ADR 0008 numbering is fully built and reusable for
  all three document types with zero changes.
- `Setting.logoUrl` exists; no business-identity field (name/address/
  phone/email/tax info) exists anywhere. `CompanySettings.tsx` is
  misleadingly named — it renders Partner Category/Tag management, not
  company identity.
- No print/PDF library anywhere; no `@media print`/`window.print` usage
  anywhere. Matches the instruction to use the browser print flow.
- No `DocumentTemplate`/template concept anywhere; `WorkflowTemplate`'s
  versioning shape (`code`+`version`+`previousVersionId`+immutable-once-
  published) remains the directly reusable precedent.

## 8. Existing Payment/Treasury Data Model (new — full audit)

**`Payment`**: `id`, `orderId`, `method` (`PaymentMethod` enum), `amount`,
a nullable 1:1 `treasuryEntry` relation. **Everything a deposit/
remaining-balance flow needs already exists** — `Order.finalTotal -
Σ Payment.amount` is the remaining balance, computable today from
existing columns, zero new fields.

**`TreasuryEntry`**: `id`, `type` (`TreasuryType`: `INCOME`/`EXPENSE`/
`TRANSFER`), `amount`, `category`, `note`, `date`, `sourceType`
(`TreasurySourceType`: `MANUAL` / **`INVOICE_PAYMENT`** — this exact
value already exists in the schema, unused, clearly placed there in
anticipation of this exact feature), `orderId`, `paymentId` (unique — one
Treasury entry per payment, matching `Payment.treasuryEntry`'s own
cardinality), `partnerId`, `staffId`, `branchId`, soft-delete triad. **This
model is completely ready** for both manual entries (income/expense/
transfer, typed directly — the legacy system's own Treasury shape) and
auto-posted payment entries. **Zero schema changes needed for Treasury.**

**`orders`/`treasury` permission modules**: already fully seeded in
`packages/shared/src/permissions.ts` — `orders.view/create/edit/delete/
finalize` and `treasury.view/create/edit/delete` all exist as permission
keys today, currently unused because no endpoint checks them yet. **No
permission catalog change needed** — this feature wires already-reserved
permissions to real endpoints, the same "schema/catalog anticipated this,
application code didn't exist yet" pattern already seen repeatedly in
this project (`nextWorkOrderNumber`'s own comment: "fourth use of this
mechanism").

**Conclusion**: Direct Order creation, Payment recording, and Treasury
are **not a schema-change problem at all** — every field, enum value, and
permission key already exists. This is purely service/controller/route/
UI work, which materially changes this feature's risk profile versus a
"build Treasury from scratch" assumption.

## 9. Direct Customer → Order/Invoice Flow — Data Readiness

`Order.partnerId` is required, but `Order.quotationOrigin` (the reverse
of `Quotation.convertedOrderId`) is already optional — an `Order` with no
originating `Quotation` is already a legal row shape (confirmed by
reading `mapOrderToDto`: `quotationOriginId: order.quotationOrigin?.id ??
null`). The only missing piece is the creation endpoint itself
(`orderService.ts` currently has no `createOrder` function, only
`mapOrderToDto`/`nextInvoiceNumber`). No schema change; a new service
function + controller + route, mirroring `convertQuotationToOrder`'s
snapshot/numbering shape (per `quotationService.ts`, called from the
quotations controller — not shown as a standalone exported function in
`orderService.ts` itself, confirmed by direct read) but without a source
Quotation.

## 10. Document-Level One-Time Overrides — Corrected Snapshot Design

The original plan (pre-revision) proposed freezing historical rendering
by pointing a document at an **immutable template version**
(`documentTemplateId`) alone. This is necessary but **not sufficient**:
`Setting`'s business-identity fields (business name, logo, address,
phone, email, tax info — added in this feature, see §11) are a **mutable
singleton row**. If the renderer read them live at print time, editing
the business address next year would silently change how every
previously-printed document renders if reprinted — a direct violation of
the explicit requirement that "later settings/template changes do not
alter an already-created document."

**Corrected design**: a **persisted, resolved snapshot**, not a live
recomputation. Concretely, `Quotation`/`Order`/`WorkOrder` each gain:

- `documentTemplateId` (unchanged from the original plan — which
  template/version was selected).
- `documentOverrides: Json?` — the one-time override deltas the user
  entered for this specific document (title, notes, terms, footer text,
  section-visibility flags, business-identity presentation overrides).
  Never written back to `Setting` or to the `DocumentTemplate` row.
- `documentSnapshot: Json?` — the **fully resolved, merged
  configuration**, computed once (`Setting`'s current business-identity
  fields ⊕ the selected template's `config` ⊕ `documentOverrides`) and
  persisted at the moment the document is first printed/previewed for
  real. Every subsequent print reads this stored snapshot directly —
  it is never recomputed from live `Setting`/template data again unless
  the user explicitly re-selects a template or edits overrides (which
  is itself a deliberate, visible action, not a silent drift).

This is the same freeze-by-default philosophy ADR 0010 already applies
to `OrderItem.breakdown` — a snapshot captured at a meaningful business
moment, immune to later changes elsewhere in the system — applied one
layer further, to *document appearance* instead of *pricing*. It also
directly matches the user's own stated architecture:
`DocumentTemplate → DocumentSnapshot → DocumentRenderer → data` —
`documentSnapshot` is the literal, persisted realization of the
`DocumentSnapshot` box in that diagram, not merely a conceptual/computed
label as the original (pre-revision) plan assumed.

## 11. Whether the Current Database Can Safely Support This Without Migration

**No — a migration is still required**, and the scope is only modestly
larger than the original analysis (one field added per document type;
everything else the new requirements need already exists per §8–§9):

1. **`DocumentTemplate`** (new table) — unchanged from the original plan:
   `id`, `documentType`, `name`, `config: Json`, `isDefault`, `version`,
   `previousVersionId` (self-reference, versioned like
   `WorkflowTemplate`), `publishedAt`, soft-delete triad.
2. **`Quotation`/`Order`/`WorkOrder`** each gain three nullable columns:
   `documentTemplateId` (FK), `documentOverrides: Json?`,
   `documentSnapshot: Json?` (was two columns in the original plan; the
   corrected design in §10 adds the third).
3. **`Setting`** gains the same eight nullable business-identity columns
   identified originally: `businessNameAr`, `businessNameEn`, `address`,
   `phone`, `email`, `website`, `taxNumber`, `commercialRegisterNumber`.
4. **No change to `Payment`/`TreasuryEntry`/`Order`'s existing columns**
   — confirmed ready as-is (§8).

Every change is additive, nullable, and touches zero existing row data
beyond `Setting` gaining new `null`-defaulted columns.

## Design Decisions Requiring Explicit Confirmation

Carried from the original analysis, plus two new ones from this revision:

- **Template selection timing** (unchanged recommendation: print time,
  not creation time — `documentSnapshot` resolution naturally happens at
  the same moment).
- **`setExclusiveDefault` generalization** (unchanged — extend the
  existing helper rather than duplicate the two-layer lock pattern).
- **Logo upload endpoint** — still needs a one-line confirmation at plan
  time.
- **New — snapshot re-resolution trigger**: should editing
  `documentOverrides` alone re-resolve+persist a new `documentSnapshot`
  automatically (recommended — the user just took a deliberate action),
  or require an explicit "re-generate" action separate from saving the
  override? Recommend automatic-on-save, since the override edit *is*
  the deliberate action; a *template* re-selection should behave the
  same way.
- **New — Customer Profile tabs (§8 of Requirements)**: build the actual
  Quotations/Orders/Payments/Balance tabs as part of this feature (they
  become genuinely meaningful once direct Order creation and real
  Payments exist), or keep this feature's promise to "prepare the
  architecture" narrower and treat the tabs themselves as
  `MASTER_PRODUCT_REVIEW.md` P0.5's own, separate work? Recommendation in
  `02_PLAN.md`.

## Business Rules

None changed by the document-rendering piece. The financial-foundation
piece (Direct Order creation, Payments, Treasury auto-posting) adds real
new backend behavior but zero new *pricing* or *workflow* business rules —
it wires existing, already-anticipated schema/permissions to real
endpoints, per §8–§9 above.
