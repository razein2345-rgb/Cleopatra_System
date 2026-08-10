# FEATURE-005 — ERP User Experience & Production Dashboard — Analysis

## Critical Finding: The UX Promised in VISION.md Is Almost Entirely Unbuilt

A direct inspection of `apps/web` (not assumed, read in full) shows the
gap between what VISION.md already promises and what exists today is
larger than "polish":

- **`AppShell.tsx` (52 lines) is a single flat `<header>`** — a logo, a
  horizontal row of `NavLink`s, and a sign-out button. No sidebar, no
  breadcrumbs, no command palette, no notification area, no workspace
  tabs. `<main>` is a fixed `max-w-5xl`, centered, same padding always.
- **`DashboardPage.tsx` is explicitly a placeholder** — its own code
  contains the literal string "This is a placeholder dashboard. Business
  modules (orders, treasury, reports, …) arrive in their own migration
  phases." Zero KPI tiles, zero charts, zero production-status widgets.
- **RTL exists in exactly three places**, all page-local: `App.tsx`
  wraps only the `/settings` route in `<div dir="rtl">`; `LoginPage.tsx`
  and `AcceptInvitePage.tsx` each wrap their own `<main dir="rtl">`.
  `index.html`'s `<html>` tag has no `dir` attribute at all. There is no
  i18n/locale library in `package.json`, no Arabic web font anywhere in
  the repo (confirmed by search), and no `rtl:` Tailwind variant
  configured. The other six pages (Dashboard, Partners, Quotations,
  Users, Roles, Permissions) render LTR with English UI text.
- **The component library is one file**: `src/components/ui/button.tsx`.
  `components.json` (shadcn config) is correctly set up, but nothing
  else has been generated — every table, form input, select, tab, and
  "modal" (there is no Dialog component; toggle-able inline `<form>`
  blocks stand in for one) in the entire application is hand-written
  Tailwind, the same utility-class strings copy-pasted near-identically
  across `PartnerProfilePage.tsx`, `ContactsTab.tsx`, `AddressesTab.tsx`,
  `QuotationDetail.tsx`, `UsersPage.tsx`, and more.
- **Zero Work Order / Workflow Engine UI exists** — confirmed by
  searching all of `apps/web/src` for "workflow"/"work-order"; the only
  hits are an unrelated contact-person approval-authority checkbox and
  two code comments documenting that `QuotationDetail.tsx` deliberately
  does *not* encode workflow-transition logic. FEATURE-004 M1 was
  built and verified entirely via direct HTTP calls, exactly as planned
  — this feature is the first time any of it gets a screen.
- **No data-fetching library** — every page fetches via `useEffect` +
  `apiGet`/`apiPost`/`apiPut`/`apiDelete` (`src/lib/api.ts`, a thin
  `fetch` wrapper) into local `useState`, reloading its own list after
  every mutation. No shared cache, no request de-duplication.

None of this is a defect in what was already built — FEATURE-002/003/004
were explicitly scoped backend-first, with "a thin JSON/API exercise, not
a screen" as their own stated verification method (FEATURE-004
02_PLAN.md). This feature is the first one whose entire job is the
screen.

## What Already Exists and Is Directly Reusable

- **`components.json`** — shadcn/ui is already configured correctly
  (style `new-york`, base color `neutral`, path aliases). Generating the
  rest of the component set is additive to existing tooling, not a new
  decision.
- **`src/index.css`'s CSS-variable theme** — a full light/dark
  `oklch()`-based shadcn theme already exists (background, primary,
  destructive, border, radius, etc.). It's currently un-branded neutral
  grey; this feature can apply Cleopatra branding to the *existing*
  variables rather than building a theme system from nothing.
- **`cn()` (`src/lib/utils.ts`)** — clsx + tailwind-merge, already the
  convention `button.tsx` uses; every new component follows the same
  pattern.
- **`QuotationDetail.tsx`'s presentation-independence** — it already
  takes `{quotationId?, onSaved?}` as props only, no `useParams`, no page
  chrome, specifically so it "needs no changes to be dropped into
  [a Side View] later" (FEATURE-003 M1's own Multi View Compatibility
  decision). This is the **direct, already-built precedent** for Multi
  View System's Full Page/Side View split — Side View isn't a new
  pattern to invent, it's a new *host* for a pattern that already
  exists. The same shape should be confirmed/applied to
  `PartnerProfilePage`'s tab content and a new Work Order detail view.
- **`AuthContext.tsx`'s `can()`** — every new screen's visibility
  follows the exact same permission-check call every existing page
  already uses; no new authorization mechanism.
- **The Workflow Engine's read API (FEATURE-004 M1)** —
  `GET /api/workflow-instances/queue?departmentId=`,
  `GET /api/workflow-instances/:id`, `GET /api/work-orders/:id` already
  return everything the Production Board needs, department-scoped via
  `canAccessDepartment` exactly as required. The Board is close to a
  pure "call this endpoint, render a table" build.
- **`isLastActiveAdmin()` (`src/lib/adminSafety.ts`)** — the established
  pattern for a UI-only mirror of a backend rule (ADR 0028), already
  proven in `UsersPage.tsx`. Any future frontend rule-mirroring (e.g.
  disabling an action the Board's current department queue can't
  support) follows this exact shape, not a new one.

## What's Present but Needs a Decision, Not Just Reuse

- **Production Dashboard's data source.** Every existing Workflow Engine
  endpoint is scoped to one instance or one department. VISION.md's
  representative Dashboard views ("Jobs waiting," "Jobs by department,"
  "Delayed jobs" — cross-department aggregates) don't have a single
  existing endpoint that answers them directly. See Open Decisions.
