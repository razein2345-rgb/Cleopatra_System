# FEATURE-005 — Sprint 1 (UX Foundation) — Requirements

## 0. Context and Constraints

FEATURE-005 Milestone 1 (App Shell, RTL infrastructure, design tokens,
two-layer component library) is done. This sprint continues FEATURE-005
under a sprint framing rather than M2–M4's original milestone framing —
see `01_ANALYSIS.md` for how this reconciles with the original
`02_PLAN.md`.

**Constraints, stated as received and binding:**

- Frontend/UI/UX only.
- Do not modify backend business logic, the Workflow Engine, or the
  Pricing Engine.
- Do not modify the database schema.
- Do not touch APIs unless absolutely required.
- Reuse the Cleopatra Design System (`02_PLAN.md`'s two-layer component
  library) — no new ad-hoc styling, no bypassing design tokens.

Per MASTER_PROMPT.md ("Never invent APIs. Never invent database schema.")
and this session's established practice: where a requested capability has
no existing data source or endpoint to back it, that gap is a Critical
Finding to surface, not a reason to invent one silently. `01_ANALYSIS.md`
lists every such gap found; `02_PLAN.md` scopes Sprint 1 around what's
genuinely deliverable under the stated constraints.

## 1. Full Arabic Localization

Every screen and every piece of shell/page chrome text becomes Arabic —
Sidebar, Topbar, Command Palette, Dashboard, buttons, table headers,
empty states, loading states, dialogs, validation messages, placeholders.
Arabic is the default and only rendered language (no language switcher
requested or built). RTL stays global (already done in M1). English is
kept only for technical/API-facing identifiers, exactly as the existing
Settings/Login/Accept-Invite pages already establish the convention.

## 2. Smart Search

Upgrade the M1 Command Palette (navigation-only) into a real search that
groups results by entity type, over every entity that already has a
readable list this application can call without a new endpoint. Keep the
existing `Ctrl/Cmd+K` shortcut and keyboard navigation. Keep the existing
architecture (`CommandPalette`/`nav-types.ts` pattern) — extend it,
don't replace it.

## 3. Printing Settings

A complete, editable Settings UI for every pricing/reference-data value
this application already stores and already exposes CRUD for
(`Setting`, `SheetType`, `SizeFamily`/`SizeFamilyEntry`, `ReadyProduct`,
`Service`) — replacing `SettingsPage.tsx`'s current read-only rendering
of these same values with real add/edit/delete forms. No value that
already exists as a stored field stays hardcoded in the UI.

## 4. Dashboard

Replace the placeholder Dashboard with operational cards — built as
independent, reusable `DashboardWidget`-pattern components (per M1's
Cleopatra Design System groundwork) — for whichever of the requested
metrics already have a real, computable data source. No advanced
analytics; no fabricated numbers.

## 5. Mobile UX

Extend M1's responsive App Shell work to the content rendered inside it:
tables, forms, dialogs, and cards across the pages touched by this
sprint should be comfortable at mobile widths, not just the shell itself.

## 6. Design System

No new component styling that bypasses `src/components/cleopatra/` and
the design tokens in `src/index.css`. New UI (Smart Search result groups,
Dashboard cards, Settings edit forms) is built as Cleopatra components
following the pattern M1 established, not one-off Tailwind per page.

## 7. Documentation

Requirements → Analysis → Plan → Implementation → Verification, per
MASTER_PROMPT.md. Sprint 1 proceeds through Implementation and
Verification in this pass (per this request's explicit instruction);
Sprint 2 is not started and requires separate approval.
