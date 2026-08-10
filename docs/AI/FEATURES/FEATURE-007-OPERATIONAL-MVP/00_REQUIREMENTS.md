# FEATURE-007 — Operational MVP (Reception Flow, Inventory, Treasury Scoping, Employees, Theme)

## Status

FEATURE-006 M7 (DocumentRenderer) is **paused, not abandoned**, at the request of the business owner. This feature takes priority: he needs a fast, connected working version covering his actual daily reception → order → production cycle. FEATURE-006 M8 (Quotation document rendering) is additionally blocked on a quotation-layout reference image he will provide later — do not invent that design.

## Source

Verbatim requirements from the business owner (2026-08-09), after reviewing [VIDEO_VS_CLEOPATRA_REVIEW.md](../../VIDEO_VS_CLEOPATRA_REVIEW.md), translated/organized below. Two follow-up questions were asked and answered — both are incorporated as locked decisions.

## Requirements

1. **Operational UI closer to the reference video** for day-to-day ease of use — not a literal clone, but the same operational directness (guided flows, live totals, clear per-screen purpose) applied through the existing Cleopatra Design System.

2. **Reception-scoped Treasury access**:
   - Reception staff must be able to record income/expense entries.
   - Reception staff must **never** see the overall treasury balance or grand totals.
   - Reception staff **can** see the total of entries **they personally created** (confirmed answer: "يشوف إجمالي حركاته هو بس (مش رصيد الخزينة الكلي)").
   - The full Treasury page (per-wallet balances + grand total) stays restricted to roles holding `treasury.view`.
   - The Treasury page's total must be broken down clearly by payment method: Vodafone Cash / InstaPay / Cash / Bank account.

3. **Inventory (المخزن)**:
   - Register and track stock of goods (paper stock, by sheet type/size).
   - When a new Order is created (Offset or Digital job), the system must **automatically compute how many sheets are consumed** and deduct them from stock — confirmed answer: "المفروض اصلا في طريقة الحساب بيعرف لوحده عدد الأفرخ المسحوبة" (the calculation method itself is supposed to know the sheet count). This means the sheet-tiering/repeat-factor calculation (Pricing Engine §3.1–3.4 of `PRICING_ENGINE_SPEC.md`) must be built now, scoped to sheet-count only — not deferred, and not a manual entry field.
   - Low-stock alert when remaining stock falls below a threshold (owner's example: 5 sheets) — must be configurable per item, not hardcoded (per the project's standing "not hardcoded" rule).
   - If an ordered paper/size is insufficient or not in stock, it must automatically appear in a "needs to purchase" list.

4. **Quotation document format**: the owner will send a reference image of the desired layout later. Do not design or build the Quotation print template until that reference arrives — FEATURE-006 M8 stays blocked on this.

5. **Guided reception order-creation flow**: reception staff should be able to enter customer/company data, then be guided into order-type selection, then build the order — and this must be genuinely wired into the rest of the system (Inventory deduction, Treasury, Work Order), not a siloed form.

6. **Employees section**: name, contact data, and position/job title — a basic directory, not payroll or attendance tracking (those were explicitly not mentioned here, unlike in the video).

7. **Theme**: derive the visual palette from the Cleopatra Press logo (black background; red + silver/gray metallic "CP" mark; "Cleopatra" in silver-gray, "Press" in red). Support both dark and light mode, user-toggleable.

8. **Delivery approach**: ship a working version of this slice quickly; everything not essential to the current operational cycle continues afterward.

## Explicit decisions (locked, from clarifying questions)

- **D1 — Sheet-count calculation timing**: Build now, as part of Inventory, scoped to sheet-count only (size families, tiering/threshold rule, repeat factor via area ratio, ceiling rounding). Full costing (prices, margin, VAT, numbering cost, binding, etc.) remains separate future work — this M1 milestone is a **subset** of the eventual Pricing Engine, built because Inventory correctness genuinely depends on it, not a scope-creep substitute for it.
- **D2 — Reception treasury visibility**: Reception sees only the sum of entries they personally created, never the org-wide balance. Implementation approach (proposed, not yet asked separately — flag if wrong): reuse the existing `listTreasuryEntries`/`treasuryService` layer, auto-scoping the query to `staffId = caller.id` for any caller who has `treasury.create` but not `treasury.view`, and expose a small "my total for period" alongside it — no new parallel endpoint, no new parallel permission needed beyond what already exists (`treasury.create` vs `treasury.view`).

## Round 2 additions (owner, 2026-08-09, after M1/M2 shipped)

