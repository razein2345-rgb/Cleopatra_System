# FEATURE-005 — Sprint 1 (UX Foundation) — Verification

## Refinements Pass (Provider-Based Search/Dashboard, Category Settings, RTL Audit)

- `npm run typecheck`/`lint`/`build` (root) — clean. One `eslint.config.js`
  change was required and is itself part of this pass, not a pre-existing
  fix: `react-refresh/only-export-components` flagged
  `src/lib/dashboard/**/*.tsx` for co-exporting a plain registration
  object (or a `useX()` context hook) alongside a component — the exact
  same class of deliberate co-export already exempted for
  `src/components/ui/` (shadcn variant helpers) and `src/state/`
  (context + hook). Extended the same exemption pattern rather than
  restructuring working code around a lint rule.
- **No `apps/api`/`packages/shared` diff** — still true after this pass;
  confirmed the same way as the initial Sprint 1 pass.
- RTL audit: grepped `apps/web/src` for physical-direction Tailwind
  classes (`text-left`/`text-right`, `ml-`/`mr-`/`pl-`/`pr-`,
  `left-`/`right-`) before and after fixing — the only matches remaining
  are the deliberate `dir="ltr"` input exceptions in `LoginPage.tsx`/
  `AcceptInvitePage.tsx` (reviewed, correctly physical — see
  `REFINEMENTS.md` §4) and Radix's own `data-[side=...]` runtime-placement
  classes in `select.tsx`/`dropdown-menu.tsx`/`sheet.tsx`/`tabs.tsx`
  (correctly physical — they describe actual computed popover/drawer
  placement, not ambient text direction).
- Old `src/lib/useWorkflowQueueSummary.ts` (Sprint 1's original hook,
  superseded by `WorkflowQueueSummaryProvider`) deleted; grepped for any
  remaining reference — none found.

## Completed This Pass

- **`npm run typecheck`** (root: `apps/web` then `apps/api`) — clean.
- **`npm run lint`** (root: `apps/web` then `apps/api`) — clean.
- **`npm run build`** (root: `packages/shared` → `apps/api` → `apps/web`)
  — clean. Same pre-existing bundle-size advisory as M1 (>500kB chunk,
  unrelated to this sprint); no new warnings.
- **`npm run test --workspace=apps/api`** — 13/13 passing
  (`adminSafety.test.ts`, unchanged). Run specifically to confirm this
  frontend-only sprint introduced no backend regression, not because any
  backend file changed.
- **No `apps/api`/`packages/shared` diff** — confirmed by searching both
  trees for any file modified during this sprint's session; none found.
  Matches this sprint's "frontend/UI/UX only" and "do not touch APIs"
  constraints as an observed fact, not just stated intent.

## Live Verification (Completed)

Performed against the real running app (`localhost:5173` + `localhost:4000`)
signed in as an existing Super Admin (`razein2345@gmail.com`), with the
real Supabase-backed database — not a mock. Every check below was
cross-referenced against a direct, authenticated call to the same API
endpoint the UI uses, not just visual inspection.

1. **Arabic rendering** — confirmed on App Shell, Dashboard, Partners,
   Quotations, Users, Settings (category picker + Printing category).
   `document.documentElement.{dir,lang}` → `rtl`/`ar`; body font →
   `Cairo, ui-sans-serif, system-ui, sans-serif`. No leftover English
   where a translation was made; pages Sprint 1 didn't touch
   (`PartnerProfilePage`) correctly inherit the translated
   `partnerLabels.ts` values it imports, confirming the shared-label-map
   approach propagates without needing every page rewritten.
2. **Smart Search** — `Ctrl/Cmd+K` opens the palette. All three
   populated groups rendered (الصفحات ×7, العملاء والموردون ×2, عروض
   الأسعار ×1); المنتجات الجاهزة/الخدمات groups correctly absent because
   `GET /api/ready-products` and `GET /api/services` genuinely return
   zero rows in this environment (confirmed directly) — not a bug.
   Selecting a partner result navigated to `/partners/:id` and the
   profile loaded; selecting a quotation result navigated to
   `/quotations/:id`. Both confirmed via `location.pathname`.
