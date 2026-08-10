# FEATURE-005 — ERP User Experience & Production Dashboard — Requirements

## 0. Context and Priority

The architecture foundation is complete: Business Partners (FEATURE-002,
through M6), the Quotation Engine (FEATURE-003, through M2 — Order
Conversion), the Security Foundation (last-active-administrator
protection, Row Level Security as Defense-in-Depth, Backend-Only Database
Access), and the Workflow Engine (FEATURE-004 M1 — Templates, Versions,
Stages, Instances, department queues, events) are all done and verified.

**This feature is explicitly not a business feature.** It adds no schema,
no business rules, no new permissions beyond what's strictly needed to
view data that's already permission-gated. It exists to turn everything
built so far into something a real employee can use all day: a proper
application shell, an Arabic-first RTL interface, and the first real
screens over the Workflow Engine's data (a Production Dashboard and a
Production Board) — plus a genuine, reusable component library, since
today there isn't one (see `01_ANALYSIS.md`).

**Constraints, stated as received and binding for this entire feature:**

- Do not modify `docs/AI/VISION.md`. Every requirement below cites the
  section of VISION.md it already implements — this feature builds what
  was promised, it does not propose new promises.
- Do not redesign the Workflow Engine. FEATURE-004 M1's schema, services,
  and API are used exactly as they exist today.
- No new business logic. UI components display and collect data; they
  never decide a business rule themselves (VISION.md's Component
  Architecture).
- Reuse the existing Workflow Engine, Business Objects, Permissions, and
  API — this is a presentation-layer feature.

## 0a. Refinements (Approved With M1–M4 Breakdown)

The M1–M4 breakdown in `02_PLAN.md` is approved. Five refinements apply
across the whole feature, binding starting with M1:

1. **Cleopatra Design System, not raw shadcn.** shadcn/ui is the
   foundation layer only. Application pages never import from
   `components/ui` directly for anything ERP-shaped — a new Cleopatra
   component library layer (`WorkflowCard`, `DashboardWidget`,
   `StatusBadge`, `CustomerCard`, `DepartmentQueue`, etc.) composes
   shadcn primitives into the vocabulary this ERP actually uses. See
   `02_PLAN.md`'s revised Component Library section.
2. **Responsive App Shell by design.** Desktop-first, but Tablet/Mobile
   ready from M1, not retrofitted later: a collapsible sidebar and a nav
   data structure that supports future multi-level (nested) navigation
   groups, not just a flat link list.
3. **Dashboard data via one aggregate endpoint, reusing business logic
   only.** This resolves `01_ANALYSIS.md`'s Open Decision #1: build
   `GET /api/workflow-instances/dashboard-summary` (M2). It must call
   into the same computations the queue endpoint already uses
   (`computeIsDelayed`, etc.) — no new calculation, no duplicated rule.
4. **Widget-based Dashboard from the start.** Every Dashboard section
   (Jobs waiting, Jobs by department, Delayed jobs, etc.) is its own
   independent, reusable widget component, not one monolithic page
   template — applies to M2 when the Dashboard itself is built, but the
   `DashboardWidget` component contract is part of M1's design system
   layer.
5. **Design tokens before UI.** Colors, spacing, typography, radius, and
   shadows are defined as tokens first, applied to shadcn's existing
   CSS-variable theme, before any new component is generated — so a
   future branding change is a token edit, not a per-component rewrite.
   See `02_PLAN.md`'s new Design Tokens section, now first in M1's build
   order.

## 1. Purpose

VISION.md's [User Experience (UX)](../../VISION.md#user-experience-ux),
[Multi View System](../../VISION.md#multi-view-system), [Employee
Experience](../../VISION.md#employee-experience), and [Component
Architecture](../../VISION.md#component-architecture) sections already
describe, in detail, what the application is supposed to feel like: a
modern, workspace-oriented tool (closer to Notion/Linear than a
traditional page-by-page enterprise system), where a record can be opened
Full Page, in a Side View, in a Modal, or in a New Tab without the
underlying screen being built more than once, where navigation is fast
and keyboard-friendly, and where every screen is assembled from a small
set of reusable components (Forms, Tables, Dialogs, Search, Filters,
Side Panels, Tabs) rather than hand-built per page.

**None of that exists yet** (confirmed by direct inspection of
`apps/web`, see `01_ANALYSIS.md`). This feature is where it gets built —
for real screens that already have real data behind them, not a
redesign exercise for its own sake.

## 2. Scope for This Milestone (Foundation Only — see `02_PLAN.md` for the
proposed sub-milestone breakdown)