9. **Quotation document design — now unblocked.** Owner provided two real reference PDFs (`عرض أسعار برينتيج هاوس.pdf`, `عرض أسعار كليوباترا للدعاية والإعلان.pdf`) — the second is Cleopatra's own actual in-use format. Structure confirmed: logo top-left, business name top-right (large stylized name + smaller subtitle), "السادة / [اسم العميل]" line, "عرض أسعار" heading, intro sentence, items table with a brand-colored header (م / العدد / البيان / سعر الوحدة / الإجمالي, RTL), company stamp image near the bottom, closing phrase "وتفضلوا بقبول وافر الإحترام...", footer contact bar (address/phone/WhatsApp/email/Facebook). Two additions on top of the reference PDFs themselves:
   - If VAT (14%) applies, print a line under the items: **"عرض السعر شامل ضريبة القيمة المضافة"**.
   - A notes field, written directly under the quote items (not just in the closing area).
   This directly unblocks FEATURE-006 M8 (Quotation document), which was paused pending exactly this reference — it resumes once FEATURE-007's currently in-flight backend milestones (M3 onward) are done, using the existing DocumentTemplate/DocumentRenderer infrastructure already built in FEATURE-006 M1–M7, not a new rendering system.
10. **Dashboard: show وارد/منصرف (income/expense) summary directly**, not only inside the Treasury page — reuses the existing `treasury.getTreasuryBalance` aggregate and the established Dashboard Widget Registry pattern (FEATURE-005 refinement 2).
11. **Dashboard: a fast order-entry path** — type the company/customer name on the Dashboard itself and go straight into building the order, without a separate navigation step first. Folded into M4 (guided reception order-creation flow) as its entry point, not a separate milestone.
12. **Rename "شركاء الأعمال" (Business Partners) → "العملاء" (Customers)** everywhere in the UI — nav label, page title, buttons, empty/error states. **Done** (2026-08-09, no schema change, label-only).
13. **Marketing funnel stage per customer** — clarified via direct question, this is the "Internal Marketing" concept from `MASTER_HANDOFF.md` §5 (the print shop's own marketing team tracking progress with each customer), **not** "sell marketing as a service to customers" (owner confirmed that stays deferred/future, unchanged from the earlier gap report). Owner confirmed 4 stages, in his own words:
    1. **وعي** — العميل يعرف إننا موجودين (aware we exist)
    2. **اهتمام** — بيشوفنا كتير ويهتم بينا (sees us often, engaged)
    3. **عميل لأول مرة** — طلب مرة على الأقل (ordered at least once)
    4. **عميل ثابت** — بيطلب على طول مهما اتغير السعر (orders regularly regardless of price — loyal)
    Mechanism: a `marketingStage` field on `BusinessPartner` (or a dedicated join, TBD at implementation time) that the Marketing team can view/update per customer — reuses the existing unified Partners/Customers list and its Category/Tag infrastructure where it fits, not a parallel customer list.

## Round 3 addition (owner, 2026-08-09) — production workflow per pricing track

14. **Multiple pricing/production tracks, each with its own Work Order workflow**: Offset, Digital, Boards & Signage, and "remaining products" (brass plates, stamps, acrylic signs, etc.). Confirmed by reading the actual code (not assumed): the departments this needs already exist — `DESIGN`, `PLATE_PREPARATION`, `OFFSET_PRINTING`, `DIGITAL_PRINTING`, `FINISHING`, `DELIVERY`, `CUSTOMER_SERVICE` — and the Workflow Engine (FEATURE-004, built earlier this session) already supports ordered stages, department-per-stage, approval checkboxes, and per-stage dynamic fields (its own code comment references "a Brass Plate's size/options" — this exact case was anticipated, not new). What's missing: **no actual `WorkflowTemplate` has ever been configured** for any track (only the raw departments exist), and **no automatic routing exists** — `createWorkflowInstance` currently takes an explicit `templateId`; nothing picks the right template based on what was ordered.
15. **Confirmed Offset track sequence** (owner's own words): Quotation (shows only the final price, no internal cost breakdown) → customer approval → Invoice → **Design** stage (designer sees an ordered queue of what to design) → designer marks "Done" (checkbox) on customer design approval → **Plate Preparation** (receiving zinc plates from supplier) → print the physical Work Order document → **Printing** → **Numbering** → **Finishing/Binding** → **Delivery** → **After-Sale** (tracking roughly when the customer will need to reorder, e.g. running low on notebooks — a notification fires before the expected reorder date).
16. **Quotation documents show only the final price** — no زنك/تراج/margin breakdown ever appears to the customer. Confirms/tightens the already-planned M8 scope, not a new decision.
17. **Reorder-reminder notifications** are new, unbuilt scope — not part of any prior milestone.

These are real, substantial, and structurally separate from pricing (PE) — captured as their own milestone group (WF) below rather than folded into PE-E, so PE-E stays focused on what it already is: wiring the costing engine into Order/Quotation creation.

## Explicit non-goals for this feature

- No Quotation document rendering (blocked on owner's reference image).
- No Employee payroll, hourly wage, or fingerprint attendance (video showed it, owner did not ask for it here — treat as future/undecided per the earlier gap report, not part of this slice).
- No Fixed Assets, Reports module, or Meter/Waste reconciliation (unresolved from the earlier gap report, not mentioned here — stay out of scope).
- No full Pricing Engine costing (margins, VAT, numbering, binding costs) — only the sheet-count subset needed for Inventory.
