# ADR 0012: Inventory schema reserved ahead of implementation

**Status:** Accepted

## Context

Explicit requirement: the database must be designed for future inventory management — covering paper, ink, plates, finishing materials, and consumables — without implementing any inventory _logic_ yet (no stock is decremented by any calculator, no reorder alerts). Legacy has no inventory concept at all.

## Decision

Three tables exist now, with no API, no UI, and no code path that writes to them yet:

- `InventoryItem` — the material catalog (`category`: `PAPER | INK | PLATE | FINISHING | CONSUMABLE`, `name`, `unit`, an optional `sheetTypeId` linking a `PAPER`-category item back to the existing pricing catalog so paper isn't defined twice, `reorderLevel`).
- `StockLevel` — current on-hand quantity per `(inventoryItem, branch)` pair.
- `StockMovement` — an in/out/adjustment ledger per item per branch, deliberately mirroring `TreasuryEntry`'s ledger pattern (immutable log + derivable balance) for consistency with how this codebase already models the analogous money-ledger problem.

`SheetType` (the existing paper pricing catalog) gained a `unit` field for the same forward-compatibility reason, without otherwise changing.

## Consequences

- A future inventory phase can attach real logic (decrementing stock on order finalization, reorder alerts, purchase-order integration) without a breaking schema change — the relationships already exist.
- Until that phase exists, these three tables are legitimately empty and unused; this is intentional, not dead code to prune — see [CONTRIBUTING.md](../CONTRIBUTING.md) on why speculative _tables_ were acceptable here but speculative _logic_ was not (a table costs nothing to leave empty; unused code paths accumulate risk).
- The specific relationship between `InventoryItem` and the calculation engine's paper/ink/plate concepts (Phase 4) is not yet defined beyond the `sheetTypeId` link — that connection is deliberately left for whichever future phase actually implements inventory logic, since Phase 4's job is to port the calculation engine unchanged, not to wire it into a system that doesn't do anything with the result yet.
