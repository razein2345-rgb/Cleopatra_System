# ADR 0002: React + Vite + TypeScript + Tailwind + shadcn/ui

**Status:** Accepted

## Context

The legacy system is a hand-rolled, framework-free single-file app (LEGACY_ANALYSIS.md §1) — no component model, global mutable state, full-string re-render on every interaction. It was explicitly required to rebuild on a "production-ready" stack rather than continue that pattern. The frontend also needs to support a fully Arabic RTL UI, a dark/light theme (both already present in legacy), and a component vocabulary rich enough to rebuild ~10 distinct screens without every screen reinventing its own buttons/inputs/tables.

## Decision

- **React** for the component model and rendering.
- **Vite** as the build tool/dev server (fast HMR, minimal config, first-class TypeScript support).
- **TypeScript** throughout, strict mode.
- **Tailwind CSS** for styling — utility-first, avoids a growing pile of hand-written CSS files, and its `dir="rtl"`-aware utilities suit the Arabic-first requirement.
- **shadcn/ui** for the component vocabulary — not a runtime component library dependency, but a CLI that copies component source into `src/components/ui/`, which the project owns and can customize freely (unlike a black-box npm component library).

## Consequences

- No routing library is installed yet — there's only one screen so far (Phase 1's settings toggle). Adding React Router (or an alternative) is a decision for whichever phase first needs multiple real routes (Phase 5), not made speculatively now.
- `src/components/ui/` is vendor-managed source, not hand-authored from scratch — see [CODING_STANDARDS.md](../CODING_STANDARDS.md#folder-structure) for how it's treated (style tweaks fine, app logic doesn't belong there).
- Every new component must be checked for correct RTL behavior explicitly — Tailwind/shadcn don't guarantee this automatically for every component out of the box.
- No global state library is installed yet (Redux, Zustand, Jotai, etc.) — `useState`/`useEffect` suffice for Phase 1's read-only screen. The first cross-component state need (the order-building cart, Phase 5) is where this gets decided, not before.
