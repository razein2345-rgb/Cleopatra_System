# Legacy Analysis — `legacy/cleopatra_press_system.html`

**Status:** Audit only. No code has been migrated or modified. The legacy file was read in full (2,365 lines, ~211KB) and is treated as the single source of truth for all business logic, pricing, and workflows.

Source language: Arabic (RTL). This document quotes Arabic domain terms where precision matters (e.g. "فرخ" = sheet, "زنك" = plate/zinc, "تراج" = press run, "ترقيم" = numbering) because the calculation engine's correctness depends on these exact concepts, not just their English gloss.

---

## 1. Application Architecture

- **Single self-contained HTML file.** No build step, no bundler, no framework. One `<style>` block (~140 lines of hand-written CSS with custom properties for theming) and one `<script>` block (~2,200 lines) containing the entire application.
- **Hand-rolled render loop, not a component framework.** A single global mutable object, `STATE`, holds all application state (current screen, logged-in employee, cart, all loaded collections). Every state change calls `render()`, which rebuilds an HTML string for the current screen and replaces `#cpRoot.innerHTML` wholesale. There is no virtual DOM, no diffing, no component tree — just string templates re-serialized on every interaction.
- **Screen-based "router."** Navigation is a plain string (`STATE.screen`) switched over in `screenBody()` (`login`, `home`, `clients`, `orderType`, `loose`, `notebook`, `envelope`, `folders`, `boards`, `settings`, `history`, `treasury`, `suppliers`, `supplierDetail`, `tenders`, `reports`). There is no URL routing: no deep links, no browser back/forward support, and refreshing the page always returns to the login screen.
- **Global event handlers.** All interactivity is wired through inline `onclick`/`onchange`/`oninput` HTML attributes calling functions attached to `window` (e.g. `window.cpDoLogin`, `window.cpCalcLoose`). This is a deliberate consequence of the single-file, no-module architecture.
- **Persistence via a non-standard host API**, `window.storage.get/set(key, value, isJSON)` — see [§5](#5-storage-usage). This API is never defined in the file; it is provided by the runtime that hosts this file (a Claude.ai Artifact sandbox), not by any browser or server.
- **Printing via a hidden iframe**, not `window.open()`. A code comment explicitly explains why: `window.open()` is blocked inside the sandboxed iframe the app runs in, so `cpPrintDoc()` injects a hidden `<iframe>`, writes a full standalone HTML document into it, and calls `.print()` on it instead.
- **Structural HTML defects that browsers silently tolerate**: the file contains a duplicated `<!DOCTYPE html><html>…<body>` preamble (lines 1–16 repeat the same opening tags twice) and an orphan extra `</body>` at the very end (line 2365). These are latent copy-paste artifacts, not intentional structure.

## 2. Business Modules

| Module                             | What it does                                                                                                                                                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth / Employees**               | Flat list of `{id, name, password, role}`. Login compares plaintext password client-side. No sessions, no route protection.                                                                                                                                                             |
| **Customers / Clients**            | CRUD + live-filter autocomplete picker used when starting any order; per-client order-history filter.                                                                                                                                                                                   |
| **Orders ("Orders and Invoices")** | A tabbed order-builder (أوفست/ديجيتال/لوحات/خدمات) feeding a shared shopping cart, checkout with discount %, optional 14% VAT, multiple split payments, delivery date + notes, and finalization into a single saved record that **is** the invoice (`STATE.orders`).                    |
| **Pricing calculators (offset)**   | Four independent calculators: **Loose Paper** (ورق سايب), **Notebooks** (دفاتر), **Envelopes** (أظرف), **Folders** (فولدرات). See [§3](#3-pricing--calculation-engine).                                                                                                                 |
| **Boards & Banners**               | A fully independent m²/linear-meter pricing engine for banners, vinyl (normal + print-and-cut), flex, and seasro — explicitly commented as unrelated to the offset engine.                                                                                                              |
| **Ready Products & Services**      | Flat catalog items (fixed unit price × qty) for pre-made products and design/montage services.                                                                                                                                                                                          |
| **Quotations**                     | The _same_ cart, printed with an `isQuotation` flag: different header/labels, no payment/collection box, a computed "valid until" date (+7 days). Never persisted — print-only, generated from the live in-memory cart.                                                                 |
| **Work Orders**                    | A production-floor document generated per saved order: shows the _internal_ calculation sheet (actual print sheet size used, run counts, numbering ranges, ink color, binding type) rather than customer-facing pricing. Includes a QR code fetched from a third-party API.             |
| **History**                        | Searchable/filterable list of saved orders, a workflow-status dropdown (`ORDER_STATUSES`, 10 stages from "New" to "Complete"), and reprint actions for invoice/work order.                                                                                                              |
| **Treasury**                       | Manual income/expense/transfer ledger, running balance, filter by type/date/text, printable statement.                                                                                                                                                                                  |
| **Suppliers**                      | CRUD + per-supplier nested purchases/payments ledger with a running balance (debt owed to supplier).                                                                                                                                                                                    |
| **Tenders**                        | Simple CRM list: client, title, estimated value, deadline, status enum (open/submitted/won/lost).                                                                                                                                                                                       |
| **Reports**                        | Date-ranged revenue totals, revenue-by-product-kind, top clients, top models; separate minimal print output.                                                                                                                                                                            |
| **Settings**                       | Logo upload (stored as base64 data URL), global pricing constants, boards m² pricing, ready-products/services catalog, per-base-sheet paper price lists (gayer/regular), the size-family editor (with delete protection for sizes used by the calculation engine), employee management. |
| **Dashboard / Home**               | Today/month/total revenue, treasury balance, total supplier debt, top 5 clients, quick-navigation tiles into every module above.                                                                                                                                                        |

## 3. Pricing & Calculation Engine

This is the highest-value, highest-risk part of the legacy system — it encodes real operational rules from the print shop floor, confirmed in code comments as reviewed with press staff. **It must be ported, not redesigned.**

- **Sheet families** (`DEFAULT_FAMILIES`): named groups of standard sizes for two physical base sheets — "regular" (٧٠×١٠٠ cm) and "gayer" (٦٦×٨٨ cm coated). Each size records how many pieces of that size come out of one full purchased sheet (`famCount`).
- **Tiered calculation size** (`resolveTieredCalc`): for loose paper, folders, and notebooks on the "regular" base, the customer-facing size ("real" size, shown on the invoice) is _not necessarily_ the size the cost is calculated on. Depending on order quantity vs. a configurable threshold (`looseThreshold`, `notebookThreshold`), the engine calculates cost using either a smaller or a larger sheet from the same size group (bigger orders print more efficiently on bigger sheets). A-series sizes (A4/A3) have a distinct hardcoded threshold (`qty > 10`) independent of the general threshold.
- **Numbering size resolution is a deliberately separate function** (`calculateNumberingSheets` / `NUMBERING_RULES` / `NUMBERING_GROUP2_MAP`). A code comment states explicitly: the numbering machine has a fixed physical maximum feed size (٢٣×٣٣ cm), so any print sheet larger than that must be converted to a compatible numbering sheet size — and this conversion **must never share logic** with the print-tiering function above, even though both operate on the same size groups. One documented exception (group 2 / سايز ١٢.٥×١٧.٥) applies a direct 1:1 size map with **no** repeat-count multiplication, unlike every other group.
- **Per-product calculators** each build a `breakdown` object from these ingredients, then apply one global rule: `total = subtotal × (1 + profitPercent / 100)`.
  - **Loose paper**: sheets needed, plate/zinc cost (`zincPrice × colors`), print cost (`ceil(units/1000) runs × colors × sides × printRunPrice`), optional numbering cost (independent calc above), optional flat design fee, configurable waste sheets.
  - **Notebooks**: sheets-per-notebook derived from content type (100 sheets if "original only," `50 + 50×copies` if "original + carbon copies"), same print/numbering/design ingredients, plus a per-notebook binding cost and binding-type label (informational, for the workshop).
  - **Envelopes**: simpler model — flat design fee, plate cost, `ceil(qty/1000)` print runs, plus a per-envelope blank cost (sourced externally, entered manually).
  - **Folders**: same paper/plate/print/design ingredients as loose paper, plus a set of optional flat-fee finishing stages entered per order (ريجة/سلوفان/جراب داخلي/فورمة/تكسير وتلزيق) — sellophane is the only one auto-computed (`sheetsNeeded × sellophanePricePerSheet`); the rest are free-text total amounts.
  - **Boards/banners** (`computeBoards`): entirely separate engine. Vinyl print-and-cut is priced **per linear meter of a 100cm-wide roll**, nesting pieces into rows/columns using a configurable gap (`boardsGapMM`); every other material (banner, vinyl-normal, flex, seasro) is priced **per m²**, with design/sellophane surcharges baked into different unit-price tiers (not added as separate line items).
  - **Ready products / services**: trivial `unitPrice × qty`, no formula.
- **All monetary constants live in one mutable `STATE.settings` object** (zinc price, run prices, design price, global profit %, board m² prices, waste-sheet defaults, size thresholds) — genuinely good: pricing is data, editable from the Settings screen, not hardcoded in the calculators.
- **Every saved cart item snapshots its full `breakdown`** at calculation time. Changing a price or paper name later does **not** retroactively change historical invoices — correct behavior, but also means there is no relational link from a historical line item back to a live paper/price record.

## 4. Data Model

No schema is declared anywhere — everything is untyped JS object literals. Reverse-engineered shape of each persisted collection:

- **`employees`**: `{id, name, password (plaintext), role}`
- **`clients`**: `{id, name, phone?, notes?}`
- **`settings`**: one large nested object — global pricing constants, `families` (size-family table, itself mutable at runtime), `sheetTypes.{gayer,regular}` (paper price lists), `readyProducts[]`, `services[]`, `logo` (base64 data URL or null), plus two unused legacy paper-list arrays (`paperTypesGeneral`, `paperTypesFolders`) kept only for backward data compatibility.
- **`orders`** (this collection _is_ the invoices table): `{id, clientId, clientName (denormalized), employee, date, items[], grandTotal, discountPercent, vatOn, vatAmount, finalTotal, netProfit, profitPercent, payments[], paidAmount, remaining, deliveryDate, paymentTerms, customerNotes, internalNotes, status}`. Each `items[]` entry is `{kind, modelName, breakdown}` where `breakdown` is the full, denormalized calculator output (paper name as a string, not an id; every cost component broken out).
- **`treasury`**: `{id, type: income|expense|transfer, amount, category?, note?, date, employee}`
- **`suppliers`**: `{id, name, phone?, notes?, purchases: [{id, amount, desc, date}], payments: [{id, amount, note, date}]}` — nested arrays, not normalized.
- **`tenders`**: `{id, client, title, value, deadline, status: open|submitted|won|lost, notes}`

There is no relational integrity anywhere: lookups are all "find in array by id, else `undefined`." Deleting a client does not touch their historical orders (the order keeps a denormalized `clientName`, so it still displays — but this can desync from a later client rename).

## 5. Storage Usage

- All persistence goes through `storeGet(key, fallback)` / `storeSet(key, val)`, which wrap the single host API `window.storage.get(key, true)` / `window.storage.set(key, json, true)`.
- **`window.storage` is never defined in this file.** It is a proprietary persistence primitive supplied by the Claude.ai Artifact sandbox the file was built and run inside. It does not exist in a plain browser tab, a static file server, or any conventional hosting environment — **this file cannot run standalone outside that sandbox today.**
- Seven independent top-level keys, each holding one full collection as a JSON blob, each read/written wholesale (no partial updates, no pagination, no querying): `cp_employees`, `cp_clients`, `cp_settings`, `cp_orders`, `cp_treasury`, `cp_suppliers`, `cp_tenders`.
- There is no transactional guarantee across keys or even within a single save — every mutation is a full read-modify-write of one entire array/object.
- `storeGet` swallows every error and silently falls back to an empty array/default value (`catch(e){ return fallback; }`). This means a transient storage failure is indistinguishable from "no data exists yet" from the app's point of view — a real, silent data-loss vector in the original app that must be treated with caution during any data-recovery/export step.

## 6. Printing Engine

- `cpPrintDoc(fullHtml)` writes a complete, independent HTML+CSS document into a hidden same-origin `<iframe>` and calls `iframe.contentWindow.print()`, with a 400ms fallback timer for cases where `iframe.onload` doesn't fire in time (e.g., waiting for the logo/QR image to load).
- Four distinct print documents exist, **each with its own duplicated inline `<style>` block** (no shared print stylesheet):
  1. **Invoice / Quotation** — shared template (`cpInvoiceDocumentHTML`) toggled by an `isQuotation` flag; A4 with `@page` margins, itemized table, account summary box, payment/collection box (invoice only) or "valid until" note (quotation only).
  2. **Work Order** — per-item internal production detail table, plus a QR code image sourced from `https://api.qrserver.com` (external network dependency, no offline fallback, encodes `WorkOrder:{id}|Client:{name}`).
  3. **Treasury statement** — minimal inline-styled ledger table.
  4. **Report** — minimal inline-styled summary paragraphs.
- No PDF generation library is used anywhere; everything relies on the end user's browser print dialog ("print to PDF" is a manual choice by whoever is printing, not something the app controls).

## 7. UI Structure

- Single root mount point, `<div id="cpRoot">`, Arabic-first, `dir="rtl"`.
- Theming via a `data-theme` attribute switching CSS custom properties (`--bg`, `--card`, `--red`, etc.) — dark and light palettes both fully defined.
- A small, consistent CSS-class vocabulary stands in for a component library: `.cp-card`, `.cp-field`/`.cp-input`/`.cp-select`, `.cp-btn` (+ `.secondary`/`.ghost`/`.sm` variants), `.cp-tile` (dashboard grid), `.cp-tabbar`/`.cp-tabbtn` (sub-navigation), `.cp-table`, `.cp-toggle` (switch), and a persistent sticky-bottom `.cp-cartbar` that acts as a live order-building/checkout summary bar.
- Every "component" is really a plain JS function returning a template-literal HTML string, called imperatively from inside `render()`. There is no reusable component instantiation, props, or lifecycle — just string concatenation.

## 8. Strengths

- **The calculation engine encodes real, hard-won operational knowledge.** Comments explicitly reference conversations with the press floor (e.g. the numbering machine's fixed 23×33cm physical limit, the deliberate no-multiplication rule for one specific size group). This is domain truth, not incidental code — it must be preserved exactly, not "cleaned up."
- **Print-tiering and numbering-tiering are intentionally kept as separate functions**, with a comment warning against merging them. A naive re-implementation could easily collapse these into one and silently produce wrong numbering ranges.
- **Pricing is data-driven**, not hardcoded — every constant lives in `STATE.settings` and is editable from the UI, which is already halfway to a proper admin-configurable pricing table.
- **Line items are fully denormalized snapshots** at time of sale, protecting historical invoice accuracy against later price or paper-name changes.
- **A consistent item shape** (`{kind, modelName, breakdown}` → subtotal → total(+profit%) → cart) is reused across all seven product kinds despite very different underlying formulas, which will make a shared `OrderItem` data model in the new system straightforward.
- **A "protected size" guard rail** in Settings stops an admin from deleting a size the tiering/numbering logic structurally depends on.

## 9. Weaknesses

- **No input validation or sanitization.** Every numeric input is `parseFloat(x)||0` with no range/sign checking; free-text fields like `modelName` and notes are interpolated directly into `innerHTML` template strings with no escaping — a stored-XSS vector if this system were ever exposed to untrusted multi-user input over a network.
- **No real authentication security.** Passwords are plaintext, compared client-side; the full employee list (plaintext passwords included) is loaded into the browser and displayed/edited from the Settings screen; there is no session, token, or route protection of any kind.
- **No relational integrity.** All references (`clientId`, `familyKey`, paper `id`) are "find in array or `undefined`," with no foreign keys and no cascade behavior.
- **Global mutable state + full-string re-render** is fundamentally a single-user, single-tab design. Two staff members working concurrently would race on the same `cp_orders` read-modify-write cycle with no locking — this did not surface as a problem in a single-session sandbox but will surface immediately in a real multi-user deployment.
- **Malformed HTML** at the top (duplicated doctype/head/body) and a stray closing tag at the end.
- **Hard external dependencies with no fallback**: Google Fonts CDN import, and a public third-party QR API for work orders. The app requires internet access despite its "database" being local sandbox storage, and work-order printing silently degrades (broken image) if the QR endpoint is unreachable.
- **`window.storage` only exists inside the Claude Artifact sandbox.** The file is not deployable as-is anywhere else.
- **Zero automated tests**, despite containing the most exception-laden, business-critical logic in the entire application.
- **No pagination or virtualization anywhere.** History, Reports, and Treasury render every record into the DOM unconditionally.
- **No audit trail.** Settings/price changes, order edits, and employee password changes are silently overwritten with no history of who changed what, when.

## 10. Risks During Migration

1. **Calculation-parity risk (highest severity).** Any transcription error while porting `resolveTieredCalc`, `calculateNumberingSheets`, `computeBoards`, or any per-product calculator will silently produce wrong prices on real customer invoices. _Mitigation:_ port these as pure functions with a golden-master regression test suite (run the **legacy** calculators against a representative input matrix, capture their exact outputs, and assert the ported functions match bit-for-bit) before any UI is built on top of them.
2. **Unrecoverable data risk.** No "export data" feature exists anywhere in the audited file. If any real production data currently lives only inside a live Claude Artifact's `window.storage`, there is today no documented way to get it out. This must be resolved before Phase 1 begins (see MIGRATION_PLAN.md, Phase 0 gate) or historical customers/orders will be permanently unrecoverable.
3. **Auth migration is not a like-for-like port.** Plaintext employee passwords cannot and should not be carried into Supabase Auth. This requires an explicit re-registration/invite step, not a data script — a logistics item as much as a technical one.
4. **Concurrency correctness is a redesign, not a port.** The "read whole array, mutate, write whole array back" pattern must become row-level relational writes with real transactions, or the new system will _introduce_ race conditions that never practically mattered in a single-session sandbox but absolutely will with multiple staff on multiple devices.
5. **Print fidelity risk.** Reproducing four pixel/print-tuned A4 documents — especially Arabic RTL shaping and `@page` margins — in a new rendering stack risks subtle layout regressions that only surface once someone prints a real invoice on paper.
6. **Unreviewed external dependency.** The QR-code feature depends on a public third-party API with no SLA. Migration must make an explicit decision (keep / replace with a local library / drop) rather than silently carrying it forward.
7. **Settings coupling risk.** Because every module reads from the same nested `STATE.settings` object, a phase that looks self-contained (e.g. Customers) can accidentally require touching pricing/settings code too if the phase scope isn't drawn precisely.
8. **RTL/i18n risk.** The whole UI is Arabic-first RTL. This was "free" in hand-rolled CSS but must be explicitly verified per component in any new UI library (shadcn/ui + Tailwind support RTL, but it is not automatic — each component needs a check).