- **New App Shell** — replace the current single flat topbar-nav layout
  with the structure VISION.md's Employee Experience requires: fast
  navigation, minimal reloads, keyboard-friendly, workspace-appropriate.
  Responsive by design (desktop-first, tablet/mobile-ready), collapsible
  sidebar, nav structure ready for future multi-level grouping (§0a
  Refinement 2).
- **Modern Arabic RTL interface** — make RTL a real, global, structural
  property of the application (VISION.md's Core Principles: "Arabic-First
  UX... full RTL support"), not three pages with a manually-added
  `dir="rtl"` wrapper.
- **Production Dashboard** — the first real screen for VISION.md's
  [Production Dashboard](../../VISION.md#production-dashboard) section:
  a visualization layer over Workflow Engine data, nothing computed
  independently of what the engine already tracks. Widget-based from
  the start (§0a Refinement 4) and backed by one aggregate endpoint
  that reuses existing business logic only (§0a Refinement 3).
- **Production Board** — the first real screen for VISION.md's [Queue
  Philosophy](../../VISION.md#queue-philosophy): a department's queue as
  the entire interface between an employee and their work.
- **Smart Forms** — a real, shared form component set, replacing the
  copy-pasted raw-HTML `<input>`/`<select>` blocks repeated across every
  page today.
- **Better Partner Profile** — reorganize the existing Partner Profile
  (Overview, Contacts, Addresses, Notes, Commercial — all already built,
  FEATURE-002) onto the new component library and Multi View patterns.
  **No new tabs, fields, or business capability** — presentation only.
- **Fast daily workflows** — minimize clicks: search, a Side View for
  quick looks without losing context, keyboard shortcuts for frequent
  actions.

## 3. Explicitly Out of Scope for This Milestone

- **Any new business logic, schema, or permission beyond what's needed
  to read already-permission-gated data.** See `02_PLAN.md`'s Open
  Decision on whether a single new *read-only* aggregate endpoint is
  needed for the Dashboard, or whether it composes from existing
  endpoints entirely.
- **Workflow Template authoring UI.** FEATURE-004 02_PLAN.md's deferred
  Milestone 2 proposed this alongside the department queue screen; this
  feature's named goals don't include it (it's an administrative,
  back-office screen, not a daily-workflow one) — it stays deferred,
  separately, until named as a priority.
- **Full text translation / i18n of every existing English-language
  screen** (Partners, Quotations, Users, Roles, Permissions). This
  feature makes RTL a correct, global, structural property of the
  layout and typography — it does not translate existing UI copy.
  Flagged explicitly as an Open Decision in `01_ANALYSIS.md` in case the
  intent was broader.
- **The "Modal" and full in-app "Workspace Tabs" (a persistent multi-tab
  strip)** Multi View presentation modes. Full Page and Side View are
  this milestone's target; New Tab already works today (a normal browser
  tab); Modal and a Workspace Tab strip are real, separate undertakings
  proposed for a later milestone (`02_PLAN.md`).
- **Customer Portal / Supplier Portal.** Referenced only as future
  consumers of the same visibility rules already enforced server-side.
- **Automation execution, SLA-breach alerting.** Unaffected by this
  feature — VISION.md's Workflow Automation remains "designed for, not
  built."
- **Offline support.** VISION.md's Offline Strategy explicitly excludes
  it from the current architecture.
- **Any change to `docs/AI/VISION.md` itself**, or to the Workflow
  Engine's schema/services/API from FEATURE-004 M1.

## 4. New App Shell

Per VISION.md's Employee Experience (Fast Navigation, Context
Preservation, Workspace Tabs, Minimal Reloads, Keyboard Friendly,
Professional ERP Experience):

- Persistent navigation that scales past the current 7-link flat list
  (Dashboard, Settings, Partners, Quotations, Users, Roles, Permissions)
  to include Production Dashboard, Production Board, and — as they're
  built in future features — Orders, Treasury, Reports, without becoming
  a wall of links.
- A keyboard-reachable way to jump to any record or screen without
  clicking through the nav — VISION.md's "frequent actions are reachable
  without reaching for the mouse."
- Branch/context awareness in the shell itself (the signed-in user's
  branch, matching the existing branch-scoping already enforced
  server-side) — display only, no new authorization logic.
- Still permission-filtered exactly as today (`can(permission)` from
  `AuthContext`) — every nav entry's visibility rule is unchanged, just
  the container around it.

## 5. Modern Arabic RTL Interface

Per VISION.md's Core Principles ("Arabic-First UX — full RTL support,
codebase itself remains English"):

