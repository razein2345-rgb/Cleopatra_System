# FEATURE-005 — Sprint 1 (UX Foundation) — Implementation

`apps/api` and `packages/shared` have no diff — confirmed by checking for
any file under `apps/api/src`, `apps/api/prisma`, or `packages/shared/src`
modified during this sprint (none found). Every screen below reads/writes
through endpoints that already existed before this sprint.

## 1. Arabic Localization

Translated the chrome (headings, buttons, table headers, empty/loading
states, form labels, confirm/alert messages) of every screen this sprint
touches:

- App Shell: `AppShell.tsx` (nav labels), `Topbar.tsx`, `CommandPalette.tsx`,
  `MobileNavDrawer.tsx`.
- `pages/partners/partnerLabels.ts` and `pages/quotations/
  quotationLabels.ts` — every enum label map (`PARTNER_ROLE_LABELS`,
  `PARTNER_STATUS_LABELS`, `ADDRESS_TYPE_LABELS`, `PAYMENT_METHOD_LABELS`,
  `COMMERCIAL_STATUS_LABELS`, `RISK_LEVEL_LABELS`,
  `QUOTATION_STATUS_LABELS`, `QUOTATION_APPROVAL_LABELS`,
  `ORDER_STATUS_LABELS`, `ITEM_TYPE_LABELS`) — used across Partners,
  Quotations, and Partner Profile's tabs, so translating the map
  translates every screen that renders one of these values.
- `pages/partners/PartnersPage.tsx`, `pages/quotations/QuotationsPage.tsx`,
  `pages/users/UsersPage.tsx`, `pages/roles/RolesPage.tsx`,
  `pages/permissions/PermissionsPage.tsx`, `pages/settings/SettingsPage.tsx`,
  `pages/settings/CategoriesManagement.tsx`, `pages/settings/
  TagsManagement.tsx` — every hardcoded English string.
- The new Dashboard and Settings pricing editors were written in Arabic
  from the start (new UI, not a translation of prior English copy).

**Deliberately not translated** (`02_PLAN.md`'s own scope line): deep
content on pages this sprint doesn't otherwise touch —
`QuotationDetail`'s full line-item editor, `PartnerProfilePage`'s tab
bodies beyond what the shared label maps already cover, `AcceptInvitePage`
(already Arabic from Phase 2). No i18n library was introduced — every
string is a plain literal, matching the codebase's existing convention.

## 2. Smart Search

Rewrote `CommandPalette.tsx` in place. On open, it fetches (permission-
gated, same `can()` checks the Sidebar already uses):

- `GET /api/partners` → "العملاء والموردون" group (`Building2` icon)
- `GET /api/quotations` → "عروض الأسعار" group (`FileText` icon)
- `GET /api/ready-products` → "المنتجات الجاهزة" group (`Package` icon)
- `GET /api/services` → "الخدمات" group (`Wrench` icon)
- the existing static nav list → "الصفحات" group (unchanged)

Each `CommandItem`'s `value` is the searchable text (name + phone + email
for partners, number for quotations, name for products/services); cmdk's
own fuzzy filter matches against it as the user types — no custom search
logic was written. Selecting a partner/quotation navigates to its
existing detail route; products/services (no detail route exists) open
Settings. `Ctrl/Cmd+K` and the Topbar's search button both still open it,
unchanged from M1.

## 3. Printing Settings

`SettingsPage.tsx` no longer renders `Setting`/`SheetType`/`SizeFamily`/
`ReadyProduct`/`Service` as read-only `Field`s and tables — each now goes
through a new editor component, all built on the existing CRUD endpoints
(no new API):

- `FixedPricesForm.tsx` — a 21-field edit form for the `Setting` singleton,
  `PUT /api/settings`. View mode shows the same values the old read-only
  render did; "تعديل الأسعار" switches to an editable grid.
- `SheetTypesEditor.tsx` — add/edit/delete for `SheetType`, rendered once
  per `base` (GAYER/REGULAR) exactly like the old two-column layout.
  `POST`/`PUT`/`DELETE /api/sheet-types`.
- `SizeFamiliesEditor.tsx` — add/edit/delete for `SizeFamily` entries,
  `POST`/`PUT`/`DELETE /api/size-families/:id/entries/:entryId`. No
  reorder controls — see Critical Finding #8's correction below.
- `ReadyProductsEditor.tsx` / `ServicesEditor.tsx` — add/edit/delete via
  their existing routes.

All four editors are gated the same way the pre-existing
`CategoriesManagement`/`TagsManagement` components already are: read for
`settings.view`, add/edit/delete controls only render for `settings.edit`.

**Correction made during implementation** (to `01_ANALYSIS.md`/
`02_PLAN.md`'s first draft): `SizeFamilyEntry.sortOrder` exists on the
model and the schema, but `updateSizeFamilyEntrySchema`
(`packages/shared/src/schemas/sizeFamily.ts`) only accepts `label`/
`piecesPerSheet` — `sizeFamilies.ts`'s controller only ever *sets*
`sortOrder` once, at creation (`count(...)`-based append). There is no
route that reorders. Both planning documents were corrected in place
before this was built, and no reorder UI was added — building one would
be new API surface this sprint doesn't add without being asked.

## 4. Dashboard

`DashboardPage.tsx` replaced entirely. `useWorkflowQueueSummary.ts` (new,
`src/lib/`) fetches `GET /api/departments` once, then
`GET /api/workflow-instances/queue?departmentId=` once per department the
signed-in user can access, and merges the results client-side into
`{ activeWorkOrders, waitingJobs, delayedJobs }` — `isDelayed` is read
from each item, never recomputed. `DashboardWidget.tsx` (new,
`src/components/cleopatra/`) is the one card shape every metric renders
through — an icon, a label, a value (or a spinner while `null`), an
optional hint, five semantic tones (reusing the M1 design tokens'
`success`/`warning`/`danger`/`info`/`neutral`). Four cards ship: Open
Quotations (`GET /api/quotations`, client-side status filter), Active
Work Orders, Waiting Jobs, Delayed Jobs. Today's Orders/Revenue/Cash/
Inventory Alerts are not shown — no data source exists (`01_ANALYSIS.md`
Critical Findings #1–2, #4).

## 5. Mobile UX

No new responsive infrastructure was needed — M1's tables already used
`overflow-x-auto` wrappers (Partners/Quotations/Users, unchanged), and
every new form/editor built this sprint (`FixedPricesForm`,
`SheetTypesEditor`, `SizeFamiliesEditor`, `ReadyProductsEditor`,
`ServicesEditor`, the Dashboard's widget grid) uses the same
mobile-first `grid-cols-1 sm:grid-cols-*`/`flex-wrap` patterns already
established in `CreatePartnerForm`/`CreateUserForm`, so they reflow to a
single column below `sm:` without any extra work.

## 6. Design System

No application code added an import from `src/components/ui/` directly
this sprint — `DashboardWidget` and `CommandPalette`'s new groups both
compose existing `src/components/cleopatra/` and `src/components/ui/`
pieces from within the Cleopatra layer itself, the same discipline M1
established.
