# FEATURE-005 — Sprint 1 (UX Foundation) — Changelog

Full Arabic localization of every screen this sprint touches (App Shell,
Dashboard, Partners, Quotations, Users, Roles, Permissions, Settings and
its enum label maps); a real Smart Search replacing the M1 Command
Palette's navigation-only list, grouped across Partners/Quotations/
Products/Services/Pages; a real operational Dashboard (Open Quotations,
Active Work Orders, Waiting Jobs, Delayed Jobs) replacing the placeholder;
and a fully editable Printing Settings screen (Fixed Prices, Sheet Types,
Size Guide, Ready Products, Services) replacing what M1 confirmed was
read-only-only rendering of data that was already CRUD-capable on the
backend since Phase 1.

Nine requested capabilities have no backing data source yet and were not
built rather than faked: Today's Orders / Revenue / Cash / Inventory
Alerts (Dashboard), Orders / Invoices / Machines / barcode-QR search
(Smart Search), Ink Prices / Finishing Costs / per-paper-size Width-
Height-Category-Active-Notes / entry reordering (Printing Settings), and
a toast/tooltip system (nothing exists yet to translate). Each is named
explicitly in `01_ANALYSIS.md`'s Critical Findings and `02_PLAN.md`'s
Remaining Work, not silently dropped.

`apps/api` and `packages/shared` have zero diff — this sprint is
`apps/web` only, exactly as instructed.

Live browser verification (Arabic rendering, Smart Search results,
Dashboard numbers cross-checked against direct API calls, Settings CRUD
round-trips, mobile layout) is complete — see `04_VERIFY.md`'s "Live
Verification" section. Two real layout bugs were found and fixed during
that pass (a `DashboardWidget` flex-direction override that never took
effect, and table header cells silently ignoring the RTL alignment fix
due to a CSS inheritance/specificity interaction) — both documented in
`04_VERIFY.md`'s "Bugs Found and Fixed" section.

## Refinements (Post-Review, Pre-Sprint-2)

Four architectural refinements requested after Sprint 1's initial review
— full rationale in `REFINEMENTS.md`:

1. **Smart Search → provider architecture.** `CommandPalette.tsx` no
   longer hardcodes per-entity fetch logic; it renders a generic
   `SearchProvider[]` list (`src/lib/search/`). Same five groups today
   (Pages, Partners, Quotations, Products, Services); adding a future
   entity (Orders, Work Orders, Inventory, Employees, Suppliers,
   Treasury, Invoices, Marketing Leads, Goals, Workflow Templates, ...)
   is one new provider file + one registry entry, once each has a real
   list endpoint — no disabled/stub providers were added for entities
   that don't exist yet.
2. **Dashboard → widget registry architecture.** `DashboardPage.tsx`
   contains no widget logic — `src/lib/dashboard/registry.ts` lists
   `{ id, permission?, Component }` entries, each fully self-contained.
   The three queue-derived widgets share one `WorkflowQueueSummaryProvider`
   (React context) instead of each independently fetching, avoiding a
   3x department-queue call regression as more widgets are added.
3. **Settings → category-based.** `/settings` is now a category picker;
   `/settings/:categoryId` renders that category (الطباعة/التسعير/
   المنتجات/الخدمات/الشركة) with a breadcrumb. Library/Workflow/AI &
   Advisor aren't rendered yet — no real screen exists for them.
   "Users & Permissions" was flagged, not silently moved — they stay
   top-level Sidebar destinations.
4. **RTL-first pass.** Audited `apps/web/src` for physical-direction
   Tailwind classes (`text-left`/`right`, `ml-`/`mr-`/`pl-`/`pr-`,
   `left-`/`right-`) and converted them to logical properties
   (`text-start`/`end`, `ms-`/`me-`/`ps-`/`pe-`, `start-`/`end-`) — table
   headers/last-column cells, the sidebar-collapse icon (was
   `PanelLeftClose`/`Open`, now `PanelRightClose`/`Open` — the sidebar is
   visually on the right under RTL), dialog/sheet close-button position,
   and dropdown submenu chevron direction. New breadcrumbs use a plain
   `/` separator rather than a directional chevron.

Still zero `apps/api`/`packages/shared` diff. Live browser verification
of the refinements is complete (see `04_VERIFY.md`).

## Closed

FEATURE-005 Sprint 1, including all four refinements, is verified and
closed. Sprint 2 has not started.
