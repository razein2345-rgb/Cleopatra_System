# ADR 0016: Calculation engine ported verbatim, no redesign

**Status:** Accepted

## Context

The legacy pricing/calculation engine (`resolveTieredCalc`, `calculateNumberingSheets`, `computeBoards`, and five per-product calculators) encodes real, hard-won operational knowledge from the print shop floor — code comments in the legacy file explicitly reference conversations with press staff about physical machine limits and deliberate non-obvious exceptions (LEGACY_ANALYSIS.md §3, §8). Explicit, repeated requirement across this migration: preserve every pricing formula and the offset/board calculation engine exactly; do not simplify, optimize, or redesign any calculation.

## Decision

When Phase 4 ports this engine into `packages/shared/src/calc/`, it is ported as a set of pure functions, transcribed from the legacy source, not reimplemented from a description of what they "should" do. Every calculator ships with a golden-master regression test suite: the **legacy** functions run against a representative input matrix, their exact outputs captured, and the ported functions asserted to match every field of every output bit-for-bit before the port is considered done.

Deliberately preserved, not "cleaned up": the separation between print-sheet tiering (`resolveTieredCalc`) and numbering-sheet resolution (`calculateNumberingSheets`) into two independent functions (a legacy comment explicitly warns against merging them, since the numbering machine has a fixed physical size limit unrelated to print-run economics); the A-series size's distinct hardcoded threshold; the folders calculator's free-text finishing-stage fields.

## Consequences

- Phase 4 is treated as the highest-risk, highest-priority phase in the entire migration (see MIGRATION_PLAN.md) — no calculator ships without its regression test passing first, and no downstream phase (order builder, invoicing) is built on top of an unverified calculator.
- Any future desire to actually improve or simplify a calculation is a separate, explicit, business-approved decision made _after_ this migration reaches feature parity — not something that happens incidentally during the port.
- `ceil()` and `fmt()`, legacy's custom epsilon-adjusted rounding and display-formatting helpers, are ported exactly rather than replaced with a "more standard" rounding approach — floating-point rounding differences here would directly change invoice totals.