- **"Modern Arabic RTL interface"'s exact scope** — global layout/RTL
  correctness (a structural, one-time change) versus full translation of
  every existing English page's copy (an ongoing, much larger,
  content-focused effort). See Open Decisions.
- **Reconciling with FEATURE-004 02_PLAN.md's already-deferred
  "Milestone 2."** That plan proposed a template-authoring screen, a
  department queue screen, and a `WorkflowInstance` timeline view as one
  bundle. FEATURE-005's named goals (Production Board, Better Partner
  Profile) cover two of those three; template authoring isn't named
  here. See Open Decisions.

## Real Gaps (What This Feature Actually Needs to Add)

1. A generated shadcn component set beyond `Button`: `Input`, `Textarea`,
   `Select`, `Checkbox`, `Label`, `Table`, `Tabs`, `Dialog`, `Sheet` (the
   natural shadcn primitive for a Side View — a slide-over panel), `Card`,
   `Badge`, `Command` (for keyboard-driven search/navigation),
   `DropdownMenu`, `Separator` — **treated as an internal foundation
   layer only**, per the approved Cleopatra Design System refinement
   (`00_REQUIREMENTS.md` §0a Refinement 1): pages compose Cleopatra
   components, not these primitives directly.
1a. A design tokens layer (colors, spacing, typography, radius, shadows)
   applied to the existing CSS-variable theme *before* any of the above
   is generated (§0a Refinement 5), and a Cleopatra component library
   (`WorkflowCard`, `DashboardWidget`, `StatusBadge`, `CustomerCard`,
   `DepartmentQueue`, etc.) built on top of the shadcn layer.
2. A real `AppShell` — sidebar/nav restructuring, a command palette, RTL
   layout awareness, responsive/collapsible by design with multi-level
   nav support (§0a Refinement 2).
3. Global RTL infrastructure: `<html dir="rtl">`, an Arabic web font,
   removal of the now-redundant three page-local `dir="rtl"` wrappers.
4. `Department` and `WorkflowInstance`/`StageInstance` read calls wired
   into a new Production Board screen.
5. Whatever the Production Dashboard's data source turns out to be (see
   Open Decisions) — a new screen either way.
6. Partner Profile's tabs/forms migrated onto the new component set — no
   new capability, a rebuild of the same screen on new primitives.
7. A Side View host component (built once, used by Quotation, Partner,
   and a new Work Order detail — the first *reuse* of Multi View System,
   proving the pattern rather than just declaring it).
8. Search + keyboard shortcuts — new, small, cross-cutting.

## Architectural Tension: FEATURE-004's Deferred "Milestone 2" vs. This Feature's Scope

FEATURE-004 02_PLAN.md proposed, as a *separate, not-yet-approved*
Milestone 2: a template-authoring screen, a department queue screen, and
a `WorkflowInstance` timeline view. This request names "Production
Board" (= the department queue screen) and implicitly a Work Order detail
view (via "Better Partner Profile"/"Fast daily workflows," and via the
Board needing somewhere to link a job's detail to) as part of FEATURE-005
— but does not name template authoring.

**Resolved for this plan**: FEATURE-005 supersedes the queue-screen and
timeline-view portions of FEATURE-004's deferred Milestone 2 — building
them here, under this feature's number, rather than reviving FEATURE-004
M2 as a separate thing. Template authoring remains deferred, undecided,
not part of this plan — it's an administrative/back-office screen, not
named among this request's goals, and nothing in FEATURE-005 blocks
building it later exactly as FEATURE-004 02_PLAN.md already sketched it.

## Business Object Architecture Applied

Every screen this feature builds is a new *view* over an existing
Business Object (`BusinessPartner`, `Quotation`, `WorkOrder`,
`WorkflowInstance`) — never a new implementation of one. The Partner
Profile rework is the concrete proof: same `BusinessPartner` record, same
five tabs' worth of capability, same API calls, different presentation
components underneath.

## Permission Mapping

No new permission catalog entries. Every screen reads through an
existing gate:

- Production Board / Work Order detail — `work-orders.view`
  (`canAccessDepartment` further scopes the Board within that).
- Production Dashboard — whatever permission(s) the resolved data source
  already requires (see Open Decisions; if a new aggregate endpoint is
  approved, it's gated the same way, not a new permission concept).
- Partner Profile — unchanged: `partners.view`/`partners.edit`/
  `partners.credit.manage`, exactly as today.

## Open Decisions — Flagged for Explicit Confirmation in `02_PLAN.md`, Not Silently Assumed

1. **RESOLVED (approved with the M1–M4 breakdown):** the Production
   Dashboard is backed by one new, narrowly-scoped, read-only aggregate
   endpoint — `GET /api/workflow-instances/dashboard-summary` — built in
   M2, on the explicit condition that it reuses existing business logic
   only (the same `computeIsDelayed` and grouping logic the queue
   endpoint already uses) and introduces no new calculation or duplicated
   rule. See `00_REQUIREMENTS.md` §0a Refinement 3 and `02_PLAN.md`'s
   Milestone 2 section.
2. **Full page-copy translation is out of scope for this milestone**
   (00_REQUIREMENTS.md §3) — only global RTL/layout correctness and an
   Arabic font are in scope. If the actual intent was "translate the
   whole application to Arabic now," that's a substantially larger,
   separate, content-focused effort and should be said explicitly before
   work starts on it.
3. **Modal and full in-app Workspace Tabs (a persistent multi-record tab
   strip) are deferred** past this milestone — Full Page + Side View +
   (already-working) New Tab is the proposed scope; Modal and a tab strip
   are real, separate builds, not a natural extension of the same work.
4. **Template authoring UI stays deferred**, not part of this feature —
   see Architectural Tension above.