- RTL is a structural, global property of the rendered application —
  layout, spacing, icon direction, form field order — correct regardless
  of which specific page is open, not opted into per page.
- An Arabic web font is loaded and used consistently; this is not left
  to the browser's default system font stack.
- The three pages that already carry Arabic content and a manual
  `dir="rtl"` wrapper today (Login, Accept Invite, Settings) continue to
  work, now via the same global mechanism instead of a page-local one.

## 6. Production Dashboard

Per VISION.md's [Production Dashboard](../../VISION.md#production-dashboard)
section, verbatim scope — a visualization layer, never an independent
calculation:

- Jobs waiting
- Jobs in progress
- Delayed jobs
- Jobs by department
- Jobs by operator
- Supplier delays
- Daily production

Every number shown is a direct read of `WorkflowInstance`/`StageInstance`/
`WorkflowEvent` state the Workflow Engine (FEATURE-004 M1) already
tracks. If a number isn't currently exposed by an existing endpoint, the
resolution is to expose it (a read, not a calculation) — never to derive
it client-side from data that wasn't meant to answer that question. See
`02_PLAN.md`'s Open Decision on whether that means one new aggregate
endpoint.

## 7. Production Board

Per VISION.md's [Queue Philosophy](../../VISION.md#queue-philosophy):

- A department's queue (`GET /api/workflow-instances/queue?departmentId=`,
  already built) is the entire interface an employee uses to find their
  next item — not a table they filter or search through manually.
- Surfaces the queue metadata FEATURE-004 M1 already computes: priority,
  due date, computed delay, assigned employee, waiting reason.
- The actions already exposed by the API — advancing a stage
  (`COMPLETE`/`FAIL`/`SKIP`), editing queue metadata — become real
  buttons/forms, not something only reachable via a raw HTTP call (which
  is how FEATURE-004 M1 was verified, deliberately, since it built no
  UI).
- Department-scoped exactly as the API already enforces
  (`canAccessDepartment`) — the Board shows only what the signed-in
  employee's account can already see; no new visibility rule is invented
  in the frontend.

## 8. Smart Forms

Per VISION.md's Component Architecture ("Forms... never duplicated
across the application"):

- One shared set of form primitives (text input, select, textarea,
  checkbox, date, etc.) used everywhere a form exists — replacing the
  currently-repeated raw `<input class="border-input bg-background...">`
  pattern copy-pasted across every page.
- "Smart" means fewer clicks and less re-typing — sensible defaults,
  inline validation feedback (reusing the same `packages/shared` Zod
  schemas already used for request parsing, not a second validation
  system), clear error states — not an AI feature and not new business
  validation. Every rule a form enforces client-side is a client-side
  echo of a rule the server already enforces; the frontend never
  invents a new one.

## 9. Better Partner Profile

The existing Partner Profile (Overview + Category/Tags, Contacts,
Addresses, Notes, Commercial — all shipped in FEATURE-002) is
reorganized onto the new component library and Multi View patterns:

- Real tab components (not hand-rolled `<button>` active-state logic).
- Create/edit forms presented as a Side View or Dialog instead of an
  inline page-flow toggle, so the list underneath isn't lost.
- **No new tab, field, permission, or backend call that doesn't already
  exist.** This is the same Business Partner record, contacts,
  addresses, notes, and commercial profile — reorganized, not extended.

## 10. Fast Daily Workflows

Per VISION.md's Employee Experience and this request's explicit "focus
on usability, clarity, speed, and minimizing clicks":

- A Side View — the first real implementation of a second Multi View
  presentation mode alongside Full Page — so a record (a Quotation, a
  Partner, a Work Order) can be glanced at without leaving the current
  list or Board.
- Search reachable from anywhere in the shell, over records the signed-in
  user can already see (no new search endpoint with different visibility
  rules than the underlying list endpoints already have).
- Keyboard shortcuts for the highest-frequency actions (opening search,
  closing a Side View, navigating between the Board's departments).

## 11. Permissions

No new permission module. Every screen this feature builds reads data
that's already gated by an existing permission (`work-orders.view` for
the Board and Dashboard, `partners.view`/`partners.edit` for the Partner
Profile, and so on) — the frontend's job is to not render what the
signed-in user can't already do, exactly as every existing page already
does via `can()`.

## 12. Documentation

Follow the mandatory Feature Development Standard lifecycle (Requirements
→ Analysis → Planning → Implementation → Verification → Documentation →
Changelog). Per MASTER_PROMPT.md Step 5 and this request's explicit
instruction: **stop after Planning and wait for approval — do not
implement until approved.** This document, `01_ANALYSIS.md`, and
`02_PLAN.md` are that stop.
