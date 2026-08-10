# FEATURE-005 — Milestone 1 (Foundation) — Implementation

`apps/api` and `packages/shared` are untouched — M1 is `apps/web` only,
exactly as `02_PLAN.md`'s Verification Plan requires.

## Design Tokens (`src/index.css`)

Extended the existing shadcn CSS-variable theme rather than replacing it:

- **Color** — `--primary`/`--secondary` recolored to a Nile-teal/
  papyrus-gold brand pair; added `--success`/`--warning`/`--info`/
  `--danger` (aliased to the existing `--destructive`) semantic tokens,
  each with a matching `-foreground`, light and dark variants.
- **Spacing** — `--spacing-xs` through `--spacing-2xl`.
- **Typography** — `--font-sans` set to `Cairo` (loaded once via a
  Google Fonts `@import`, first line of the file — CSS requires
  `@import`s to precede all other rules), with `--text-xs` through
  `--text-3xl`. Applied globally via `html { font-family: var(--font-sans) }`.
- **Radius** — extended the existing `--radius` scale with `--radius-2xl`.
- **Shadows** — `--shadow-sm/md/lg`, light and dark variants.

All mapped into the existing `@theme inline` block, so every value is a
Tailwind utility (`bg-success`, `text-danger`, `shadow-md`, etc.) the same
way `bg-primary` already worked.

## Component Library — Two Layers

**shadcn foundation** (`src/components/ui/`) — generated via the shadcn
CLI: `Input`, `Textarea`, `Select`, `Checkbox`, `Label`, `Table`, `Tabs`,
`Dialog`, `Sheet`, `Card`, `Badge`, `Command`, `DropdownMenu`, `Separator`
(plus the pre-existing `Button`). New dependencies pulled in by the CLI:
`radix-ui`, `@radix-ui/react-slot`, `class-variance-authority`, `cmdk`,
`lucide-react`.

*Note on generation*: the shadcn CLI (v4.16.2) resolved the `@/*` path
alias literally and wrote all 14 files to a stray `apps/web/@/components/
ui/` directory instead of `src/components/ui/`. Moved the files to the
correct location and removed the stray `@/` directory before using them
— a CLI quirk, not a codebase issue.

**Cleopatra Design System** (`src/components/cleopatra/`) — composes the
shadcn layer; application code imports from here, not from
`components/ui` directly:

- `nav-types.ts` — `NavLink`/`NavGroup`/`NavEntry` (recursive) +
  `flattenNavLinks()`. `NavGroup` supports nesting today even though M1's
  actual nav content is flat — the future multi-level-nav requirement
  needs no data-structure change, only new entries.
- `NavTree.tsx` — renders a `NavEntry[]` recursively; permission-filters
  via the existing `useAuth().can()`, nothing new.
- `Sidebar.tsx` — brand mark + `NavTree`; accepts `collapsed` for the
  icon-rail mode.
- `Topbar.tsx` — mobile nav trigger, desktop collapse toggle, quick-search
  trigger, branch name (fetched via the existing `GET /api/branches`,
  matched against `authContext.user.branchId` — read-only, no new
  endpoint), user name, sign out.
- `CommandPalette.tsx` — `Ctrl/Cmd+K`-triggered, built on shadcn
  `CommandDialog`; lists `flattenNavLinks()` of the same permission-
  filtered nav tree the Sidebar renders — one source of truth for "what
  pages exist," not a duplicate list.
- `MobileNavDrawer.tsx` — the off-canvas counterpart to `Sidebar`, built
  on shadcn `Sheet`, `side="right"` (the correct off-canvas edge under
  global RTL).
- `StatusBadge.tsx` — five-tone (`neutral`/`success`/`warning`/`danger`/
  `info`) wrapper over shadcn `Badge`. Nothing in M1 needs it yet; built
  now as the smallest, clearest example of the wrap-shadcn-in-ERP-props
  pattern for M2+ (`WorkflowCard`, `DashboardWidget`, `CustomerCard`,
  `DepartmentQueue`) to follow.

## App Shell (`src/components/AppShell.tsx`)

Rebuilt from a single flat `<header>` into a responsive, collapsible-
sidebar layout:

- Desktop (`lg:` and up): fixed sidebar, width animates between `16rem`
  (expanded) and `4.5rem` (icon rail) via the Topbar's collapse toggle.
- Below `lg`: sidebar is `hidden`; a hamburger button in the Topbar opens
  `MobileNavDrawer` instead.
- `CommandPalette` mounted once at the shell root, opened by `Ctrl/Cmd+K`
  or the Topbar's search trigger.
- `NAV_ITEMS` — the same seven routes/permissions the old flat nav had
  (`/`, `/settings`, `/partners`, `/quotations`, `/users`, `/roles`,
  `/permissions`), same labels, same `permission` keys — restructured
  into the shell, not changed. Added a `lucide-react` icon per entry
  (presentation only).
- `<Outlet />` renders inside `<main>` exactly as before — no route or
  page component changed.

## Global RTL Infrastructure

- `index.html`: `<html lang="en">` → `<html lang="ar" dir="rtl">`.
- `src/App.tsx`: removed the `<div dir="rtl">` wrapper around the
  `/settings` route — the page itself is unchanged, only the route
  element.
- `src/pages/login/LoginPage.tsx` and
  `src/pages/accept-invite/AcceptInvitePage.tsx`: removed each page's own
  `<main dir="rtl">` — replaced with a plain `<main>`, since `dir="rtl"`
  is now inherited from `<html>`. The deliberate per-field `dir="ltr"`
  overrides on the email/password `<input>`s are untouched (unrelated to
  page-level direction).
- No text translation — every string in every existing page is unchanged;
  only the ambient direction and the App Shell's own (new, English —
  matching the app's still-untranslated nav labels) chrome text changed.

## What M1 Did Not Touch

Per `02_PLAN.md`'s "What M1 Deliberately Does Not Touch": no page under
`src/pages/` had its content, structure, or business logic changed.
Existing pages' own use of shadcn `Button` (pre-dating this feature) was
left as-is — migrating them onto the new component set page-by-page is
M3's job. RTL correctness for existing pages' own hardcoded
physical-direction utility classes (`pl-`/`mr-`/`text-left`, etc., if any)
is likewise a future per-page pass, not part of M1 — M1 makes the
*structural* RTL property (`dir`, font, the new shell) correct; a
per-page RTL/logical-property audit was not attempted here and is
flagged for a future milestone if visual issues are found on existing
screens.
