# FEATURE-005 — Sprint 1 (UX Foundation) — Plan

Scope, resolved against `01_ANALYSIS.md`'s Critical Findings: build
everything Section 1–6 asks for that has a real data source under this
sprint's own constraints (no new API "unless absolutely required," no
schema change); every item without one is named explicitly as deferred,
not silently dropped. Proceeding straight through Implementation and
Verification in this pass, per this request's explicit instruction — no
mid-sprint approval stop.

## 1. Arabic Localization

Every string this sprint's own new/touched components render becomes
Arabic: the App Shell (`Sidebar`/`Topbar`/`CommandPalette`/
`MobileNavDrawer` chrome — nav labels, search placeholder, sign-out,
collapse/expand labels), the new Dashboard, and the chrome (headings,
buttons, table column headers, empty states, loading states, form
labels) of every existing page this sprint's other sections touch or
pass through: Partners, Quotations, Users, Roles, Permissions, Settings.
Deep-content pages not touched by any other section of this sprint
(e.g. `QuotationDetail`'s full line-item editor) are translated only
where trivial (labels already following the Settings/Login convention);
a systematic pass over every remaining page is Sprint 2 material, named
in Remaining Work below rather than attempted incompletely here.

No i18n library introduced — the codebase's own established convention
(Login/Accept-Invite/Settings: hardcoded Arabic strings, English
identifiers) continues unchanged; Arabic is not a toggle, it's the
rendered language, matching "Arabic must be the default language" with
no language-switcher requested.

## 2. Smart Search

Extend `CommandPalette` (`src/components/cleopatra/CommandPalette.tsx`)
in place — same component, same `Ctrl/Cmd+K` trigger, same keyboard
nav — to fan out to five existing list endpoints on open (debounced by
the query text), grouped by type:

- 👤 Customers/Suppliers — `GET /api/businessPartners`, client-side
  filtered by name/phone/email (permission: `partners.view`).
- 📄 Quotations — `GET /api/quotations`, filtered by number/partner name
  (permission: `quotations.view`).
- 📦 Products — `GET /api/ready-products` (permission: `settings.view`).
- 🛠️ Services — `GET /api/services` (permission: `settings.view`).
- 🧭 Pages — the existing static nav list (unchanged).

Each group only fetches if the signed-in user has its permission — same
pattern the Sidebar already uses. Selecting a result navigates to that
record's existing detail route (Partner Profile, Quotation Detail); for
Products/Services (no detail route exists), selecting opens Settings'
relevant section.

**Not included** (`01_ANALYSIS.md` Critical Findings #1, #3, #5, #6):
Orders, Invoices, Employees, Machines, barcode/QR/universal document
search — Employees is a genuine near-miss (a `GET /api/users` list does
exist) but is deferred here to keep this sprint's Search scope to
entities already surfaced elsewhere in the app; adding it is a one-group
extension of the same pattern, safe to pick up in Sprint 2.

## 3. Printing Settings

Rebuild the relevant sections of `SettingsPage.tsx` from read-only
`Field`/table rendering into real CRUD, each against its existing
endpoint:

- **Fixed Prices** (`Setting`, singleton) — one form, `PUT /api/settings`,
  covering every real field: design price, plate/zinc prices (labeled
  "أسعار الزنكات" — Plate Prices, `zincPrice`/`envelopeZincPrice`), print
  run and numbering run prices (Printing/Numbering Costs), envelope
  pricing, sellophane price, waste sheets default, profit percent
  (Default Profit Margin), notebook/loose thresholds, board & signage
  prices.
- **Sheet Types** (paper stock name + price + base) — add/edit/delete via
  `POST`/`PUT`/`DELETE /api/sheet-types`. No width/height/active/notes/
  reorder fields — not shown, per Critical Finding #8.
- **Size Families & Entries** (physical cut sizes) — add/edit/delete
  family and entries via `/api/size-families`. **Correction from this
  plan's first draft**: `SizeFamilyEntry.sortOrder` exists on the model
  and is set on creation (`sizeFamilies.ts` controller: `count(...)` at
  insert time — append-only), but `updateSizeFamilyEntrySchema` only
  accepts `label`/`piecesPerSheet` — there is no route that writes
  `sortOrder`. Reorder is **not** actually available through the
  existing API; entries list in creation order, no up/down controls are
  built. Adding one would be new API surface, which this sprint doesn't
  do without being asked.
- **Ready Products** / **Services** — add/edit/delete via their existing
  routes.

**Not included** (Critical Finding #7): dedicated Ink Prices or
Finishing Costs sections — no field exists to edit.

## 4. Dashboard

Replace `DashboardPage.tsx`'s placeholder with Cleopatra `DashboardWidget`
cards, each reading only existing endpoints:

- **Quotations** — count from `GET /api/quotations`, broken down by
  status (client-side grouping of an already-fetched list, not a new
  calculation).
- **Active Work Orders / Waiting Jobs / Delayed Jobs** — one
  `GET /api/departments` call, then one `GET /api/workflow-instances/
  queue?departmentId=` per department the signed-in user can access
  (`canAccessDepartment` already scopes the list), merged client-side.
  "Delayed" reuses the `isDelayed` flag the queue endpoint already
  computes server-side; nothing is recalculated.

**Not included** (Critical Findings #1–2, #4): Today's Orders, Revenue,
Cash, Inventory Alerts — no data source exists for any of them.

## 5. Mobile UX

Applied across every page touched by Sections 2–4 above (Dashboard,
Settings) plus a pass over Partners/Quotations/Users/Roles/Permissions'
existing tables: wrap tables in a horizontal-scroll container at narrow
widths (`overflow-x-auto`), verify forms/dialogs/cards reflow to a single
column below `sm:`, and confirm the new Settings edit forms and Dashboard
widgets are usable at the same 375px width M1's App Shell was verified
at.

## 6. Design System

No new component bypasses `src/components/cleopatra/`. New components
this sprint adds: `DashboardWidget` (wraps `Card`), a search-result-group
renderer inside `CommandPalette` (uses existing `CommandGroup`/
`CommandItem`), and simple edit-row/edit-dialog patterns for Settings
built on the existing `Dialog`/`Input`/`Label`/`Button` primitives via
`Sidebar`-pattern-consistent Cleopatra wrappers where reused more than
once (a generic `EditableList` pattern for Sheet Types/Ready Products/
Services, since all three share the same name+price+delete shape).

## Verification Plan

- `npm run typecheck`/`lint`/`build` — clean, and confirm no diff under
  `apps/api`'s business logic (`services/`), the Workflow Engine, or
  `prisma/schema.prisma` — only new/changed routes-consuming frontend
  code and, if genuinely unavoidable, additive read-only backend surface
  (none is currently expected — see above).
- Live verification: Arabic renders correctly across every screen this
  sprint touches; RTL/responsive layout at mobile width; Smart Search
  returns real results across all five groups and respects permission
  filtering; Printing Settings edits round-trip (create/edit/delete a
  test Sheet Type and Size Family entry, confirm persistence); Dashboard
  cards show real counts matching what the underlying list/queue
  endpoints return.

## Remaining Work (Explicitly Not This Sprint)

- Orders/Invoices/Revenue/Cash/Inventory-Alerts/Machines/barcode-QR
  search and dashboard data — blocked on modules that don't exist yet
  (Order list/CRUD, Treasury/Invoicing, real inventory tracking,
  equipment/machine tracking). Building any of these is schema/API work
  this sprint explicitly excludes.
- Ink Prices / Finishing Costs settings — blocked on new `Setting`
  fields (schema change).
- Per-paper-size Width/Height/Category/Active/Notes/Reorder — blocked on
  new `SheetType` fields (schema change) or a decision to repurpose
  `SizeFamily`/`SizeFamilyEntry` instead.
- Toast/tooltip system — a new UX capability, not a translation task;
  not requested by anything else in this sprint's named sections.
- Employees in Smart Search — a safe, small extension of the pattern
  built here; deferred only to bound this sprint's stated scope.
- A systematic, page-by-page translation pass over every remaining
  screen's deep content (not just chrome) — `QuotationDetail`'s line-item
  editor, `PartnerProfilePage`'s tabs' full forms, etc.
- Production Board (department-queue screen with stage-advance actions)
  and the Partner Profile/Side View rework — the original `02_PLAN.md`'s
  M3 content, not named in this sprint's request.

**Sprint 2 is not started. Waiting for approval before it begins**, per
this request's explicit instruction.
