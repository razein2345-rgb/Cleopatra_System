# ADR 0017: Legacy file treated as immutable source of truth during migration

**Status:** Accepted

## Context

`legacy/cleopatra_press_system.html` is the only working implementation of this business's actual pricing rules and workflows. It was built and lives inside a Claude.ai Artifact sandbox and depends on a proprietary `window.storage` API that doesn't exist outside that sandbox (LEGACY_ANALYSIS.md §5) — it cannot run standalone, and it cannot be incrementally refactored in place. Any edit to it also risks losing the one reference implementation the entire migration is being validated against.

## Decision

The legacy file is treated as **read-only for the duration of the migration**. It is read, analyzed, and quoted from extensively (LEGACY_ANALYSIS.md, LEGACY_MAPPING.md), but never edited, reformatted, or "cleaned up" — not even to fix the acknowledged structural HTML defects it contains (a duplicated doctype preamble, a stray closing tag). Every migration phase's calculations and workflows are verified against this file's actual behavior, not against a description or memory of it.

## Consequences

- Every git status check during this migration confirms `legacy/` has zero diff — this has been verified after every phase so far and remains a standing check for every future phase.
- If the legacy file's behavior and this document's description of it ever disagree, the legacy file wins and the documentation gets corrected — matching MIGRATION_PLAN.md's Guiding Principle #1.
- The file is only retired (deleted or archived) at Phase 15, after every phase has been verified in real production use for a full billing cycle — see MIGRATION_PLAN.md Phase 15 for the exact retirement criteria.
