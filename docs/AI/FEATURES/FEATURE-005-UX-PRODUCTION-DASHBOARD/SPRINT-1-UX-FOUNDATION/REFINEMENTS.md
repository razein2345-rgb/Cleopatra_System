# FEATURE-005 — Sprint 1 (UX Foundation) — Refinements

Four architectural refinements requested after Sprint 1's initial review,
before Sprint 2. All four are frontend-only, no schema/API changes —
same constraints as Sprint 1 itself.

## 1. Smart Search → Provider-Based Architecture

**Decision**: `CommandPalette.tsx` no longer hardcodes "if
`partners.view`, fetch `/api/partners`..." per entity. It becomes a
generic renderer over a `SearchProvider[]` list. Each provider is a
small, self-contained object: `{ id, groupLabel, permission?, fetch()
}`. Adding a future provider (Orders, Work Orders, Inventory, Library
Products, Machines, Employees, Suppliers, Treasury, Invoices, Marketing
Leads, Goals, Workflow Templates — once each has a real list endpoint)
is: write one file implementing `SearchProvider`, add it to
`SEARCH_PROVIDERS`. `CommandPalette.tsx` itself never changes again for
a new entity type.

**Not built**: providers for entities with no backing endpoint yet
(everything past Partners/Quotations/Products/Services in the requested
list). Per MASTER_PROMPT.md ("never invent APIs") and Sprint 1's own
Critical Findings, no disabled/stub providers were added for these — the
architecture (the interface + registry) is what "supports" them, not a
placeholder entry. This avoids the exact thing Sprint 1 was careful to
avoid: fake data or dead UI standing in for something that doesn't exist
yet.

Page navigation stays a first-class provider too (`buildPagesProvider`,
built from the `NavEntry[]` the Sidebar already uses) — the whole
palette is provider-driven, no special-cased group.

## 2. Dashboard → Widget Registry Architecture

**Decision**: `DashboardPage.tsx` no longer contains widget logic. Each
widget is a fully self-contained component (`{ id, permission?,
Component }` in `DASHBOARD_WIDGETS`) that fetches its own data and
renders its own `<DashboardWidget>` card. Adding a widget later is: one
file, one registry entry. `DashboardPage.tsx` only filters the registry
by permission and renders `<w.Component />` for each visible entry.

**Shared-data problem, solved with a provider, not per-widget
duplication**: Active Work Orders / Waiting Jobs / Delayed Jobs all read
the same per-department queue fan-out. Making each a fully independent
widget that calls `useWorkflowQueueSummary()` on its own would triple
the number of department-queue HTTP calls on every Dashboard load — a
real regression, not free. Fixed with a `WorkflowQueueSummaryProvider`
(React context) that fetches once; the three widgets read it via
`useWorkflowQueueSummaryContext()` instead of fetching themselves. This
is the general answer to "dozens of widgets": widgets that share a data
source share a context provider; widgets that don't (Open Quotations)
fetch independently. Neither pattern requires touching `DashboardPage.tsx`.

## 3. Settings → Category-Based

**Decision**: `/settings` becomes a category picker (`SettingsHome`);
`/settings/:categoryId` renders that category's screens with a
breadcrumb. `SETTINGS_CATEGORIES` maps today's real screens onto five
categories from the requested example list:

- **الطباعة (Printing)** — Sheet Types, Size Guide
- **التسعير (Pricing)** — Fixed Prices
- **المنتجات (Products)** — Ready Products
- **الخدمات (Services)** — Services
- **الشركة (Company)** — Partner Categories, Partner Tags (business-wide
  classification, not printing-specific — didn't fit any of the other
  four cleanly)

**Not rendered yet** (no source screen exists): Library, Workflow, AI &
Advisor — these were in the requested example list, but building them
now would mean an empty category page, which is the UI equivalent of
the "invent an API" problem this sprint has avoided elsewhere. Adding
one later is a registry entry, same as the other two provider systems
above — `SettingsHome`/`SettingsPage` don't change.

**Open question, flagged rather than decided unilaterally**: "Users &
Permissions" was in the requested example category list, but Users,
Roles, and Permissions are currently *top-level* Sidebar destinations
(`/users`, `/roles`, `/permissions`), not under `/settings` at all —
they're used constantly, and VISION.md's Employee Experience explicitly
values fast, muscle-memory navigation for frequent actions. Moving them
under a Settings category is a real information-architecture decision
with a UX cost (extra click, broken bookmarks) that isn't unambiguously
required by "Settings should be category-based" — that instruction is
about the *Settings page's own* content, and Users/Roles/Permissions
don't live there today. **Left as-is** (still top-level Sidebar items,
routes unchanged) rather than guessed at. Flagged for an explicit
decision if the intent was to relocate them.

## 4. Arabic UX — RTL-First Pass

Global `dir="rtl"` (M1) makes most of the app correct automatically —
flexbox rows already visually mirror, and content that uses Tailwind's
*logical* properties (`ps-`/`pe-`/`ms-`/`me-`/`text-start`/`text-end`)
already adapts. The actual defects are everywhere a *physical* property
was used instead (`text-left`, `ml-`/`mr-`, `pl-`/`pr-`, `left-`/
`right-`) — these don't flip under `dir="rtl"` at all, which is exactly
the "translated, not designed for RTL" feeling being asked to fix.
Audited and corrected across every file `apps/web/src` — see
`03_IMPLEMENT.md`'s "Arabic UX" section for the specific list. Breadcrumbs
(new, for Settings' category navigation) use a plain `/` separator, not a
directional chevron icon — sidesteps the "which way should the arrow
point in RTL" problem entirely rather than getting it wrong.
