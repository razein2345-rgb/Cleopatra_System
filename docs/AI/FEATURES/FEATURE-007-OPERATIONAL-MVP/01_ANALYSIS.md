# FEATURE-007 — Analysis

## What already exists (verified by reading the current code, not assumed)

- **`SizeFamily` / `SizeFamilyEntry`** (`schema.prisma`): `key`, `label`, `base` (`SheetBase`: regular/gayer), and per-entry `label` + `piecesPerSheet` — this is exactly the `FAMILIES` table from `PRICING_ENGINE_SPEC.md` §3.1, already data-modeled and editable from Settings → طباعة → دليل المقاسات. No tiering/`GROUPS`/repeat-factor **logic** exists anywhere (confirmed by grep — zero matches for `GROUPS`, `resolveTieredCalc`, `calcLabel` outside comments referencing a still-unbuilt "Phase 4").
- **`SheetType`** (`base`, `name`, `price`, `unit: InventoryUnit`) — the sheet-price table. `unit` field already anticipates inventory tracking (`InventoryUnit` enum), unused until now.
- **`InventoryItem`** — schema-only, explicitly documented as "no API/UI/logic anywhere," reserved relationship for Paper/Ink/Plates/Finishing/Consumables. No stock-quantity field, no deduction logic, no low-stock concept.
- **`Setting`**: `notebookThreshold` (30), `looseThreshold` (3000), `wasteSheetsDefault` (2) — the exact tiering constants needed, already configurable, already unused by any calculation.
- **Treasury permissions** (`packages/shared/src/permissions.ts`): `treasury.view` / `treasury.create` / `treasury.edit` / `treasury.delete` already exist as **separate** actions. `treasuryEntries.ts` routes currently gate `GET /` and `GET /balance` on `treasury.view` only, and `POST /` on `treasury.create` only — meaning a role with `treasury.create` but not `treasury.view` can already create entries but has no way to see even their own history (no endpoint currently serves that). This is additive work, not a redesign.
- **`TreasuryEntry`** has no `method` field — only `Payment.method` exists (for `sourceType: INVOICE_PAYMENT` entries). Manual entries (the "إضافة/سحب" pattern from the video) currently carry no payment-method dimension at all, so a Vodafone Cash/InstaPay/Cash/Bank breakdown of the *total* balance cannot be produced today for anything except invoice-payment-sourced entries.
- **`StaffProfile`**: `name`, `email`, `phone`, `departmentId` — no `position`/job-title field.
- **Design tokens** (`apps/web/src/index.css`): a full `.dark` class-variant system already exists (`@custom-variant dark (&:is(.dark *))`, full duplicate token set under `.dark`), but **no runtime toggle** — nothing in `AppShell.tsx` or elsewhere adds/removes the `.dark` class or reads/writes a preference. Current primary color is "deep Nile teal" (`oklch(0.4 0.08 200)`), not logo-derived.
- **Order creation** (`orderService.ts`, `createOrder`): items are created from caller-supplied data; nothing consumes `SizeFamilyEntry`/`SheetType` or touches inventory.

## What's genuinely missing

1. Sheet-count calculation (tiering + repeat factor) as executable code — confirmed zero implementation exists.
2. Any stock-quantity concept, deduction logic, low-stock threshold, or "needs to purchase" list.
3. A "my own entries only" scoped view for Treasury (reception-safe).
4. A `method` dimension on `TreasuryEntry` for manual entries, needed for the per-wallet balance breakdown the owner asked for.
5. `position`/job-title on staff + a directory screen.
6. A runtime dark/light toggle + a logo-derived palette.
7. A guided, cross-wired order-creation flow for reception (current `NewOrderPage.tsx` is a flat form, not a guided customer→type→items flow, and doesn't touch inventory).

## Design decisions this analysis surfaces (stated, not asked, since they're implementation details consistent with existing patterns — flag if you disagree)

- **Reuse `SizeFamily`/`SizeFamilyEntry`/`SheetType` as-is** for the sheet-count calculation's data source — no new size tables. The calculation module (`packages/shared`, pure functions) reads these via the API, exactly like the rest of Pricing Engine will eventually.
- **Add stock quantity directly on `SheetType`** (e.g. `stockQuantity`, `lowStockThreshold`) rather than inventing a separate `StockItem` model — `SheetType` already *is* the paper-stock catalog (name, price, base), and the video's inventory screen keys off the same paper-type granularity. A separate `InventoryItem`/generic-consumables model stays reserved for later (inks, plates, finishing materials — genuinely different item shapes), per the schema's own existing comment.
- **"Needs to purchase" list** = a computed view (query `SheetType where stockQuantity <= lowStockThreshold`, or `<= 0` for a specific insufficient order), not a separate persisted table — avoids inventing a redundant model for something derivable at read time (same "never a stale stored flag" discipline used for `remainingBalance`/`computeIsDelayed` elsewhere in this codebase).
- **`TreasuryEntry.method`**: additive nullable `PaymentMethod?` column (reuses the existing `paymentMethodSchema` enum — CASH/VODAFONE_CASH/INSTAPAY/BANK_ACCOUNT), backfilled from `Payment.method` for existing `INVOICE_PAYMENT`-sourced rows, required going forward for new `MANUAL` entries (income/expense) since that's exactly what makes the per-wallet breakdown possible.
