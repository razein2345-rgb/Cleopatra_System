# ADR 0015: Shared Zod validation schemas in `packages/shared`

**Status:** Accepted

## Context

Legacy validates almost nothing — numeric inputs are `parseFloat(x)||0` with no range/sign checking, and free text is interpolated directly into HTML with no escaping (LEGACY_ANALYSIS.md §9). The new system needs real input validation on the server (the only place it can be trusted) and, eventually, matching validation on the client for good UX (immediate feedback instead of a round-trip). Duplicating validation rules in two places (a hand-written Express check and a hand-written React form check) is a well-known source of drift.

## Decision

All validation schemas are Zod schemas defined once in `packages/shared/src/schemas/`, imported by both `apps/api` (in controllers, via `.parse()`) and, as forms are built, by `apps/web`. Each resource gets three schemas following a consistent pattern: the full entity shape, a `createXSchema` (required fields for a `POST`), and an `updateXSchema` (usually `createXSchema.partial()`).

## Consequences

- A field's validation rule (type, range, required-ness) is defined in exactly one place; changing it automatically applies to both the API's rejection behavior and any client-side form built against the same schema.
- `packages/shared` has zero framework dependency (no Express, no React) — it only depends on `zod` itself, so it can be imported by either app without pulling in the other's dependencies.
- Zod's inferred TypeScript types (`z.infer<typeof x>`) are the canonical types for these shapes throughout the codebase — see [CODING_STANDARDS.md](../CODING_STANDARDS.md#typescript) for why these are always exported as `type`, not re-declared as a separate `interface`.
