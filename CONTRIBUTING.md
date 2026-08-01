# Contributing

This document explains how work gets done in this repository from here on — both migration work (porting the legacy system per [MIGRATION_PLAN.md](MIGRATION_PLAN.md)) and any new feature work once the migration is complete. Read [ARCHITECTURE.md](ARCHITECTURE.md) and [CODING_STANDARDS.md](CODING_STANDARDS.md) first; this document is about _process_, those are about _code_.

---

## Development setup

```bash
npm install
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
# fill in Supabase credentials in both .env files
npm run prisma:generate --workspace=apps/api
npm run prisma:migrate --workspace=apps/api
npm run prisma:seed --workspace=apps/api
npm run dev:api
npm run dev:web
```

See the root [README.md](README.md) for the full script reference. `apps/api/.env` and `apps/web/.env` are gitignored — never commit them, and never paste real credentials into a commit message, an issue, or this repo's documentation.

---

## The migration is phase-gated — don't skip ahead

This repository is mid-migration from a legacy single-file system (`legacy/cleopatra_press_system.html`, read-only, never modified) to this architecture. [MIGRATION_PLAN.md](MIGRATION_PLAN.md) defines numbered phases with explicit dependencies; [LEGACY_MAPPING.md](LEGACY_MAPPING.md) maps every legacy function onto the phase and file that will eventually replace it.

- **Each phase requires explicit sign-off before it starts** — this has been the working agreement for every phase so far (Phase 1, 1.6, 1.7, …) and continues for Phase 2 onward.
- **Each phase is committed separately**, not squashed into a later phase's commit — this makes it possible to bisect a regression back to the phase that introduced it, and matches the commit history so far (`Phase 1: database foundations...`, `Phase 1.6 - Legacy Mapping`, etc.).
- **Calculations are frozen** ([MIGRATION_PLAN.md Guiding Principle #2](MIGRATION_PLAN.md#guiding-principles)). If a phase touches anything in `packages/shared/src/calc/` once it exists, the change needs a passing regression test against legacy's captured output _before_ it's reviewed for anything else — a calculation bug in an invoicing system is a different severity class from a UI bug.
- If you find yourself wanting to implement something from a later phase to make the current one easier, don't — flag it as a note in the PR instead. Scope creep across phase boundaries is exactly what the phase gating is meant to prevent.

Once the migration is complete and the legacy file is retired (Phase 15), this section becomes historical context — the checklist below is what governs all new feature work from that point on (and already governs any work inside a phase that isn't a straight legacy port).

---

## Every feature needs all of these

Whether it's a migration phase or new functionality added later, a feature is not done until every applicable item below is done. "Applicable" matters — a pure UI copy change doesn't need a database migration — but don't use that as an excuse to skip a step that genuinely applies.

1. **Database changes** (if needed) — a Prisma schema change + migration, following the conventions in [CODING_STANDARDS.md](CODING_STANDARDS.md#prisma) (UUID PK, soft delete, `Decimal` for money, required `branchId` where applicable). Run `prisma migrate dev --name <descriptive_name>` against your own dev database before opening a PR; don't hand-edit a migration file.
2. **Backend API** — routes + controllers (+ a service if the logic spans multiple steps/tables), following [API_CONVENTIONS.md](API_CONVENTIONS.md) for naming, status codes, and the response envelope.
3. **Frontend UI** — the screen/component that actually exposes the feature to a user. A backend-only feature with no way to reach it from the UI isn't shippable, even temporarily, unless the PR explicitly says why (e.g. "UI lands in the next PR because it depends on a component being built in parallel").
4. **Validation** — a Zod schema in `packages/shared/src/schemas/`, used by the controller (and, once forms exist for it, by the frontend form too). Never validate only on one side.
5. **Tests (when implemented)** — this repository does not yet have a test runner configured (see [Testing status](#testing-status) below). Once one exists, every feature PR includes tests for it; until then, this step is a no-op _for now_, not a permanent exemption — don't take "no test framework yet" as license to skip writing testable, pure functions (the calculation engine in particular is being architected specifically so it's trivially testable the moment a runner exists).
6. **Documentation update** — if the feature changes something described in [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONVENTIONS.md](API_CONVENTIONS.md), or [CODING_STANDARDS.md](CODING_STANDARDS.md), update that document in the same PR. If it's a significant architectural decision (new library, new pattern, a deviation from an existing convention), add an [ADR](adr/) instead of a scattered comment — see [When to write an ADR](#when-to-write-an-adr).

A PR that does 1–4 but silently skips 6 because "it's just a small change" is the most common way documentation quietly goes stale — treat it as part of the change, not an afterthought.

---

## Testing status

No test runner is installed yet. This is a known gap, not a decision that testing is unnecessary — when a runner is chosen (a decision significant enough to warrant its own ADR: which runner, unit vs. integration split, how the calculation engine's golden-master tests are structured), item 5 above becomes mandatory and this section gets replaced with the actual conventions (how to name test files, where they live, how to run them in CI).

---

## When to write an ADR

Write a new file in [`adr/`](adr/) (see that folder's `README.md` for the template and numbering) when a PR:

- Introduces a new library, framework, or external service dependency.
- Chooses one approach over a genuinely viable alternative for a reason that isn't obvious from the code (e.g. "why Decimal instead of Float," "why offset pagination instead of cursor").
- Changes a convention documented in `CODING_STANDARDS.md` or `API_CONVENTIONS.md` — update the doc _and_ record why in an ADR.
- Adds a database table or column whose purpose isn't self-evident from its name and a one-line comment.

Don't write an ADR for routine feature work that just follows existing conventions — that's what makes the ADR list useful signal instead of noise.

---

## Commits & PRs

- Commit messages describe _why_, not just _what_ — match the style already in the repo's history (`git log`).
- Keep a PR to one logical change. A migration phase is usually one PR; if a phase is large enough to need splitting, split along the phase's own natural sub-steps (as Phase 1 was split into schema/API/UI, then the applied migration, then documentation) rather than arbitrarily.
- Before opening a PR: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` — all four, from the repo root, must pass. These are the same commands used to verify every phase so far; there is no CI pipeline yet enforcing them automatically, so it's on you to run them.
- Never commit `.env` files, real credentials, or `apps/api/src/generated/prisma/` (gitignored — it's regenerated from the schema).
