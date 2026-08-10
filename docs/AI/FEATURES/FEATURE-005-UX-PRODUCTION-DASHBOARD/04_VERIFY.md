# FEATURE-005 — Milestone 1 (Foundation) — Verification

## Static Checks

- `npm run typecheck` (root, runs `apps/web` then `apps/api`) — clean.
- `npm run lint` (root, `apps/web` then `apps/api`) — clean.
- `npm run build` (root, `packages/shared` → `apps/api` → `apps/web`) —
  clean. One pre-existing advisory (bundle size > 500kB, unrelated to
  this change — present before M1 too) remains; no new warnings.
- Confirmed via `git`/directory diff: no changes under `apps/api` or
  `packages/shared` — M1 is `apps/web` only, per the Verification Plan.

## Live Verification (Browser)

Run against the dev server (`npm run dev:web`), signed in as an existing
Super Admin user.

1. **Shell renders, existing page content unaffected** — `/` (Dashboard)
   loads inside the new shell; the placeholder Dashboard's own text is
   byte-for-byte unchanged. `/partners` and `/settings` were also loaded
   and render their existing content with no console errors.
2. **Desktop sidebar + collapse** — at 1280×800, the sidebar renders all
   seven permission-visible nav entries. Clicking the Topbar's collapse
   toggle switches it to icon-rail mode (labels hidden, `title` attribute
   present on each link so the accessible name is preserved — confirmed
   via the accessibility tree, not just visually).
3. **Mobile drawer** — at 375×812 (mobile preset), confirmed via computed
   style that `<aside>` (the desktop sidebar) is `display: none` and the
   Topbar shows the hamburger trigger instead. Clicking it opens
   `MobileNavDrawer` (confirmed via `getComputedStyle` on
   `[data-slot="sheet-content"]`: `display: flex`, positioned at the
   right edge of the viewport — the correct off-canvas side under global
   RTL). Clicking a nav link inside the drawer navigated to the target
   route **and** closed the drawer (`onNavigate` callback), confirmed by
   re-querying the DOM for the sheet content afterward (absent).
4. **Command palette** — `Ctrl/Cmd+K` and the Topbar's search button both
   open it (tested via the button; the keydown listener is the same code
   path). All seven nav entries listed under "Pages". Selecting "Partners"
   navigated to `/partners` and closed the palette.
5. **Global RTL** — confirmed via `document.documentElement.{dir,lang}`
   → `rtl`/`ar`, and `getComputedStyle(document.body).fontFamily` →
   `Cairo, ui-sans-serif, system-ui, sans-serif`. Visited `/login` (its
   own page-local `dir="rtl"` wrapper now removed) and confirmed via
   computed style that `<main>`'s `direction` is still `rtl` (inherited)
   and its `<h1>` is right-aligned — page renders identically to before,
   now via the global mechanism.
6. **Branch/user identity in Topbar** — the Topbar's branch label
   resolved and displayed correctly (Arabic branch name, fetched from the
   existing `GET /api/branches`, matched by the signed-in user's
   `branchId`) alongside the user's name and a working Sign out button.

## Design-System Layering

- `src/components/cleopatra/` is the only place in `apps/web` that
  imports from `src/components/ui/` for anything built in M1
  (`Sidebar`, `Topbar`, `CommandPalette`, `MobileNavDrawer`,
  `StatusBadge`). `AppShell.tsx` imports only from `@/components/
  cleopatra`, not from `@/components/ui` directly.
- Pre-existing pages' direct `Button` imports from `@/components/ui/
  button` (predating this feature, the one component that already
  existed) were left as-is — migrating them is M3's explicit job, not
  M1's; confirmed no *new* direct `components/ui` imports were added to
  any file under `src/pages/`.

## Known Gap (Flagged, Not a Defect)

Existing pages' own hardcoded physical-direction Tailwind classes (if
any — not audited page-by-page) are not verified to be RTL-correct
individually; `03_IMPLEMENT.md` documents this as a deliberate M1
boundary. Visual full-page screenshots were not captured in this pass
(the sandboxed browser pane could not composite a screenshot in this
session); verification instead relied on computed-style assertions
(`getComputedStyle`, `getBoundingClientRect`) and the accessibility tree,
which cover the same layout facts a screenshot would show (position,
dimensions, visibility, direction, font) without the rendering
dependency.