3. **Dashboard** — all four widgets cross-checked against direct API
   calls: Open Quotations showed "1 من إجمالي 1 عرض", matching the one
   real `DRAFT` quotation in the database. Active Work Orders/Waiting
   Jobs/Delayed Jobs all showed 0, matching all 11 departments' queues
   being genuinely empty. Loading spinners (not a fake "0") were visible
   before data arrived.
4. **Settings** — category picker shows exactly the five built
   categories with correct labels/descriptions; `/settings/printing`
   loaded real seeded data (13 Gayer + 13 Regular sheet types, 9 size
   families with real entries) behind a working breadcrumb
   (الإعدادات / الطباعة). **Full CRUD round-trip performed and verified
   against the live database**: created a test `SheetType`
   (`TEST-Sheet-Verify`, price 42.5) — confirmed via API; edited its
   price to 99.99 — confirmed via API (`updatedAt` bumped, `price`
   changed); deleted it — confirmed absent from a fresh
   `GET /api/sheet-types`. `FixedPricesForm` edit verified the same way
   (`designPrice` 75 → 76 → restored to 75 to leave the environment
   clean).
5. **Mobile layout** — at a genuine 375×812 viewport: `<aside>` (desktop
   sidebar) computed `display: none`; the hamburger trigger was visible
   and opened `MobileNavDrawer` (a 288px sheet, correctly anchored to
   the right edge under RTL); the Dashboard's widget grid and the
   Settings category grid both computed a single-column
   `grid-template-columns`.
6. **Permission gating** — the signed-in Super Admin has every relevant
   permission, so a genuine "gated away" user wasn't available to test
   directly this pass; the gating logic itself (`can()` checks, unchanged
   from M1's established pattern) was not modified by this sprint and
   was not re-derived here.
7. **Last-active-admin safety rule still works** — incidental confirmation
   while checking the translated Users page: the "تعطيل" (Deactivate)
   button for the sole active Super Admin is correctly `disabled`, with
   the translated tooltip
   ("هذا آخر مسؤول نشط — تم تعطيل هذا الإجراء لمنع فقدان الوصول إلى
   النظام بالكامل.") — confirms translating `UsersPage.tsx` didn't
   regress the ADR 0028 safety mechanism.

## Bugs Found and Fixed During Live Verification

Static checks (typecheck/lint/build/grep) cannot catch layout bugs that
only manifest in an actual rendered DOM — both of these were found by
live inspection, not by re-reading the code:

1. **`DashboardWidget`'s icon rendered stacked above the label instead of
   beside it.** `Card`'s base class includes `flex-col`; my override
   (`"flex items-center gap-4 p-4"`) supplied `items-center` and `gap-4`
   but never a `flex-direction` utility, so `tailwind-merge` had nothing
   to cancel `flex-col` against and it won. Fixed by changing the
   override to `flex-row items-center gap-4 p-4`. Confirmed fixed via a
   live screenshot showing the icon correctly beside the text.
2. **Table header cells (`<th>`) never actually honored the RTL
   alignment fix.** The `text-start`/`text-end` classes from the earlier
   RTL audit were placed on the `<tr>`, but `text-align` — though an
   inherited CSS property — loses to a browser's own UA-stylesheet
   default (`th { text-align: center }`) set *directly* on the `<th>`,
   because a directly-specified value always wins over an inherited one
   regardless of the ancestor's specificity. This means the *original*
   `text-left` (pre-refinement) never worked on headers either — a
   latent bug predating this sprint, not a regression introduced by the
   RTL pass. Fixed across all 8 affected files (`UsersPage`,
   `AddressesTab`, `QuotationsPage`, `ContactsTab`, `PartnersPage`,
   `CategoriesManagement`, `TagsManagement`, `SizeFamiliesEditor`) by
   moving the alignment onto each `<th>` directly via Tailwind's `*:`
   child-variant (`*:text-start`) instead of relying on inheritance from
   the `<tr>`. Confirmed fixed via `getComputedStyle(th).textAlign` →
   `"start"` on both Users and Partners pages after the fix.

Both fixes were re-verified with a full `typecheck`/`lint`/`build` pass
(clean) after applying them.

## Closure

FEATURE-005 Sprint 1 (UX Foundation), including all four post-review
refinements, is **verified and closed**. No `apps/api`/`packages/shared`
diff at any point in the sprint. Two real bugs were found and fixed
during live verification (both documented above); no other defects were
found across Smart Search, Dashboard, Settings CRUD, RTL layout, or
mobile responsiveness.
