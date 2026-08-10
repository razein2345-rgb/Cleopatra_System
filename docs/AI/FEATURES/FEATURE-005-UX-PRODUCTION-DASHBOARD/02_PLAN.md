# FEATURE-005 — ERP User Experience & Production Dashboard — Plan

This plan proposes a four-part breakdown (M1–M4). The M1–M4 breakdown is
approved, along with five refinements (00_REQUIREMENTS.md §0a) that this
document has been updated to incorporate: a two-layer component library
(shadcn foundation + Cleopatra Design System), a responsive
collapsible-sidebar App Shell built for future multi-level nav, a single
business-logic-reusing Dashboard aggregate endpoint (resolving Open
Decision #1), a widget-based Dashboard from the start, and design tokens
built before any UI. **Milestone 1 — Foundation** is approved for
implementation now: design tokens, the two-layer component library,
global RTL infrastructure, and the new App Shell. No screen's actual
content (Dashboard, Board, Partner Profile) changes in M1 beyond
navigating to it — that's M2/M3. This keeps each slice independently
verifiable, the same discipline every prior feature in this project has
used.

## Why Four Milestones, Not One

FEATURE-005's named goals — App Shell, RTL, Production Dashboard,
Production Board, Smart Forms, Partner Profile rework, fast daily
workflows — touch nearly every screen in the application plus introduce
an entire component library from a single-`Button` starting point. Doing
all of it as one milestone would repeat the exact mistake this project's
own process has avoided every other time (see FEATURE-002's M1–M6 split,
FEATURE-003's M1/M2 split, FEATURE-004's M1/M2/M3 split): a change large
enough that reviewing it as one unit stops being meaningful.

## Milestone 1 — Foundation (approved; refinements below apply)

**M1 build order, per the approved refinements: tokens first, then the
shadcn foundation layer, then the Cleopatra Design System layer built on
top of it, then the App Shell that consumes both.**

### Design Tokens (built first, per Refinement 5)

Before any component is generated, extend `src/index.css`'s `@theme`
block with a real Cleopatra token set, layered the same way the existing
shadcn variables already are (CSS variables → `@theme inline` mapping):

- **Color** — brand primary/secondary, semantic status colors (success,
  warning, danger, info — needed by `StatusBadge` and the Dashboard's
  delayed/waiting states), applied to the existing
  `--background`/`--primary`/`--destructive`/etc. variables rather than
  inventing a parallel color system.
- **Spacing** — a small scale (`--space-*`) for the App Shell and
  Cleopatra components to reference consistently, on top of Tailwind's
  default scale rather than replacing it.
- **Typography** — the chosen Arabic font (Cairo or Tajawal, confirmed
  during implementation) plus font-size/line-height/weight tokens for
  headings, body, and the dense tabular text the Production Board needs.
- **Radius** — extends the existing `--radius` token rather than
  replacing it (already used by `--radius-sm/md/lg/xl`).
- **Shadows** — an elevation scale (`--shadow-sm/md/lg`) for `Card`,
  `Sheet`, and `DropdownMenu`/`Command` popovers, none of which have one
  today.

This is the mechanism the refinement asks for: a future branding change
edits these tokens, not every component that uses them.

### Component Library

**Two layers, not one** (Refinement 1):

1. **shadcn foundation (internal only)** — generate the primitives
   `components.json` already anticipates but were never added: `Input`,
   `Textarea`, `Select`, `Checkbox`, `Label`, `Table`, `Tabs`, `Dialog`,
   `Sheet`, `Card`, `Badge`, `Command`, `DropdownMenu`, `Separator`.
   Standard shadcn generation into `src/components/ui/`, using the
   existing `cn()` utility and the token-driven theme above. Application
   pages do not import from `components/ui` directly going forward.
2. **Cleopatra Design System (`src/components/cleopatra/`)** — composes
   the shadcn layer into the vocabulary this ERP actually uses. M1 builds
   the pattern and the specific components the App Shell itself needs:
   `NavItem`/`NavGroup` (multi-level-ready, built on `DropdownMenu`/
   plain composition), `CommandPalette` (built on `Command`+`Dialog`),
   `Sidebar`/`Topbar`. `StatusBadge` (on `Badge`) is also built in M1
   since nothing in M1 needs it yet but it's the smallest, clearest
   example of the pattern for M2+ to follow. `WorkflowCard`,
   `DashboardWidget`, `CustomerCard`, `DepartmentQueue` are built when
   the milestone that actually needs them (M2/M3) is implemented, not
   speculatively now — each new Cleopatra component follows the same
   convention M1 establishes: wraps one or more shadcn primitives, takes
   ERP-shaped props (not raw shadcn props), never re-exports the
   underlying primitive's full prop surface.

### Branding Pass

Superseded by the Design Tokens section above — branding is applied via
tokens, not a separate one-off color pass.

### Global RTL Infrastructure

- `<html dir="rtl" lang="ar">` (or a lightweight direction context if a
  future LTR/customer-facing surface needs to opt out — decided during
  implementation, not a new architectural concept either way).
- One Arabic web font, self-hosted or loaded once, applied globally —
  proposed: **Cairo** or **Tajawal** (both common, clean, modern Arabic
  UI typefaces already used across Arabic SaaS products) — final choice
  confirmed during implementation, not a decision this plan needs to
  lock in.
- Remove the three now-redundant page-local `dir="rtl"` wrappers
  (`App.tsx`'s Settings route, `LoginPage.tsx`, `AcceptInvitePage.tsx`) —
  the global `dir` supersedes them; page content is unchanged.
- **No text translation in M1** (01_ANALYSIS.md's Open Decision #2) —
  this milestone makes RTL layout/direction/typography structurally
  correct everywhere; existing English-language screens keep their
  English copy until a separate, explicitly-scoped translation effort is
  requested.

### New App Shell

- Collapsible sidebar navigation (Cleopatra `Sidebar`), replacing the
  flat topbar `NavLink` row — scales to Production Dashboard/Board today
  and Orders/Treasury/Reports as they're built later, without becoming a
  wall of links.
- **Responsive by design, not retrofitted** (Refinement 2): desktop-first
  layout, but the sidebar collapses to an icon rail or off-canvas drawer
  at tablet/mobile widths from M1, not added in a later pass. The nav
  data structure (`NavItem`/`NavGroup`) supports nested groups from the
  start — M1's actual nav content stays a flat list (nothing to nest
  yet), but a future Orders/Treasury/Reports group doesn't require a
  data-structure change, only new entries.
- Topbar (Cleopatra `Topbar`) retained for user identity, branch context,
  and sign-out — same information the current shell already shows,
  restructured, plus the sidebar-collapse toggle.
- A command palette (Cleopatra `CommandPalette`, built on shadcn
  `Command`+`Dialog`, keyboard-triggered — e.g. `Ctrl/Cmd+K`) as the
  "reachable without the mouse" entry point VISION.md's Employee
  Experience calls for. In M1, it navigates between existing pages (a
  static command list); wiring it to real record search is M4's job
  (00_REQUIREMENTS.md §10), not built ahead of the search feature it's
  meant to trigger.
- Every nav entry's visibility is still `can(permission)` — identical
  authorization to today, new container only.

### What M1 Deliberately Does Not Touch

`DashboardPage`, `PartnersPage`/`PartnerProfilePage`, `QuotationsPage`/
`QuotationDetail`, `UsersPage`, `RolesPage`, `PermissionsPage`,
`SettingsPage` keep their current content and structure in M1 — they
simply render inside the new shell, in the new global RTL context, using
whatever of the new component primitives is a drop-in fit without a
content rewrite (e.g. `Button` already is; anything needing a real
content rework waits for M3). No page's business behavior changes.

## Milestone 2 — Production Dashboard + Production Board (proposed, not
this submission's approval ask)

- **Production Board**: `GET /api/workflow-instances/queue?departmentId=`
  rendered via the new `Table`/`Card`/`Badge` components — priority,
  computed delay, assignee, waiting reason all visible; stage actions
  (`COMPLETE`/`FAIL`/`SKIP` via `PUT .../advance`, queue-metadata edits
  via `PUT .../current-stage`) become real buttons/forms instead of only
  reachable by raw HTTP, exactly reusing FEATURE-004 M1's API unchanged.
  Department-scoped via the same `canAccessDepartment` the API already
  enforces — a department switcher only shows departments the signed-in
  user can already access.
- **Production Dashboard**: **approved** (01_ANALYSIS.md's Open Decision
  #1, resolved by Refinement 3). One new, narrowly-scoped, read-only
  endpoint — `GET /api/workflow-instances/dashboard-summary` — a pure
  aggregation query (counts of `StageInstance` rows grouped by status/
  department, delayed-count via the same `computeIsDelayed` logic
  already used by the queue endpoint, daily-completed count from
  `WorkflowEvent`). No business rule, no write path, the same shape as
  `getDepartmentQueue` generalized from "one department's rows" to
  "counts across every department the caller can see." Rendered as
  independent `DashboardWidget` components (Refinement 4) — each of
  VISION.md's 7 representative views (Jobs waiting, in progress,
  delayed, by department, by operator, supplier delays, daily
  production) is its own widget reading its own slice of the one
  response, not one monolithic dashboard template.

## Milestone 3 — Smart Forms + Better Partner Profile (proposed)

- Migrate the repeated raw-HTML form pattern onto the new `Input`/
  `Select`/`Textarea`/`Label`/`Checkbox` components, page by page,
  starting with the highest-traffic forms (Partner Overview, Contacts,
  Addresses).
- Build the Side View host (shadcn `Sheet`), and prove Multi View reuse
  for real: mount the *already presentation-independent*
  `QuotationDetail` inside it unchanged, then confirm the same
  `{recordId?, onSaved?}` shape works for a new Work Order detail
  component and for Partner Profile's own tabs — one component, multiple
  hosts, per VISION.md's Multi View System, not a new pattern invented
  per screen.
- Partner Profile's tabs move onto shadcn `Tabs`; create/edit forms move
  from inline page-flow toggles to Dialog/Sheet — no new tab, field, or
  API call.

## Milestone 4 — Fast Daily Workflows (proposed)

- Wire the M1 command palette to real search across records the signed-in
  user can already see (existing list endpoints, no new visibility rule).
- Side View adoption on list pages (Partners, Quotations, the Production
  Board) — open a record without leaving the list.
- Keyboard shortcuts for the highest-frequency actions.

## Business Rules

**None.** Every screen this plan describes reads and writes through
existing, unchanged API endpoints, existing Zod schemas, and existing
`requirePermission`/service-layer rules. Per VISION.md's Component
Architecture: "UI components display and collect data — they do not
decide business rules." The one proposed new endpoint (M2's Dashboard
summary, if approved) is a read/aggregation, not a rule.

## Verification Plan (Milestone 1)

Same standard as every milestone this session, adapted for a
presentation-layer change:

- `npm run typecheck`/`lint`/`build` across `shared`/`api`/`web` — clean
  (no `apps/api` changes expected in M1 at all).
- Live, in-browser verification (not just build success, per this
  project's own UI-verification standard): every existing page still
  functions identically inside the new shell — same data, same
  permissions, same mutations succeed/fail the same way.
- RTL correctness checked visually in the browser at both desktop and a
  narrow viewport — layout, spacing, and icon direction genuinely mirror,
  not just `dir` attribute presence.
- Command palette keyboard-triggers correctly and navigates to every
  permission-visible page; does not appear for pages the signed-in user
  can't access.
- No `apps/api`, `packages/shared` schema, or `docs/AI/VISION.md` diff in
  M1 — confirmed by reviewing the actual changed-file list before calling
  this milestone done, not assumed from intent.
- Design-system layering respected: no application page imports directly
  from `src/components/ui/` — confirmed by checking the actual import
  statements, not assumed from the file structure.

## Remaining Work (Explicitly Not This Submission)

- Milestones 2–4 above, each its own future approval.
- Workflow Template authoring UI — still deferred, not part of this
  feature (01_ANALYSIS.md's Architectural Tension).
- Full text translation of existing English-language screens — a
  separate, larger, explicitly-scoped effort if actually wanted.
- Modal and in-app Workspace Tabs (multi-record tab strip) Multi View
  modes.

---

**M1 approved and in implementation.** M2's
`GET /api/workflow-instances/dashboard-summary` endpoint is approved in
principle (Refinement 3) with its build deferred to M2 itself, as
originally proposed. M3 and M4 remain proposed, each awaiting its own
approval when reached.
