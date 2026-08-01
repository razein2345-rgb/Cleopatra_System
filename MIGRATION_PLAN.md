# Migration Plan — Cleopatra Press (legacy Artifact) → Cleopatra System

**Status:** Phases 1 and 2 (Identity & Access Management) complete and verified against the live Supabase database. No calculation logic has been touched. `legacy/cleopatra_press_system.html` has not been modified and remains the single source of truth for every calculation and workflow until each phase below is explicitly approved and verified against it. Waiting for approval to start Phase 3.

This plan assumes the reader has read [LEGACY_ANALYSIS.md](LEGACY_ANALYSIS.md) first — phase descriptions below reference findings from that audit by section (e.g. "§3" = Pricing & Calculation Engine).

Target architecture (already scaffolded, no business logic yet): `apps/web` (React+Vite+TS, Tailwind, shadcn/ui), `apps/api` (Express+TS, REST), `packages/shared` (Zod schemas/types shared by both), Prisma ORM against Supabase Postgres, Supabase Auth.

---

## Guiding Principles

1. **The legacy file is the oracle for calculations.** Every pricing formula is ported by reading its exact source, not reimplemented from a description of what it "should" do. Where the legacy code and this plan appear to disagree on a calculation, the legacy code wins and the plan gets corrected.
2. **Calculations are frozen; architecture is not.** The mandatory requirements below (invoice numbering, independent Quotations/Work Orders, Treasury auto-posting, multi-branch/inventory-readiness) are all _structural_ changes. None of them may alter a single pricing formula, threshold, or rounding rule from LEGACY_ANALYSIS §3. Structure may evolve; arithmetic may not.
3. **Strangler-fig, not big-bang.** Each phase adds one working, independently verifiable slice. Nothing in this plan proposes cutting over all at once.
4. **Calculations before UI, UI before persistence-of-record.** The riskiest part of this system (§3) gets ported and regression-tested as pure functions _before_ any screen is built on top of it, and before it's wired to real database writes.
5. **No silent architecture changes disguised as ports.** Where the new system must behave differently from the legacy one (concurrency, auth, validation, sequential numbering, independent entities — see LEGACY_ANALYSIS §9–10 and the mandatory requirements below), that difference is called out explicitly in the phase where it happens, not left implicit.
6. **Per your instruction, this plan does not include any implementation for Invoices, Quotations, Work Orders, or Treasury.** Those phases are described in full (schema, dependencies, scope, risks) so the roadmap is coherent and buildable, but no code for them will be written until each is separately approved, phase by phase.

---

## Mandatory Requirements (confirmed after Phase 0) — ✅ ALL DECISIONS FINALIZED

14 requirements in total: the original 10, plus 4 additional architecture requirements confirmed in the same round. All open decisions from the previous revision of this plan are now resolved (see each row below) — **nothing is pending confirmation anymore; Phase 1 implementation proceeds on this basis.**

