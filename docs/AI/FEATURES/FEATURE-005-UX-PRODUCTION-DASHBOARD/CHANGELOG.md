# FEATURE-005 — Changelog

## Milestone 1 — Foundation

Turned the application shell from a single flat topbar-nav layout into
the workspace VISION.md's User Experience / Multi View System / Employee
Experience / Component Architecture sections describe: a responsive,
collapsible-sidebar App Shell, a keyboard-reachable command palette, and
global, structural Arabic RTL — plus the two-layer component library
(shadcn foundation + Cleopatra Design System) every future screen in this
feature builds on.

Five refinements applied to the approved M1–M4 plan before this milestone
started: (1) a Cleopatra Design System layer on top of shadcn — app code
never imports raw shadcn primitives; (2) the App Shell is responsive by
design (desktop-first, tablet/mobile-ready) with a collapsible sidebar and
a nav data structure ready for future multi-level grouping; (3) the
Production Dashboard (M2) is approved to be backed by one read-only
aggregate endpoint that reuses existing business logic only; (4) the
Dashboard (M2) is widget-based from the start; (5) design tokens (color,
spacing, typography, radius, shadow) were built before any UI component.

No page's content, business logic, schema, or API changed. `apps/api` and
`packages/shared` have no diff in this milestone.