| #   | Requirement                                                                                       | Final decision                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Invoice numbers must be sequential                                                                | **Per-branch sequential, human-readable, configurable prefix.** Format: `{prefix}-{year}-{6-digit sequence}`, e.g. `CLP-INV-2026-000001`. Generated via a `DocumentSequence` counter table (one row per branch+document-type+year), incremented atomically in a DB transaction — never computed by reading "last number" in application code.     |
| 2   | Quotations must be stored as independent records                                                  | `Quotation`/`QuotationItem` are real persisted tables with their own lifecycle. Rewrites **Phase 7**.                                                                                                                                                                                                                                             |
| 3   | Quotations must support one-click conversion into invoices                                        | `POST /api/quotations/:id/convert` in **Phase 7**. **Default: freeze/preserve the quoted breakdown exactly.** An explicit `recalculate: true` request flag re-runs Phase 4's calculators against current settings instead — an opt-in, not the default.                                                                                           |
| 4   | Work Orders must be independent entities with production status tracking                          | `WorkOrder` is its own table with its own `productionStatus`, fully decoupled from `Order.status`. Exact enums below. Rewrites **Phase 8**.                                                                                                                                                                                                       |
| 5   | Treasury must automatically receive payment transactions from invoices                            | Every `Payment` on an `Order` inserts a linked `TreasuryEntry` in the same transaction, carrying `orderId` (invoice), `paymentId`, `customerId`, `staffId` (employee), and `branchId` references. Manual entries remain fully supported (`sourceType: MANUAL`). Schema lives in Phase 1; **Phase 6** writes to it; **Phase 10** is the ledger UI. |
| 6   | Preserve every pricing formula exactly as implemented in the legacy system                        | Guiding Principle #1; enforced mechanically by **Phase 4**'s golden-master regression tests.                                                                                                                                                                                                                                                      |
| 7   | Preserve the existing offset and board calculation engine exactly                                 | Same mechanism as #6 — **Phase 4** ports `resolveTieredCalc`, `calculateNumberingSheets`, and `computeBoards` verbatim, byte-for-byte tested.                                                                                                                                                                                                     |
| 8   | The system must support future multi-branch expansion                                             | `Branch` model in Phase 1; `branchId` is **required** (not nullable) on every branch-scoped table, seeded with one default branch today. Full detail in [Cross-Cutting Schema Additions](#cross-cutting-schema-additions-apply-in-phase-1).                                                                                                       |
| 9   | The database must be designed for future inventory management                                     | `InventoryItem`, `StockLevel`, `StockMovement` tables created now (schema only, no API/UI/logic), with explicit relationships covering paper, ink, plates, finishing materials, and consumables.                                                                                                                                                  |
| 10  | Do not change any business calculations during migration                                          | Same mechanism as #6/#7 — restated for traceability.                                                                                                                                                                                                                                                                                              |
| 11  | Every entity uses a UUID primary key; human-readable sequential numbers where applicable          | All models use `String @id @default(uuid()) @db.Uuid`. `Order.invoiceNumber`, `Quotation.quotationNumber`, `WorkOrder.workOrderNumber` are the human-readable sequential identifiers from Requirement 1's mechanism.                                                                                                                              |
| 12  | Soft delete for all business entities (`deletedAt`, `deletedBy`, `isDeleted`)                     | Applied to every top-level business entity (see [Cross-Cutting Schema Additions](#cross-cutting-schema-additions-apply-in-phase-1) for the exact list and the child-record exceptions).                                                                                                                                                           |
| 13  | Complete audit log system (user, timestamp, action, entity, previous value, new value)            | `AuditLog` table created now. **Schema only in Phase 1** — no code writes to it yet; the write-path (middleware/service hooks) is built alongside each phase that needs it (6, 7, 8, 10, etc.), per your instruction that implementation can happen later.                                                                                        |
| 14  | Every business document supports future attachments (PDF, AI, PSD, CDR, images, customer artwork) | `Attachment` table created now with nullable relations to `Customer`, `Quotation`, `Order` (= invoice), and `WorkOrder`. **Schema only** — no upload endpoint, no storage wiring yet.                                                                                                                                                             |

Requirements 2, 4, 5, 9, 13, and 14 all expand Phase 1's schema scope; Requirements 1, 8, 11, and 12 are cross-cutting patterns applied consistently across every model. See below for exactly how.

---

## Cross-Cutting Schema Additions (apply in Phase 1)

Rather than bolt these onto each phase individually (and risk inconsistent treatment), the following are decided once, here, and referenced by every later phase's DB mapping. **All decisions below are final**, confirmed by you after the previous revision of this plan.

### UUID primary keys (Requirement 11)

Every model: `id String @id @default(uuid()) @db.Uuid` — generated by Prisma client-side (portable across any Postgres instance, no dependency on a specific extension being enabled on the Supabase project).

### Sequential, human-readable, per-branch document numbers (Requirements 1, 11)

- New `DocumentSequence` table: one row per `(branchId, documentType, year)`, holding a configurable `prefix` string and a `lastNumber` integer, incremented **atomically inside the same transaction** that creates the document (row-level lock via the unique constraint on `(branchId, documentType, year)` — never a read-then-increment in application code, which is exactly the concurrency bug class LEGACY_ANALYSIS risk #4 warns about).
- `Order.invoiceNumber`, `Quotation.quotationNumber`, `WorkOrder.workOrderNumber` are all `String @unique`, formatted as `{prefix}-{year}-{lastNumber padded to 6 digits}` — e.g. `CLP-INV-2026-000001`, `CLP-QUO-2026-000001`, `CLP-WO-2026-000001`.
- The prefix is per-branch and per-document-type, editable by an admin (not hardcoded), which is what makes it "configurable" — a second branch can have its own prefix (e.g. `CLP-GZ-INV`) without any schema change.
- The actual atomic-increment logic is implemented in Phase 6/7/8 (wherever each document type is created); Phase 1 only creates the `DocumentSequence` table and seeds the first year's rows for the default branch.

### Independent Quotations & Work Orders (Requirements 2, 3, 4)

- `Quotation`/`QuotationItem` mirror `Order`/`OrderItem`'s shape (Phase 7), with their own `status` lifecycle (`DRAFT → SENT → ACCEPTED/REJECTED/EXPIRED → CONVERTED`) and a `convertedOrderId` back-reference once converted.
- Conversion (Phase 7's `POST /api/quotations/:id/convert`) **defaults to copying the quotation's `breakdown` snapshots verbatim** into the new `Order`/`OrderItem`s — the quoted price is what the customer approved, and that's what gets invoiced. An explicit `recalculate: true` flag on the same endpoint instead re-runs the quotation's inputs through Phase 4's current calculators/settings before creating the order. Both paths produce a real, independent `Order` — no third code path.
- `WorkOrder` is a separate table, one-to-one with `Order`, with its own `productionStatus` — fully decoupled from `Order.status`. Final enums:
  - `OrderStatus`: `DRAFT, QUOTATION, CONFIRMED, IN_PRODUCTION, READY, DELIVERED, CANCELLED`
  - `WorkOrderProductionStatus`: `WAITING, DESIGN, PREPRESS, PLATE_MAKING, PRINTING, FINISHING, QUALITY_CHECK, READY_FOR_DELIVERY, COMPLETED`
    These are genuine, requested structural changes from legacy's single conflated 10-stage list — not calculation changes.

### Treasury auto-posting with full traceability (Requirement 5)

- `TreasuryEntry` carries `sourceType` (`MANUAL | INVOICE_PAYMENT`, default `MANUAL`) plus direct references to `orderId` (the invoice — `Order` rows double as invoices in this system), `paymentId`, `customerId`, `staffId` (employee), and `branchId` — every field your requirement listed, stored directly on the ledger row rather than requiring a join, matching the denormalized-ledger style already used for ledger tables in this system.
- When Phase 6 records a `Payment` against an `Order`, it inserts the matching `TreasuryEntry` **in the same database transaction** — a payment and its treasury entry can never exist independently of each other.
- Manual entries remain fully supported (`sourceType: MANUAL`, `orderId`/`paymentId` left null) exactly as legacy's Treasury screen works today.
- Auto-generated (`INVOICE_PAYMENT`) entries are not directly editable/deletable from the Treasury UI (Phase 10) — correcting one means voiding/adjusting the source payment, so the ledger can never silently diverge from the invoices it reflects.
- The `TreasuryEntry` table is created in Phase 1 precisely so Phase 6 has somewhere to write to; Phase 10 remains where the ledger UI, manual-entry form, and balance reporting get built.

### Multi-branch readiness (Requirement 8)

- New `Branch` model: `id, name, code (unique), address?, isDefault`. One row (`isDefault: true, code: "MAIN"`) is seeded automatically — today's system behaves exactly like a single-branch business.
- `branchId` is **required** (not nullable) on every branch-scoped table: `StaffProfile`, `Order`, `Quotation`, `WorkOrder`, `TreasuryEntry`, `DocumentSequence`, `StockLevel`, `StockMovement`, `AuditLog` (nullable only on `AuditLog`, since some system-level actions aren't branch-specific). Required rather than nullable because a valid branch always exists to assign (the seeded default) — there's no state where "no branch" is meaningful.
- `Customer`, `Supplier`, `Tender`, and the product/pricing catalog (`Setting`, `SizeFamily`, `SheetType`, `ReadyProduct`, `Service`, `InventoryItem`) remain **shared across branches**, not branch-scoped — confirmed assumption. Per-branch stock _levels_ of a shared catalog item are still tracked per-branch via `StockLevel`/`StockMovement` (see below).
- No multi-branch UI, branch switcher, or per-branch access control is built in this migration — only the schema accommodation.

### Inventory readiness (Requirement 9)

- `SheetType` gets a `unit` field (`SHEET | ROLL | LINEAR_METER | SQUARE_METER | PIECE | KILOGRAM | LITER`) and keeps its stable `id`, so it can be referenced by the future stock catalog without a breaking change.
- Three new tables, created now, populated later, no API/UI/logic attached yet:
  - `InventoryItem` — the material catalog: `category` (`PAPER | INK | PLATE | FINISHING | CONSUMABLE`), `name`, `unit`, optional `sheetTypeId` (links a `PAPER`-category item back to the existing pricing catalog so paper isn't defined twice), `reorderLevel`.
  - `StockLevel` — current on-hand quantity per `(inventoryItemId, branchId)` pair.
  - `StockMovement` — an in/out/adjustment ledger per item per branch, deliberately mirroring `TreasuryEntry`'s ledger pattern (immutable log + derivable balance) for architectural consistency across the codebase.
- This satisfies "include relationships for Paper, Ink, Plates, Finishing materials, Consumables" as actual schema (not just a documentation note), while genuinely building zero inventory _logic_ — no stock is decremented by any calculator, no reorder alerts, nothing wired up.

### Soft delete (Requirement 12)

- Applied to every top-level, independently-addressable business entity: `Branch`, `StaffProfile`, `Customer`, `Supplier`, `Tender`, `Order`, `Quotation`, `WorkOrder`, `TreasuryEntry`, `ReadyProduct`, `Service`, `SheetType`, `SizeFamily`, `InventoryItem`, `Attachment` — each gets `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedBy String? @db.Uuid`.
- **Not applied** to pure child/line-item records that have no independent lifecycle and are always deleted along with their parent (`OrderItem`, `QuotationItem`, `Payment`, `SupplierPurchase`, `SupplierPayment`, `SizeFamilyEntry`, `StockLevel`, `StockMovement`) or to append-only log tables that must never be mutated (`AuditLog`, `DocumentSequence`) — soft-deleting a log entry would defeat its purpose.
- `deletedBy` is stored as a plain `Uuid` value (conceptually referencing `StaffProfile.id`) **without** a formal Prisma relation, to avoid ~15 duplicate named relations cluttering `StaffProfile`. This is a deliberate, documented simplification, not an oversight.
- No query-filtering middleware is added in Phase 1 — every later phase's read endpoints must remember to filter `isDeleted: false` (called out again in each relevant phase as it's built).

### Audit log (Requirement 13)

- `AuditLog` table: `entityType` (string, e.g. `"Order"`), `entityId`, `action` (`CREATE | UPDATE | DELETE | APPROVE | STATUS_CHANGE`), `performedById` (nullable — some actions may be system-initiated), `branchId` (nullable), `previousValue`/`newValue` (JSON), `createdAt`.
- **Schema only in Phase 1.** No middleware, service hook, or route writes to this table yet — per your instruction, the write-path is built alongside whichever phase needs it (order status changes in Phase 6/9, quotation approval in Phase 7, production status changes in Phase 8, treasury entries in Phase 10, etc.).

### Attachments (Requirement 14)

- `Attachment` table: `fileName`, `fileType`, `storagePath` (nullable — reserved for a future Supabase Storage key), `sizeBytes` (nullable), `uploadedById`, and **nullable** relations to `Customer`, `Quotation`, `Order` (invoice), and `WorkOrder` (exactly the five document types you named — "Invoices" and "Orders" are the same table in this system).
- **Schema only.** No upload endpoint, no storage bucket wiring, no file-type validation yet — those arrive alongside whichever phase first needs real attachments (likely Phase 6/7 for customer-supplied artwork).

---

## Phase Dependency Order

```
Phase 1  Database Foundations — FULL schema for every model below,
         + Settings/reference-data API & UI only
Phase 2  Auth & Staff              ──────────────┐
Phase 3  Customers                               │  (2 and 3 can run in parallel after Phase 1)
Phase 4  Pricing & Calculation Engine (pure functions, no UI, no DB)
Phase 5  Order Builder UI (uses 1+3+4, in-memory cart only, nothing persisted yet)
Phase 6  Orders & Invoices persistence           ← NOT implemented now, planning only
                                                    (writes Order + auto TreasuryEntry, both schema'd in Phase 1)
Phase 7  Quotations (independent entity + convert-to-invoice)  ← NOT implemented now, planning only
Phase 8  Work Orders (independent entity + production status)  ← NOT implemented now, planning only
Phase 9  History & Status Tracking
Phase 10 Treasury (ledger UI + manual entry; auto entries already flowing in from Phase 6)  ← NOT implemented now, planning only
Phase 11 Suppliers
Phase 12 Tenders
Phase 13 Reports & Dashboard
Phase 14 Printing Engine Modernization
Phase 15 Parallel Run & Cutover
```

Phases 2 and 3 have no dependency on each other and can run in parallel. Every phase from 5 onward depends on Phase 4 (the calculation engine) being verified first. Phase 1 now carries more schema weight than before — see below — precisely so Phase 6 never has to reach backward into Phase 10's territory to create the `TreasuryEntry` table it needs.

---

## Phase 0 (gate, before Phase 1): Data Export Check — ✅ RESOLVED

- **Resolution (confirmed):** No production data exists. The legacy Artifact was used only for development and testing. The new system starts from an empty database.
- **Consequence:** Phase 15 requires no data-import step. Cutover is "verify the new system, then retire the legacy file," nothing more.

---

## Phase 1 — Database Foundations & Settings/Reference Data — ✅ COMPLETE

**Goal:** Stand up the **complete** Prisma schema — every model referenced anywhere in this plan, including the ones whose API/UI don't get built until much later — in one coherent, foreign-key-consistent migration. Build and ship only the Settings/reference-data CRUD now; every other table exists but stays empty/unused until its own phase adds logic on top of it.

This phase's scope was deliberately widened (originally it covered only Settings/reference data) because Requirement 5 (Treasury auto-posting), Requirements 2–4 (independent Quotations/Work Orders), and Requirements 9/13/14 (inventory/audit-log/attachments) all need their tables to exist before later phases can write to them, and the cross-cutting patterns (UUIDs, soft delete, branch scoping) are far safer to apply once, consistently, than piecemeal across fourteen later phases.

- **Depends on:** nothing (first real phase).
- **Files/components to create:**
  - `apps/api/prisma/schema.prisma` — the full model set (see [Cross-Cutting Schema Additions](#cross-cutting-schema-additions-apply-in-phase-1) for the shared patterns applied throughout), one migration.
  - `apps/api/prisma/seed.ts` — seeds the default `Branch` (`code: "MAIN"`, `isDefault: true`), the first year's `DocumentSequence` rows (`INVOICE`/`QUOTATION`/`WORK_ORDER`, prefixes `CLP-INV`/`CLP-QUO`/`CLP-WO`), and a default `Setting` row matching legacy's `DEFAULT_SETTINGS` values exactly.
  - `apps/api/src/routes/settings.ts`, `controllers/settings.ts` — CRUD for global pricing constants (built now).
  - `apps/api/src/routes/sheetTypes.ts`, `sizeFamilies.ts`, `readyProducts.ts`, `services.ts` — CRUD for catalog/reference data (built now).
  - `packages/shared/src/schemas/settings.ts`, `sheetType.ts`, `sizeFamily.ts`, `readyProduct.ts`, `service.ts` — Zod schemas mirroring LEGACY_ANALYSIS §4's shapes.
  - `apps/web/src/pages/settings/` — read-only settings screen first (validates the data shape end-to-end before an editor UI is built).
- **Database mapping — every model created this phase; API/UI built now vs. later noted per model:**
  - `Branch`, `DocumentSequence` — schema only, seeded, no UI yet (Requirements 1, 8, 11).
  - `Setting` — singleton row for the flat pricing constants (full field list unchanged from legacy `DEFAULT_SETTINGS`, LEGACY_ANALYSIS §4). **API/UI built now.**
  - `SizeFamily` + `SizeFamilyEntry` — replaces legacy `families`; "protected" sizes (LEGACY_ANALYSIS §2/§9) become a computed flag derived from the `GROUPS`/`REAL_SIZES` constants ported verbatim in Phase 4. **API/UI built now.**
  - `SheetType` (now with a `unit` field per Requirement 9) — replaces `settings.sheetTypes.{gayer,regular}`. **API/UI built now.**
  - `ReadyProduct`, `Service`. **API/UI built now.**
  - `StaffProfile` — schema only; API/UI in Phase 2.
  - `Customer` — schema only; API/UI in Phase 3.
  - `Order`, `OrderItem`, `Payment` — schema only (with `invoiceNumber`, required `branchId`, soft-delete fields, `OrderStatus` enum per the finalized list); API/UI in Phase 6.
  - `Quotation`, `QuotationItem` — schema only (with `quotationNumber`, `convertedOrderId`, `QuotationStatus`); API/UI in Phase 7.
  - `WorkOrder` — schema only (with `workOrderNumber`, `WorkOrderProductionStatus` per the finalized list); API/UI in Phase 8.
  - `TreasuryEntry` — schema only (with `sourceType`, `orderId`, `paymentId`, `customerId`, `staffId`, `branchId` per Requirement 5); API/UI in Phase 10, but **written to starting in Phase 6**.
  - `Supplier`, `SupplierPurchase`, `SupplierPayment` — schema only; API/UI in Phase 11.
  - `Tender` — schema only; API/UI in Phase 12.
  - `InventoryItem`, `StockLevel`, `StockMovement` — schema only, no API/UI/logic anywhere (Requirement 9).
  - `Attachment` — schema only, no upload/storage wiring (Requirement 14).
  - `AuditLog` — schema only, no write-path yet (Requirement 13).
- **API endpoints (built now):** `GET/PUT /api/settings`, `GET/POST/PUT/DELETE /api/sheet-types`, `/api/size-families`, `/api/ready-products`, `/api/services`.
- **UI components (built now):** read-only settings dashboard (mirrors legacy Settings screen sections).
- **Business logic affected:** none — pure data modeling and CRUD for the reference-data slice; no calculators are touched by this phase (Requirements 6, 7, 10 fully respected).
- **Risks:**
  - This is the single highest-leverage phase for getting the schema right, since fourteen later phases build directly on top of tables created here without revisiting them.
  - Creating tables now that won't have working API/UI until much later means they must not be exposed or queryable prematurely — gate each table's routes behind its own phase.
  - `isDeleted: false` filtering must be remembered by every later phase's read queries — Phase 1 creates the columns but no middleware auto-filters them.
- **Commit:** done, in two commits — schema/API/UI code (`f25f2d5`), then the applied migration + live verification (`5514a70`) once real Supabase credentials were available.
- **Verified against the live database:** all 26 model tables + `_prisma_migrations` exist; seed data confirmed correct (default branch, 3 document-numbering sequences, `Setting` row matching legacy `DEFAULT_SETTINGS`, 8 `SizeFamily`/38 `SizeFamilyEntry` rows matching legacy `DEFAULT_FAMILIES`, 26 `SheetType` rows, empty `ReadyProduct`/`Service` as legacy defaults).

---

## Phase 2 — Identity & Access Management — ✅ COMPLETE

**Goal (expanded from the original "Auth & Staff" scope, by explicit instruction):** replace the legacy plaintext employee list with Supabase Auth for credentials **and** build a true, database-driven RBAC system on top of it — roles, granular permissions, branch-scoped access, full user management, and audit logging on every identity-related action. See [ARCHITECTURE.md §6](ARCHITECTURE.md#6-identity--access-management) for the resulting design and [ADRs 0021–0026](adr/) for the individual decisions.

- **Depends on:** Phase 1 (the `StaffProfile`, `Branch`, and `AuditLog` tables already existed from Phase 1's migration).
- **Delivered:**
  - **Schema:** `StaffProfile` extended (`email`, `phone`, `isActive`, `lastLoginAt`; the old `role` enum removed); new `Role`, `Permission`, `UserRole`, `RolePermission`, `UserBranchAccess` tables; `AuditAction` enum gained `LOGIN`/`LOGOUT`/`PASSWORD_RESET`. Migrated and seeded against the live Supabase database.
  - **Backend:** `requireAuth` (Supabase JWT verification + application identity/permission loading), `requirePermission` (database-driven authorization), `authContext`/`auditService`/`userService` services; full REST surface: `/api/auth/{login,logout,me}`, `/api/users` (+ `/roles`, `/branch-access`, `/reset-password` sub-actions), `/api/roles` (+ `/permissions`), `/api/permissions`, `/api/branches` (read-only). Phase 1's Settings/catalog endpoints were retrofitted with the same auth requirement.
  - **Frontend:** React Router introduced (ADR 0024); `AuthContext`, `LoginPage` (with remember-me and self-service forgot-password), `ProtectedRoute`, `AppShell`; management screens for Users, Roles, and Permissions.
  - **Seed data:** 8 default roles, 56 permissions across 12 modules (including `roles`/`permissions` themselves), default role→permission grants — all editable afterward, none hardcoded in application logic.
- **Business logic affected:** none — this phase is entirely infrastructure/authorization, no calculation code touched.
- **Resolved risks:**
  - Legacy plaintext passwords were **not** migrated (by design) — every user requires a fresh Supabase Auth invite. See [ADR 0026](adr/0026-legacy-employee-migration-mapping.md) for the full legacy-employee mapping (including the fact that legacy has no email field, which the new model requires).
  - A latent crash-at-startup bug in both Supabase client constructions (empty `SUPABASE_URL` throws synchronously in `createClient`) was found and fixed during this phase — it only surfaced once `requireAuth` was exercised broadly.
- **Verified:** migration applied and seed data confirmed against the live Supabase database; full lint/typecheck/build passes; live smoke-tested (unauthenticated redirect to `/login`, every protected endpoint correctly rejecting missing/invalid tokens, Phase 1 endpoints now also protected).

---

## Phase 3 — Customers

**Goal:** Port the Clients module.

- **Depends on:** Phase 1 (table already exists), Phase 2 (auth to gate writes).
- **Files/components to create:**
  - `apps/api/src/routes/customers.ts`, `controllers/customers.ts`.
  - `packages/shared/src/schemas/customer.ts` — Zod schema.
  - `apps/web/src/pages/customers/`, `apps/web/src/components/CustomerPicker.tsx` (mirrors `clientPickerHTML()`/`cpClientSearchLive`).
- **Database mapping:** `Customer` table already exists (Phase 1), shared across branches per the Cross-Cutting assumption above.
- **API endpoints:** `GET /api/customers?search=`, `POST /api/customers`, `DELETE /api/customers/:id`.
- **UI components:** customer list/table, quick-add form, autocomplete picker (reused by Phase 5).
- **Business logic affected:** none.
- **Risks:**
  - Legacy has no client-history-preserving delete. Decide explicitly whether hard delete or soft delete/deactivation is required once `Order`/`Quotation` foreign keys exist (Phase 6/7) — decide before those phases, don't decide silently.

---

## Phase 4 — Pricing & Calculation Engine (pure functions, no UI, no DB)

**Goal:** Port every calculator from LEGACY_ANALYSIS §3 as pure, dependency-free TypeScript functions in `packages/shared`, verified against the legacy output before anything is built on top of them. **This is the highest-risk, highest-priority phase in the entire plan, and the direct mechanism enforcing Requirements 6, 7, and 10.**

- **Depends on:** Phase 1 only (needs the `Setting`/`SheetType`/`SizeFamily` shapes to type function inputs) — does **not** depend on Auth, Customers, or any UI.
- **Files/components to create (all in `packages/shared/src/calc/`):**
  - `sizeFamilies.ts` — port `DEFAULT_FAMILIES`, `GROUPS`, `REAL_SIZES`, `famCount`, `parseSize` verbatim.
  - `tieredCalc.ts` — port `resolveTieredCalc` verbatim, including the A-series special case.
  - `numbering.ts` — port `calculateNumberingSheets`, `NUMBERING_RULES`, `NUMBERING_GROUP2_MAP`, `numberingArea` verbatim, **kept in a separate module from `tieredCalc.ts`** deliberately, exactly mirroring the legacy code's explicit separation (LEGACY_ANALYSIS §3, §8).
  - `loosePaper.ts`, `notebook.ts`, `envelope.ts`, `folders.ts`, `boards.ts` — one pure function per calculator, ported from `cpCalcLoose`, `cpCalcNotebook`, `cpCalcEnvelope`, `cpCalcFolders`, `computeBoards` respectively.
  - `packages/shared/src/calc/__tests__/` — golden-master regression tests: run the **legacy** functions (extracted verbatim as fixtures) against a representative input matrix per calculator, capture exact outputs, assert the ported functions match every field of every `breakdown` bit-for-bit.
- **Database mapping:** none — pure functions, no persistence.
- **API endpoints:** none yet (exposed via API in Phase 5).
- **UI components:** none yet.
- **Business logic affected:** all offset/boards pricing logic, ported with zero behavioral changes — this is Requirements 6/7/10 made concrete.
- **Risks:**
  - No calculator ships without a passing regression test against captured legacy output first.
  - Resist any temptation to "clean up" the tiered/numbering split, the A-series special case, or the folders' free-text finishing-stage fields — confirmed intentional, not incidental (§8).
  - `ceil()` and `fmt()` (legacy's custom epsilon-adjusted rounding helpers) must be ported exactly.

---

## Phase 5 — Order Builder UI (in-memory cart only)

**Goal:** Rebuild the order-type tabs, per-product forms, and the cart/checkout bar (§2, §7) wired to the Phase 4 engine — **without persisting orders yet**.

- **Depends on:** Phase 3 (customer picker), Phase 4 (calculation engine).
- **Files/components to create:**
  - `apps/web/src/pages/orders/new/` — order-type tab shell (mirrors `screenOrderType`/`orderTabContentHTML`).
  - `LoosePaperForm.tsx`, `NotebookForm.tsx`, `EnvelopeForm.tsx`, `FoldersForm.tsx`, `BoardsForm.tsx`, `ReadyProductForm.tsx`, `ServiceForm.tsx`.
  - `apps/web/src/components/CartBar.tsx` — sticky checkout bar (mirrors `cartBarHTML`), discount/VAT/payment-split UI, **not wired to a save action yet**.
  - `apps/web/src/state/cartStore.ts` — scoped cart store, local to the order-builder flow.
- **Database mapping:** none yet.
- **API endpoints:** `POST /api/calculate/:kind` (recommended: calculation runs server-side against live `Setting`/`SheetType` data, reused verbatim by Phase 6/7's authoritative save).
- **UI components:** all seven product forms, the cart bar.
- **Business logic affected:** none new — wiring, not logic.
- **Risks:**
  - Keep the cart bar's discount/VAT/payment UI's shape agreed with Phase 6 and Phase 7 now, since both will wire "save" actions onto it later.

---

## Phase 6 — Orders & Invoices Persistence _(planning only — not implemented now)_

**Goal:** Persist a finalized cart as a real `Order` + `OrderItem` + `Payment`, with a **sequential invoice number** (Requirement 1) and an **automatic linked `TreasuryEntry`** (Requirement 5) — replacing `cpDoFinalize()`.

- **Depends on:** Phase 5. Writes into tables already created by Phase 1 (`Order`, `OrderItem`, `Payment`, `TreasuryEntry`).
- **Files/components to create:** `apps/api/src/routes/orders.ts`, `controllers/orders.ts`, `services/orderService.ts`; `apps/web` finalize/save actions on the Phase 5 cart bar.
- **Database mapping:** no new tables (all created in Phase 1). This phase's service layer must, **in a single database transaction**:
  1. Insert `Order` (auto-assigned `invoiceNumber` via the DB sequence) + its `OrderItem`s (denormalized `breakdown` JSON snapshot, preserving the legacy strength noted in §8) + `Payment`(s).
  2. For each `Payment`, insert a matching `TreasuryEntry` (`type: income, sourceType: invoice_payment, sourceOrderId, sourcePaymentId`).
  3. Create the matching `WorkOrder` row (Phase 8's table, `productionStatus` defaulted to its first stage) — every finalized order gets a work order automatically, exactly as legacy implicitly assumes (every saved order can be work-order-printed).
- **API endpoints:** `POST /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status`.
- **UI components:** wires Phase 5's cart bar "Save"/"Save & Print" buttons to the new endpoint.
- **Business logic affected:** order finalization, discount/VAT math, payment/remaining-balance math (`cpCollectionNumbers`) — ported from legacy, not redesigned. Invoice numbering and treasury posting are new _structural_ behavior per Requirements 1 and 5, not calculation changes.
- **Risks:** this is where LEGACY_ANALYSIS risk #4 (concurrency) must be actively addressed — steps 1–3 above happen in one transaction or not at all; a half-committed order (invoice saved but treasury/work-order missing) is a correctness bug, not an edge case to tolerate. **No implementation until this phase is separately approved.**

---

## Phase 7 — Quotations _(planning only — not implemented now)_

**Goal:** Quotations become **independent, persisted records** (Requirement 2) with **one-click conversion into an invoice** (Requirement 3) — a substantial expansion beyond legacy's stateless `cpPrintQuotationPreview`.

- **Depends on:** Phase 5 (cart), Phase 1 (`Quotation`/`QuotationItem` tables), Phase 6 (conversion target), Phase 14 (print rendering).
- **Files/components to create:** `apps/api/src/routes/quotations.ts`, `controllers/quotations.ts`, `services/quotationService.ts`; `apps/web/src/pages/quotations/` (list + detail, new — legacy had no quotation history screen at all since nothing was persisted).
- **Database mapping:** no new tables (created in Phase 1). `Quotation` (`id, quotationNumber, customerId, branchId, staffId, date, items snapshot, discountPercent, vatOn, vatAmount, finalTotal, status[DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED|CONVERTED], validUntil, convertedOrderId?`), `QuotationItem` (mirrors `OrderItem`).
- **API endpoints:** `POST /api/quotations` (save, replacing legacy's print-only preview), `GET /api/quotations`, `GET /api/quotations/:id`, `PATCH /api/quotations/:id/status`, **`POST /api/quotations/:id/convert`** (Requirement 3 — body accepts an optional `recalculate: boolean`, default `false`; creates an `Order`+`OrderItem`s from the quotation — copying `breakdown` snapshots verbatim when `recalculate` is false/omitted, or re-running Phase 4's calculators against current settings when `true` — sets `status: CONVERTED` + `convertedOrderId`).
- **UI components:** quotation list/history page, "Save quotation" action on the cart bar (alongside/replacing "print quotation"), "Convert to invoice" button with a "recalculate using current pricing" checkbox on a quotation's detail view.
- **Business logic affected:** none new to the calculators themselves — reuses Phase 4's engine and Phase 6's totals math exactly. The only new logic is the conversion mapping (quotation fields → order fields) and the freeze/recalculate branch.
- **Risks:**
  - Keep this genuinely a separate table from `Order` — no shortcut where a "quotation" is just an `Order` with a draft flag, since Requirement 2 explicitly asks for independence (this also naturally supports quotations that are _never_ converted, which legacy couldn't even represent, since it never saved them at all). **No implementation until separately approved.**

---

## Phase 8 — Work Orders _(planning only — not implemented now)_

**Goal:** Work Orders become an **independent entity with their own production status pipeline** (Requirement 4), decoupled from `Order.status`.

- **Depends on:** Phase 6 (a `WorkOrder` row is created automatically alongside every `Order`, per Phase 6's transaction), Phase 1 (`WorkOrder` table), Phase 14 (print rendering).
- **Files/components to create:** `apps/api/src/routes/workOrders.ts`, `controllers/workOrders.ts`, `services/workOrderService.ts`; `apps/web/src/pages/work-orders/` (new — a production-floor-facing list independent of the sales-facing order history).
- **Database mapping:** no new tables (created in Phase 1). `WorkOrder` (`id, workOrderNumber, orderId (unique), branchId, productionStatus[WAITING|DESIGN|PREPRESS|PLATE_MAKING|PRINTING|FINISHING|QUALITY_CHECK|READY_FOR_DELIVERY|COMPLETED], createdAt, updatedAt`) — final enum per [Cross-Cutting Schema Additions](#cross-cutting-schema-additions-apply-in-phase-1).
- **API endpoints:** `GET /api/work-orders` (production-floor list/queue, filterable by `productionStatus`), `GET /api/work-orders/:id`, `PATCH /api/work-orders/:id/status`, `GET /api/work-orders/:id/print` (renders the document, mirrors `cpWorkOrderDocumentHTML`).
- **UI components:** production queue/board (new capability legacy never had — legacy only had a single status dropdown mixed into the sales-facing History screen), work-order print action.
- **Business logic affected:** none — presentation and status-tracking of already-computed order data.
- **Risks:**
  - The QR-code external dependency (LEGACY_ANALYSIS §10, item 6; still an open, low-priority decision) must be settled here: keep `api.qrserver.com`, replace with a local library (e.g. `qrcode` npm package, generated server-side — recommended), or drop QR entirely. **No implementation until separately approved.**

---

## Phase 9 — History & Status Tracking

**Goal:** Port the searchable/filterable order list. Because Requirement 4 split `Order.status` (sales/billing) from `WorkOrder.productionStatus` (production floor), this phase's History screen now surfaces the _sales_ status; production tracking lives in Phase 8's dedicated queue.

- **Depends on:** Phase 6 (needs real orders to list), Phase 8 (to link through to production status/work-order printing).
- **Files/components to create:** `apps/web/src/pages/history/`; `apps/api/src/routes/orders.ts` extensions (`GET /api/orders?search=&customerId=`).
- **Database mapping:** none new — `Order.status` and its indexing were already added in Phase 1.
- **API endpoints:** `GET /api/orders` (filter/search/paginate — **adding pagination here, absent in legacy per §9**), `PATCH /api/orders/:id/status`.
- **UI components:** order list/table (sales status only), links out to invoice reprint (Phase 6/14), quotation origin (if converted, Phase 7), and work-order/production status (Phase 8).
- **Business logic affected:** none new.
- **Risks:** low. Make sure the sales-status/production-status split (Requirement 4) doesn't get silently re-merged back into one field here for UI convenience — that would undo the independence Requirement 4 asked for.

---

## Phase 10 — Treasury _(planning only — not implemented now)_

**Goal:** Build the manual income/expense/transfer ledger UI and balance reporting. The `TreasuryEntry` table already exists from Phase 1, and **automatic `invoice_payment` entries are already flowing in from Phase 6** by the time this phase starts — this phase adds the human-facing side (manual entry, filtering, statement printing) on top of data that may already be non-empty.

- **Depends on:** Phase 1 (table + auto-posting from Phase 6 already writing to it), Phase 2 (auth, for staff attribution).
- **Files/components to create:** `apps/api/src/routes/treasury.ts`, `controllers/treasury.ts`; `apps/web/src/pages/treasury/`.
- **Database mapping:** no new tables — `TreasuryEntry` (with `sourceType`/`sourceOrderId`/`sourcePaymentId`) already exists from Phase 1.
- **API endpoints:** `GET /api/treasury?type=&from=&to=&search=`, `POST /api/treasury` (manual entries only — `sourceType` forced to `manual` server-side, never client-settable), `DELETE /api/treasury/:id` (**must reject deletion of `invoice_payment`-sourced entries** — see Requirement 5's design note above), `GET /api/treasury/balance`.
- **UI components:** ledger table + filters (visually distinguishing auto-posted invoice entries from manual ones), add-entry form (manual only), balance card (also read by Phase 13's dashboard).
- **Business logic affected:** balance calculation (`income − expense`; legacy's `transfer` type is counted in neither direction — confirm this is intentional business logic before porting rather than silently "fixing" what might be an existing legacy bug). No change to how invoice payments become treasury entries beyond what Phase 6 already established.
- **Risks:** the transfer-type balance question above; otherwise, low risk — this phase is now "build a ledger viewer/editor over data that already exists," not "build the whole ledger from scratch." **No implementation until separately approved.**

---

## Phase 11 — Suppliers

**Goal:** Port supplier CRUD + nested purchases/payments ledger.

- **Depends on:** Phase 1 (tables exist), Phase 2 (auth).
- **Files/components to create:** `apps/api/src/routes/suppliers.ts`, `controllers/suppliers.ts`; `apps/web/src/pages/suppliers/` (list + detail/ledger page).
- **Database mapping:** `Supplier`, `SupplierPurchase`, `SupplierPayment` already created in Phase 1, normalizing legacy's nested arrays (§4) into real tables with foreign keys. Treated as shared across branches per the Cross-Cutting assumption.
- **API endpoints:** `GET/POST/DELETE /api/suppliers`, `GET /api/suppliers/:id/ledger`, `POST /api/suppliers/:id/purchases`, `POST /api/suppliers/:id/payments`.
- **UI components:** supplier list, per-supplier statement/ledger view with running balance (mirrors `screenSupplierDetail`).
- **Business logic affected:** supplier balance = purchases − payments, ported as-is.
- **Risks:** low — same shape and risk profile as Customers (Phase 3).

---

## Phase 12 — Tenders

**Goal:** Port the simple tender-tracking CRM list.

- **Depends on:** Phase 1 (table exists), Phase 2 (auth), optionally Phase 3 (linking to a real `Customer` instead of legacy's free-text client name — a deliberate, called-out improvement, decide during this phase).
- **Files/components to create:** `apps/api/src/routes/tenders.ts`, `controllers/tenders.ts`; `apps/web/src/pages/tenders/`.
- **Database mapping:** `Tender` already created in Phase 1.
- **API endpoints:** `GET/POST/PATCH/DELETE /api/tenders`.
- **UI components:** tender list/table with inline status dropdown, add form.
- **Business logic affected:** none — simple CRUD with an enum.
- **Risks:** minimal; lowest-risk phase in the plan.

---

## Phase 13 — Reports & Dashboard

**Goal:** Port the aggregation queries behind `dashboardStats()` and `screenReports()`.

- **Depends on:** Phases 6, 8, 10, 11 (needs Orders, Work Orders, Treasury, and Suppliers data to aggregate over).
- **Files/components to create:** `apps/api/src/services/reportsService.ts` (revenue totals, revenue-by-kind, top clients, top models, treasury balance, supplier debt, and — new, enabled by Requirement 4 — production-status breakdowns from `WorkOrder`); `apps/web/src/pages/dashboard/`, `apps/web/src/pages/reports/`.
- **Database mapping:** none new — read-only aggregation over tables from earlier phases.
- **API endpoints:** `GET /api/dashboard/stats`, `GET /api/reports?from=&to=`.
- **UI components:** dashboard stat tiles + top-clients table (mirrors `screenHome`), reports date-range filter + revenue/top-client/top-model tables (mirrors `screenReports`).
- **Business logic affected:** aggregation formulas ported as-is; moving them from client-side JS reduces to server-side SQL is an implementation-detail change, not a behavior change, and must produce identical numbers.
- **Risks:** verify server-side aggregation totals match legacy's client-side reduce logic exactly, including local-timezone date-boundary handling for "today"/"this month."

---

## Phase 14 — Printing Engine Modernization

**Goal:** Replace the hidden-iframe/`window.print()` hack (§6) with a proper, testable rendering path for all print documents: Invoice, Quotation, Work Order, Treasury statement, Report.

- **Depends on:** the content-producing phases it serves (6/7/8/10/13) for real data to render — the rendering _mechanism_ can be built and visually verified against legacy output as soon as Phase 6 exists.
- **Files/components to create:** a shared print/PDF rendering approach — evaluate (a) dedicated print-friendly React routes + the browser's native print (closest to legacy's actual mechanism, lowest layout-surprise risk) vs. (b) server-side PDF generation (Puppeteer/`@react-pdf/renderer`). Recommend starting with (a) for fidelity.
  - `apps/web/src/print/InvoiceDocument.tsx`, `QuotationDocument.tsx`, `WorkOrderDocument.tsx`, `TreasuryStatementDocument.tsx`, `ReportDocument.tsx` — one component per legacy print template.
- **Database mapping:** none — pure presentation layer.
- **API endpoints:** none new, or thin `GET /api/.../print` endpoints if server-rendering is chosen.
- **UI components:** the five print documents listed above.
- **Business logic affected:** none — must not recompute anything, only render already-computed data.
- **Risks:** LEGACY_ANALYSIS risk #5 (print fidelity) — Arabic RTL shaping, `@page` margins, and logo/QR image-load timing all need explicit visual comparison against real legacy printouts before sign-off.

---

## Phase 15 — Parallel Run & Cutover

**Goal:** Run the new system in real use; retire the legacy file. No data-import step needed (Phase 0).

- **Depends on:** every prior phase.
- **Files/components to create:** none — operational, not a coding task.
- **Database mapping / API endpoints / UI components:** none new.
- **Business logic affected:** none.
- **Risks:** still the point of no return for the legacy file. Do not delete/archive `legacy/cleopatra_press_system.html` until every phase above has been verified in real use for a full billing cycle — it remains the calculation-parity reference until the new system has proven itself.

---

## Decisions Log

All structural decisions raised during planning are now resolved and incorporated above. Kept here for traceability.

1. ~~Invoice/quotation numbering scope~~ → **Resolved:** per-branch sequential, configurable prefix (Requirement 1).
2. ~~`Order.status` vs. `WorkOrder.productionStatus` enum values~~ → **Resolved:** exact enums given in Cross-Cutting Schema Additions.
3. ~~Quotation-to-invoice conversion pricing~~ → **Resolved:** freeze/preserve by default, explicit `recalculate: true` opt-in.
4. ~~Branch scoping of Customers/Suppliers/Tenders/catalog~~ → **Resolved:** shared across branches, confirmed.
5. **Still open, low-priority, does not block Phase 1:** Treasury `transfer` type accounting — legacy counts transfers in neither income nor expense when computing balance. Revisit before Phase 10 is built.
6. **Still open, low-priority, does not block Phase 1:** QR code dependency for Work Orders (keep external API / local library / drop). Revisit before Phase 8 is built.

---

## Summary Table

| Phase | Module                                                                 | Implements now?                                   |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 0     | Data export check (gate)                                               | ✅ resolved — no data exists                      |
| 1     | DB foundations (full schema) & settings/reference data                 | ✅ complete & verified                            |
| 2     | Identity & Access Management (auth, RBAC, branch access, audit)        | ✅ complete & verified                            |
| 3     | Customers                                                              | ✅ eligible                                       |
| 4     | Pricing & calculation engine                                           | ✅ eligible                                       |
| 5     | Order builder UI (in-memory cart)                                      | ✅ eligible                                       |
| 6     | Orders & invoices persistence (+ sequential numbering + auto-treasury) | ⛔ planning only                                  |
| 7     | Quotations (independent + convert-to-invoice)                          | ⛔ planning only                                  |
| 8     | Work orders (independent + production status)                          | ⛔ planning only                                  |
| 9     | History & status tracking                                              | ✅ eligible (after 6, 8)                          |
| 10    | Treasury (ledger UI; auto-posting already live from Phase 6)           | ⛔ planning only                                  |
| 11    | Suppliers                                                              | ✅ eligible                                       |
| 12    | Tenders                                                                | ✅ eligible                                       |
| 13    | Reports & dashboard                                                    | ✅ eligible (after 6/8/10/11)                     |
| 14    | Printing engine modernization                                          | ✅ eligible (mechanism); documents depend on 6-13 |
| 15    | Parallel run & cutover                                                 | ⛔ last, after everything                         |

**Phases 1 and 2 are complete and verified against the live Supabase database.** Waiting for approval before starting Phase 3 (Customers).
