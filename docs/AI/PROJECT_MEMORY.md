# Project Memory

> This file represents the current project state, per
> `docs/AI/MASTER_PROMPT.md`. It is updated whenever an inspection finds the
> real project state differs from what's written here. Last updated during
> the FEATURE-001-IAM engineering audit.

## Stack

- Frontend: React + Vite + TypeScript, Tailwind, shadcn/ui (`apps/web`).
- Backend: Express 5 + TypeScript, running as a traditional
  `app.listen()` process (`apps/api/src/index.ts`), not a serverless
  function.
- Database: Supabase Postgres via Prisma 7 (custom `prisma-client`
  generator, driver adapter `@prisma/adapter-pg`).
- Auth: Supabase Auth (authentication) layered under a custom
  database-driven RBAC (authorization) — see ADR 0021.
- Shared code: `packages/shared` — Zod schemas and the permission-key
  catalog, consumed by both `apps/web` and `apps/api`.
- Monorepo: npm workspaces (`apps/*`, `packages/*`).

## Migration status

This is a migration from a single-file legacy Artifact
(`legacy/cleopatra_press_system.html`, never modified — treated as
immutable source of truth for calculations/workflows) to this monorepo.
Phases completed and committed:

- Phase 1 — database foundations, settings/reference-data CRUD
  (`f25f2d5`, `5514a70`).
- Phase 1.6 — legacy function-to-module mapping (`28318bf`).
- Phase 1.7 — development standards docs + ADR folder (`22c3426`).
- Phase 2 — Identity & Access Management (`ab7ecb8`): Supabase Auth,
  database-driven RBAC (8 seeded roles), branch access model, audit
  logging, Users/Roles/Permissions management UI.
- Two post-Phase-2 build fixes: monorepo build self-containment for
  Vercel (`19adbd5`), and a Helmet/TypeScript `NodeNext` import fix
  (`14b06e8`).

- FEATURE-002 Milestone 1 (Core Partner Record) — not yet committed.
  Implements the Approved Business Partner + Contact Person architecture
  (`docs/AI/FEATURES/FEATURE-002-CUSTOMERS/01_ANALYSIS.md`): a single
  `BusinessPartner` model with a `PartnerRole[]` (Customer, Supplier,
  Government, School, Hospital, Company, Printing House, Internal
  Department) and a `PartnerStatus` lifecycle (Prospect/Active/Inactive/
  Blocked), full CRUD, and the "cannot be Active without a phone or
  email" business rule. Permission namespace is `partners.*` (approved
  in `02_PLAN.md`) — `customers.*`/`suppliers.*` were retired from the
  permission catalog, not kept alongside it.
  **Important schema consequence**: the Phase 1 placeholder `Customer`
  and `Supplier` models (both empty, never used by any application code)
  were replaced by `BusinessPartner` rather than left as unused parallel
  tables — `Order`, `Quotation`, `TreasuryEntry`, `Tender`, `Attachment`,
  `SupplierPurchase`, and `SupplierPayment` now have a `partnerId`
  pointing at `BusinessPartner` instead of `customerId`/`supplierId`.
  Anyone building Orders/Quotations/Work Orders/Treasury/Tenders next
  should reference `BusinessPartner`, not `Customer`.
- FEATURE-002 Milestone 2 (Contact Persons) — not yet committed. Adds
  `ContactPerson` (first-class per the Approved decision — every
  `BusinessPartner` may have zero or more), related via `partnerId`
  (`onDelete: Cascade`). Fields: `fullName`, `jobTitle`, `department`,
  `mobile`, `phone`, `whatsapp`, `email`, `preferredContactMethod`
  (nullable `PreferredContactMethod` enum), `isPrimary`,
  `canApproveQuotations`, `canApproveWorkOrders`,
  `canApproveFinancialDocuments`, `notes`, `isActive` (business toggle,
  separate from the standard `isDeleted` soft-delete lifecycle).
  **Architecture notes for future milestones/features to know:**
  - `isPrimary` can **only** be changed via `PUT
    /api/partners/:partnerId/contacts/:contactId/primary`, never via the
    general update endpoint — that dedicated endpoint atomically unsets
    any other primary contact for the same partner in one transaction.
    Don't add `isPrimary` to the general update schema later without
    re-checking this invariant.
  - Deactivating (`isActive: false`) the current primary contact
    auto-clears `isPrimary` in the same write — inactive contacts can
    never be primary, enforced as an invariant, not just at the
    set-primary entry point.
  - `AuditAction` gained one new enum value, `PRIMARY_CHANGED` — added
    because "who is primary" is a relationship/exclusivity change,
    distinct from a generic `STATUS_CHANGE`. Regular create/update/
    delete/status-toggle events reuse the existing `CREATE`/`UPDATE`/
    `DELETE`/`STATUS_CHANGE` values with `entityType: 'ContactPerson'`
    — no other per-entity action-name variants were added, and none
    should be for future entities either (that pattern doesn't scale).
  - Permission `partners.contacts.manage` was added as a new *action*
    within the existing `partners` module — not a new permission
    module. `ADMIN`/`SALES` already had it automatically via their
    `partners.*` wildcard grant; no seed grant changes were needed.
  - Routes are nested under the partner:
    `/api/partners/:partnerId/contacts[/...]`, matching the existing
    `/api/users/:id/roles` sub-resource convention rather than a flat
    `/api/contacts/:id`.
  - Frontend: Partner Profile now has its first tab bar (Overview /
    Contacts) — later milestones (Addresses, Credit, Tax, Documents,
    Notes) should add tabs here, not separate pages.
  - **Post-Approval hardening** (applied before M3 started): a DB-level
    partial unique index backs the "only one Primary Contact" rule
    (`@@unique([partnerId], where: { isPrimary: true, isDeleted: false
    })`, via Prisma 7's `partialIndexes` preview feature — see the
    "Partial unique indexes" architectural decision below); the
    `setPrimaryContactPerson` concurrency fix (`FOR UPDATE` row lock on
    the parent `BusinessPartner`); and contact ordering moved into the
    service layer as `CONTACT_ORDER_BY` in `contactPersonService.ts`.
    Full rationale in `03_IMPLEMENT.md`'s "M2 Hardening" section.
- FEATURE-002 Milestone 3 (Addresses) — not yet committed. Adds
  `PartnerAddress` (every `BusinessPartner` may have zero or more),
  related via `partnerId` (`onDelete: Cascade`). Fields: `name`, `type`
  (`AddressType` enum: `BILLING`/`SHIPPING`/`OFFICE`/`FACTORY`/`BRANCH`/
  `WAREHOUSE`/`REGISTERED`/`OTHER`), `country`, `governorate`, `city`,
  `district`, `street`, `building`, `floor`, `apartment`, `postalCode`,
  `googleMapsUrl`, `latitude`, `longitude`, `notes`, `isDefault`,
  `isActive` (business toggle, separate from `isDeleted`).
  **Architecture notes for future milestones/features to know:**
  - Same "exclusivity via dedicated endpoint" shape as M2's `isPrimary`,
    generalized to a `(partnerId, type)` group instead of just
    `partnerId`: `isDefault` can **only** change via `PUT
    /api/partners/:partnerId/addresses/:addressId/default`, which
    atomically unsets any other default address of the *same type* for
    the same partner. Built with the concurrency-safe lock pattern and
    the DB partial unique index from the start (not retrofitted), since
    M2's hardening review established the pattern before M3 began.
  - Deactivating the current default address auto-clears `isDefault` in
    the same write — same invariant shape as M2.
  - `AuditAction` gained `DEFAULT_CHANGED` (kept distinct from M2's
    `PRIMARY_CHANGED` — different entity, independently queryable).
  - Permission `partners.addresses.manage` added as a new action within
    the existing `partners` module.
  - Routes nested under the partner:
    `/api/partners/:partnerId/addresses[/...]`, matching the M2 Contact
    Persons convention.
  - Frontend: Partner Profile's tab bar now has three tabs (Overview /
    Contacts / Addresses).
- FEATURE-002 Milestone 4 (Categories & Tags) — not yet committed. Adds
  `PartnerCategory` (zero-or-one per partner, plain nullable
  `BusinessPartner.categoryId` FK — **no** exclusivity-lock pattern,
  unlike M2/M3, since there's only one FK column to update, not a flag
  moving between sibling rows) and `PartnerTag` (unlimited per partner,
  many-to-many via the explicit `BusinessPartnerTag` join table).
  **Architecture notes for future milestones/features to know:**
  - `categoryId`/`tagIds` are now part of the shared `BusinessPartner`
    DTO, but **read-only** there (excluded from create/update schemas,
    same exclusion pattern as `isPrimary`/`isDefault`) — changed only
    via `PUT /api/partners/:id/category` and
    `PUT /api/partners/:id/tags`.
  - `PUT .../tags` is a plain set-replace transaction (delete all +
    insert new), **not** built on `setExclusiveDefault` — there's no
    "exactly one" invariant to protect, so reusing that helper would
    have been a misapplication of it. Know when *not* to reuse a
    pattern, not just when to.
  - Deleting a `PartnerCategory`/`PartnerTag` currently assigned to any
    non-deleted partner is blocked (`409 CATEGORY_IN_USE`/`TAG_IN_USE`)
    — checked via a `count()` in `partnerCategoryService.ts`/
    `partnerTagService.ts`, not a DB constraint (Postgres FKs would
    need `ON DELETE RESTRICT`, which conflicts with this project's
    soft-delete convention — the check is intentionally
    application-level).
  - Assigning an inactive Category/Tag is rejected
    (`400 INACTIVE_CATEGORY`/`INACTIVE_TAG`); an *already*-assigned
    Category/Tag that later becomes inactive stays assigned and visible
    (marked "(inactive)" in the picker) — the rule blocks new
    assignment, it doesn't retroactively unassign.
  - `AuditAction` gained **eight** new per-entity values
    (`CREATE_CATEGORY`/`UPDATE_CATEGORY`/`DELETE_CATEGORY`/
    `CREATE_TAG`/`UPDATE_TAG`/`DELETE_TAG`/`CATEGORY_CHANGED`/
    `TAGS_CHANGED`) — a **deliberate, explicit exception** to the
    CREATE/UPDATE/DELETE + `entityType` convention M2 established
    ("wouldn't scale to future entities"). The M4 requirement specified
    these exact names, so they were used as specified; this doesn't
    reverse the M2/M3 convention, it's a one-off carve-out for this
    milestone. Don't treat M4's action-naming as the new default for
    yet another future entity without an equally explicit requirement.
  - List reads for both catalogs (`GET /api/partner-categories`,
    `GET /api/partner-tags`) require **no permission beyond a valid
    session** (matching the existing `GET /api/branches` precedent) —
    deliberately not gated on `settings.view`, because SALES (which has
    `partners.*` but not `settings.*`) needs to read these lists to
    populate the Category dropdown/Tag checkboxes when assigning them
    via `partners.edit`. Mutations remain strictly `settings.edit`.
  - This milestone introduced the **first `include`/join query** in the
    Partner domain (`listBusinessPartners`/`getBusinessPartnerDto` now
    `include: { tags: { select: { tagId: true } } }`, needed because
    `tagIds` is part of the DTO contract) — Prisma batches this as one
    extra query, not per-row N+1, consistent with the "no *unnecessary*
    nested loading" standard from the post-M3 query-performance review.
  - Frontend: Category & Tags is a **section** within the Overview tab
    of the Partner Profile, not its own tab (per the explicit M4
    wording) — unlike Contacts/Addresses, which are full CRUD lists.
    Settings gained its first genuinely-editable sections (Categories/
    Tags Management); the rest of the Settings page remains the Phase 1
    read-only display.
- FEATURE-002 Milestone 5 (Notes) — not yet committed. Adds `PartnerNote`
  (unlimited per partner), related via `partnerId` (`onDelete: Cascade`).
  Fields: `title`, `body` (plain multiline text — see below), `color`
  (optional hex string), `isPinned`, `createdBy`/`updatedBy` (bare UUIDs,
  same pattern as `deletedBy`), soft-delete triad.
  **Architecture notes for future milestones/features to know:**
  - `BusinessPartner`'s relation to `PartnerNote` is named
    `partnerNotes`, **not** `notes` — `BusinessPartner.notes` (a scalar
    `String?`, M1) already owns that name and is a completely different
    concept (one short remarks field vs. an unlimited first-class
    entity). Don't conflate the two, don't rename either.
  - "Rich text / multiline body" was implemented as **plain multiline
    text** (`<textarea>`, `white-space: pre-wrap`), not a WYSIWYG/HTML
    editor — no rich-text-editor dependency exists in the project, and
    adding one was judged out of scope for this milestone. If real rich
    formatting becomes a requirement, that's its own future decision.
  - `isPinned` is **not** an exclusivity flag — many notes may be pinned
    at once, so it does **not** use `partnerChildEntity.ts`'s
    `setExclusiveDefault` (that pattern is specifically for "exactly one
    per group" invariants, which this isn't). A plain, lock-free update
    via a dedicated `PUT .../notes/:noteId/pin` endpoint is sufficient.
  - Every notes endpoint — **including list** — requires `partners.edit`,
    not `partners.view`. This departs from the M2/M3 list-uses-view
    pattern deliberately: note content is sensitive internal commentary
    (per the requirement's own examples), and there's no `*.manage`
    sub-permission for Notes (none was requested). The frontend hides
    the Notes tab entirely for users without `partners.edit`, rather
    than showing it and having the list call 403.
  - `AuditAction` gained `PIN`/`UNPIN` (two new values, named to match
    the requirement's own wording) — `CREATE`/`UPDATE`/`DELETE` reuse
    the existing generic values with `entityType: 'PartnerNote'`, same
    as M2/M3 (not M4's per-entity-name exception, since M5's
    requirement didn't ask for `CREATE_NOTE`-style names).
  - The internal-only-vs-portal-visible flag described in
    `00_REQUIREMENTS.md` §17 / `02_PLAN.md`'s original Notes concept was
    **not implemented** — the actual M5 request specified a different,
    more concrete field set with no such flag. Superseded, not an
    oversight; see `03_IMPLEMENT.md`'s M5 section for the full note.
  - Frontend: Partner Profile's tab bar now has four tabs (Overview /
    Contacts / Addresses / Notes), with Notes conditionally rendered
    based on `partners.edit`.

Contacts (done, M2), addresses (done, M3), categories/tags (done, M4),
notes (done, M5), and Commercial & Credit Profile (done, M6); tax
profile, documents, search/filtering, duplicate detection, merge, and
import/export remain later FEATURE-002 milestones (M7–M14,
`docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md`) and are not
implemented yet.

### Pre-M6 preparation

Seven engineering rules were set for M6 and beyond
(`docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md`'s "Pre-M6
Engineering Rules"). One produced an actual schema change, already
live:

- **`AuditLog.partnerId`** (nullable, real FK to `BusinessPartner`,
  `onDelete: SetNull`) — added so a future unified partner Timeline can
  query `WHERE partnerId = X ORDER BY createdAt` across every
  partner-scoped entity type in one indexed pass, instead of joining per
  `entityType` by `entityId`. Every partner-scoped `recordAudit()` call
  (`BusinessPartner`, `ContactPerson`, `PartnerAddress`, `PartnerNote`,
  category/tag assignment events) now passes it; catalog CRUD
  (`PartnerCategory`/`PartnerTag` management) and non-partner domains
  (auth/users/roles/permissions) correctly leave it `null`. Existing
  rows were backfilled in the same migration. **Any future partner-
  scoped entity's audit calls must also pass `partnerId`** — this is now
  the standing convention, the same way `entityType`/`entityId` already
  are.
- The other six rules (Commercial Profile must live in its own model,
  never inline fields on `BusinessPartner`; Commercial Profile must be
  portal-visibility-safe by design; keep `BusinessPartner` as a thin
  identity root; don't redesign existing Partner Profile tabs; document
  as you go) were binding constraints on M6 — see below for how each
  was actually satisfied once M6 shipped.

### FEATURE-002 Milestone 6 (Commercial & Credit Profile) — done

Adds `PartnerCommercialProfile`, one-to-zero-or-one with
`BusinessPartner` (`partnerId @unique`, `onDelete: Cascade`). Fields:
`creditLimit` (Decimal), `paymentTermsDays` (Int, 0-365),
`preferredPaymentMethod` (reuses the **existing** `PaymentMethod` enum
from Treasury — Reuse Before Create), `priceTier` (free text, distinct
from `PartnerCategory`), `status` (new `PartnerCommercialStatus` enum:
ACTIVE/ON_HOLD/UNDER_REVIEW — distinct from `BusinessPartner.status`'s
`PartnerStatus`), `riskLevel` (new `PartnerRiskLevel` enum: LOW/MEDIUM/
HIGH), `preferredCurrency` (free string, unenforced, future-ready),
`internalNotes` (free text, distinct from both `BusinessPartner.notes`
and `PartnerNote`).

**Architecture notes for future milestones/features to know:**
- **The pre-M6 "Commercial Profile Separation" rule was satisfied by
  construction**: no commercial/credit field was ever added to
  `BusinessPartner`; the profile lives entirely in its own model.
- **The pre-M6 "Avoid God Objects" rule holds**: `BusinessPartner`
  gained only a nullable `commercialProfile` relation, nothing else.
- **`PartnerCommercialProfile` deliberately has no soft-delete triad** —
  a documented exception to ADR 0007 (updated): it's a 1:1 detail
  record, not an independently-addressable list-of-many entity like
  `ContactPerson`/`PartnerAddress`/`PartnerNote`. The soft-delete unit
  stays `BusinessPartner` itself.
- **Single upsert endpoint, not create+update**: `PUT
  /api/partners/:partnerId/commercial-profile` creates on first write,
  updates thereafter. `GET` returns `data: null` (not 404) when unset —
  a fresh partner having no commercial profile is normal, not an error.
- **No new `AuditAction` values** — reuses `CREATE`/`UPDATE`/
  `STATUS_CHANGE` (the same `statusChanged ? 'STATUS_CHANGE' : 'UPDATE'`
  branch `businessPartners.ts` already uses), since M6's own instruction
  didn't request per-entity action names the way M4's did.
  `recordAudit()` calls here also pass `partnerId`, continuing the
  pre-M6 Timeline-readiness convention automatically.
- **Permission `partners.credit.manage`** gates both the route and the
  Commercial tab's visibility — the only partner sub-resource whose
  permission is neither `partners.view` (M2/M3's read side) nor
  `partners.edit` (M4/M5's pattern), per `02_PLAN.md` §3's explicit
  "credit follows a different approval authority" rationale.
  **Known tension, not resolved**: SALES holds `partners.*` (Phase 2
  seed data), which automatically grants `credit.manage` too — in
  tension with that same rationale. Splitting SALES's wildcard is an
  IAM change bigger than this milestone, flagged for a future,
  dedicated review rather than fixed as a side effect here.
- **Tax Information was explicitly excluded** from M6 despite being
  suggested — it already has its own future milestone (M7); building it
  here would have pre-empted that milestone's scope.
- Frontend: Partner Profile's tab bar now has five tabs (Overview /
  Contacts / Addresses / Notes / Commercial), Commercial conditionally
  rendered based on `partners.credit.manage`. Unlike the list-based
  Contacts/Addresses/Notes tabs, `CommercialTab.tsx` is a single
  load-then-upsert form, since the underlying data is 1:1, not a list.

## Engineering rules adopted during FEATURE-002 (apply project-wide, not just to this feature)

- **Migration Safety Rule**: never use a Drop/Create migration when the
  affected table(s) hold production data. Prefer rename-shaped
  migrations. Drop/Create is acceptable only when the affected table(s)
  are confirmed empty via a direct row-count query immediately before
  applying — not assumed from "no feature was ever built here." See
  `docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md`'s "Engineering
  Rules Established During M1 Review" for the full rationale.
- **Permission cleanup governance**: removing obsolete permissions is
  IAM cleanup work, not a side effect of unrelated feature work. Future
  permission removals should be their own dedicated, reviewed change —
  not bundled silently inside a feature's migration/seed update — unless
  the permission has zero real-world grants/usage and the cleanup is
  trivially safe (as `customers.*`/`suppliers.*` was in M1).

FEATURE-002 (Business Partners) is **paused after Milestone 6**, not
abandoned — M7–M14 remain on the roadmap. Priority shifted to
FEATURE-003 to reach a usable Production MVP faster.

## FEATURE-003 — Quotation Engine (in progress; Milestones 1–2 done)

Read `docs/AI/FEATURES/FEATURE-003-QUOTATIONS/` (00_REQUIREMENTS →
01_ANALYSIS → 02_PLAN → 03_IMPLEMENT → 04_VERIFY) for full detail. The
single most important fact about this feature: **`Quotation`,
`QuotationItem`, `ReadyProduct`, `Service`, and `Attachment` already
existed from Phase 1** (schema-only, "API/UI in Phase 7") before this
feature started — M1 extends that schema, it does not replace it. Any
future work here (or on Orders/Work Orders, which share the same
Phase-1-schema-only status) must check for this pattern before assuming
a green field.

**Architecture notes for future milestones/features to know:**

- **Status transitions are service-layer-only** — `LEGAL_STATUS_TRANSITIONS`
  in `apps/api/src/services/quotationService.ts` is the one place
  `QuotationStatus` transition legality is decided. No route, controller,
  or frontend code duplicates this table. This is deliberate
  (VISION.md's Workflow Engine Architecture) — moving to a real,
  admin-configurable Workflow Engine later is a change to this one
  function's internals, not an API-contract or UI rewrite.
- **`QuotationApprovalState` is independent of `QuotationStatus`** — two
  separate enums, two separate dedicated endpoints
  (`PUT .../status`, `PUT .../approval`), never merged. Any future
  "internal gate before external action" pattern elsewhere in the system
  should follow this same two-field split, not overload the customer-
  facing status.
- **`QuotationItem.itemType` is a free string, not a Prisma enum** — new
  business lines (Marketing Service, Photography, Branding, ...)
  introduce a new value, zero migration. Matches the pre-existing
  `OrderItem.kind` pattern exactly; do not add a rigid enum here later
  without a real reason.
- **`QuotationItem.kind`/`modelName`/`breakdown` remain reserved for the
  future Pricing/Calculation Engine** (LEGACY_ANALYSIS §8) — unpopulated
  by M1, relaxed to nullable since the table held zero rows in any
  environment when M1 shipped. A future pricing milestone populates
  these; nothing else should write to them.
- **Versioning**: new version = new `Quotation` row,
  `previousVersionId` self-reference, `@unique` so the chain stays
  linear. Never overwrite a prior version's row.
- **Customer View / Internal View is one DTO, permission-shaped by
  value** (`mapQuotationToDto(record, canSeeInternal)`), not two
  response types — `canSeeInternal` is an explicit parameter the caller
  computes, so a future Customer Portal endpoint can call the identical
  function with `canSeeInternal: false`. Any future "different audiences,
  same object" feature should follow this exact shape (see VISION.md's
  Business Object Architecture).
- **Numbering reuses the existing `DocumentSequence` model** (Phase 1) —
  confirmed working for the first time this session
  (`nextQuotationNumber` in `quotationService.ts`, an atomic
  upsert-and-increment). Any future Order/Work Order numbering should
  use the identical mechanism, not a new one.
- **Known pre-existing gap, surfaced not fixed**: `GET /api/ready-products`
  and `GET /api/services` require `settings.view`, which SALES doesn't
  hold — SALES can still create quotations (CUSTOM items always work),
  just without the catalog-dropdown convenience. A future, dedicated
  permission review should decide whether to loosen this gate (same
  governance as the Permission Cleanup Governance rule above).

- **M2 — Order Conversion, done.** `POST /api/quotations/:id/convert`
  is the only entry point that creates an `Order` from a Quotation
  (`ACCEPTED → CONVERTED`, reusing M1's `assertLegalStatusTransition`
  unchanged — re-conversion is rejected for free, no separate check).
  Snapshot, never a live reference (ADR 0010): `Order`/`OrderItem` are
  populated from the Quotation's values at that instant, including
  catalog item *names* baked into `OrderItem.breakdown` so the Order
  stays readable even if the source Quotation/catalog entry changes
  later. `Order.staffId` is the Quotation's own rep, not whoever clicked
  Convert. First-ever Order application code
  (`apps/api/src/services/orderService.ts`,
  `apps/api/src/controllers/orders.ts`) — deliberately minimal, `GET
  /api/orders/:id` only, no list/create/edit/delete (that's a future,
  dedicated Order module). `Attachment.category` (additive, free
  string) was added as prep for a future upload feature. A real bug was
  found and fixed during live verification: the `201` conversion
  response initially returned `quotationOriginId: null` because
  `Order`'s reverse relation to `Quotation` was read *before* the
  Quotation's own `convertedOrderId` FK committed, inside the same
  transaction — fixed by re-fetching the Order after the Quotation
  update, both still inside one transaction. See ADR 0010 and
  `docs/AI/FEATURES/FEATURE-003-QUOTATIONS/0{0,1,2,3,4}_*.md`'s
  Milestone 2 sections for full detail.

Remaining business modules (Orders beyond M2's conversion-created read
path, Work Orders, Treasury, Inventory, Tenders, Reports, and the
pricing/calculation engine) have not been started yet.

## Safety Fix — last-active-administrator protection (done, extended)

See ADR 0028 (including its Extension section) for the full decision.
Summary: the system rejects any attempt to deactivate (`updateUser` with
`isActive: false`), delete (`deleteUser`), or role-strip (`setUserRoles`
removing every admin role) the last active holder of `ADMIN`/
`SUPER_ADMIN`, returning `409 { code: 'LAST_ACTIVE_ADMIN' }`. All logic
lives behind **`AdminSafetyService`**
(`apps/api/src/services/adminSafety.ts`) — the single, mandatory entry
point every current and future orphan-risk operation (Deactivate,
Delete, Remove Admin Role, and future Block/Archive) must call; never
re-implement the check. Called from all three affected controller
functions in `apps/api/src/controllers/users.ts` before any mutation
runs.

**Judgment call, stated explicitly**: "Administrator" is the combined
pool `{SUPER_ADMIN, ADMIN}`, not `ADMIN` alone — `ADMIN` holds
`employees.*` (full staff/role management within its branch) and losing
every active holder of either role is an equally real lockout. Explicitly
confirmed and re-stated as the intended scope on extension. There is no
separate "Block" concept on `StaffProfile`; `isActive: false` is the one
deactivation mechanism, so "Block" is covered by the same guard as
"Inactive," not a fourth invented field.

**Company Isolation seam (prep, not built)**: a private
`otherActiveAdminScopeWhere(current)` function inside `adminSafety.ts` is
the one place a future multi-company system (VISION.md's Scalability
axis) would add `{ companyId: current.companyId }` — returns `{}` today
(global count, single-tenant). No controller computes or passes a scope;
none will need to change when this seam is filled in.

**`SECURITY_REJECTION` audit entries**: `AdminSafetyService` itself (never
the calling controller) now records one `AuditLog` row —
`action: 'SECURITY_REJECTION'`, `newValue: { reason: 'LAST_ACTIVE_ADMIN',
operation }` — immediately before throwing, for every rejected attempt.
This is a deliberate departure from the earlier "rejected mutation,
nothing to audit" precedent (`IllegalStatusTransitionError` in
FEATURE-003 M1) — security-relevant rejections are worth recording even
though nothing changed, for future security reporting.

**Frontend UI protection (UX only, not enforcement)**: `ADMIN_ROLE_NAMES`
moved to `@cleopatra/shared` (re-exported from `adminSafety.ts` for
backend callers) so `apps/web/src/lib/adminSafety.ts`'s
`isLastActiveAdmin(user, allUsers)` uses the identical role pool,
computed client-side from the already-loaded user list. `UsersPage.tsx`
disables Deactivate, Delete, and any currently-checked admin-role
checkbox for whichever user this evaluates true for — the backend
re-validates independently and remains the sole source of truth.

**This is the first automated test suite in the repository.** `vitest`,
scoped to `apps/api` (`apps/api/vitest.config.ts`, `npm run test
--workspace=apps/api`). `adminSafety.test.ts` unit-tests the pure
`wouldOrphanAdministrators` decision table and `AdminSafetyService.
assertNotLastActiveAdmin` against a mocked `prisma`/`recordAudit` (13
tests, no live database — deterministic, and never touches a real
administrator account), including an explicit assertion that
`SECURITY_REJECTION` is recorded on rejection and never on success. Live
end-to-end verification was performed separately against the real dev
environment's sole administrator (`razein2345@gmail.com`): deactivate,
delete, and role-strip were each attempted directly against that account
and each was correctly rejected with `409 LAST_ACTIVE_ADMIN`, confirmed
via a follow-up `GET` that the account was left completely unchanged
after every attempt. The "allow" path (a second active admin exists) was
**not** live-tested by creating a second real account, because
`createUser` sends a real Supabase invite email — that path is covered by
the mocked unit tests instead, deliberately, to avoid sending mail during
verification.

## Row Level Security — Defense-in-Depth (done)

See ADR 0029 for the full decision. Triggered by Supabase's
`rls_disabled_in_public` linter finding; a live audit (not a theoretical
check) confirmed the real exposure first — using the frontend's public
`anon` key, direct `GET` requests against Supabase's auto-generated
PostgREST API (`{SUPABASE_URL}/rest/v1/<Table>`) returned full rows from
`StaffProfile`, `AuditLog`, `RolePermission`, and
`PartnerCommercialProfile`, completely bypassing the Express API and
RBAC. Every one of the 37 application tables (plus `_prisma_migrations`)
had RLS disabled and full `anon`/`authenticated` grants — Supabase's
default schema-level behavior, not something any feature work introduced.

**Fix**: every table now has RLS enabled with an identical, explicitly
named policy — `CREATE POLICY "backend_only_deny_direct_access" ON
"<table>" FOR ALL TO anon, authenticated USING (false)` — deliberately
explicit rather than relying on Postgres's implicit "RLS enabled + zero
policies = deny all" behavior, so the deny is visible in `pg_policies`
to any future auditor. No grants were touched (the policy alone blocks
access regardless of grants) and no allow policy exists anywhere.

**Zero backend/frontend code changes** — confirmed both by reasoning and
empirically. Prisma connects as the `postgres` role (`DATABASE_URL`) and
the admin Supabase client (`supabaseAdmin`) uses `service_role`
(`SUPABASE_SERVICE_ROLE_KEY`) — both carry `rolbypassrls = true` in
Postgres, independent of any RLS policy. Live-verified after the
migration: `GET /api/users` and `GET /api/quotations` through the real
running Express API both returned `200` with correct data, a fresh
`service_role` call (`supabaseAdmin.auth.admin.generateLink`) succeeded,
and the Partners page loaded real data end-to-end in the browser. The
same three previously-leaking anon-key requests were re-run and now
return `[]` instead of data.

**Migration is properly tracked**, not an ad-hoc `db execute` —
`prisma/migrations/20260805135821_security_foundation_rls_deny_policies/
migration.sql`, applied via `prisma migrate deploy`. Additive only
(`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`, no `DROP`, no data
change), reversible per table.

**RLS is Defense-in-Depth, never the authorization system** — ADR
0021/0022's service-layer RBAC and `AdminSafetyService` (ADR 0028) remain
the sole place authorization decisions are made; no policy here encodes
a business rule, every one is a flat deny for the two roles that should
never reach these tables. See VISION.md's Engineering Standards →
Database Security section for the standing rule this establishes for all
future tables: a new Prisma model does **not** automatically inherit RLS
protection — `ENABLE ROW LEVEL SECURITY` + the same deny policy must be
added explicitly each time, the same way a new business object needs its
own permission catalog entries.

**Known process gap, noted not fixed here**: two earlier schema changes
this session (M2's `Attachment.category` column, the `SECURITY_REJECTION`
enum value) were applied via ad-hoc `prisma db execute` without a tracked
migration folder — `prisma migrate status` currently still reports "up to
date" since the live DB matches `schema.prisma`, but a fresh environment
running `prisma migrate deploy` from scratch would not receive those two
specific changes from migration history alone. Worth backfilling migration
files for them at some point; out of scope for this task.

### Four follow-up refinements (done)

1. **`_prisma_migrations` is exempted from RLS**, by explicit direction —
   it's Prisma's own internal bookkeeping table, not an application table.
   A second, small tracked migration
   (`20260805142832_prisma_migrations_rls_exempt`) reverses just that one
   table's RLS + policy; all 37 application tables remain unaffected and
   protected (confirmed live: `37` tables with RLS enabled, `_prisma_migrations`
   confirmed `false`). Residual, accepted fact: the public `anon` key can
   once again see migration file names/timestamps — no business data.
2. **The RLS requirement is now mandatory, not a recommendation** —
   VISION.md's Database Security section states verbatim: every new
   application table MUST enable RLS and MUST receive the standard
   `backend_only_deny_direct_access` policy; no table is "complete"
   without it. (Also fixed a stale cross-reference there that still
   pointed at "ADR 0028's Defense-in-Depth extension" — that content
   lives in ADR 0029, written after that sentence was originally drafted.)
3. **MASTER_PROMPT.md gained a Database Checklist** — any feature that
   introduces a new table must finish it (Migration created / Soft Delete
   reviewed / Audit reviewed / Permissions reviewed / RLS enabled /
   `backend_only_deny_direct_access` created / Verification completed)
   before the Final Report, inserted between Step 7 (Verification) and
   Step 8 (Final Report).
4. **ADR 0030 (new, deliberately small)**: "Backend-only database access"
   — the mechanism-independent rule that business tables are never
   accessed directly by any frontend client, permanent regardless of
   future Customer Portal/Mobile/Website/AI/third-party integrations.
   Cross-linked from ADR 0029 and VISION.md's Database Security section.

## FEATURE-004 — Workflow Engine (in progress; Milestone 1 done)

**The current highest priority — explicitly ahead of the Pricing Engine.**
No new feature module starts before every production-facing module
(Production, Manufacturing, Marketing, Video, Design, Maintenance,
Service Requests, Customer Portal, Supplier Portal) can run on this
engine instead of inventing its own process logic. Full detail in
`docs/AI/FEATURES/FEATURE-004-WORKFLOW-ENGINE/`
(00_REQUIREMENTS → 01_ANALYSIS → 02_PLAN → 03_IMPLEMENT → 04_VERIFY).

**Critical finding from this feature's own analysis**: `WorkOrder`
existed since Phase 1 (schema-only, zero application code) with a
`productionStatus` field that was actually a hardcoded Offset/Digital
Printing pipeline baked into a Postgres enum — exactly what VISION.md's
Dynamic Workflow Engine forbids. Approved resolution: **deprecate, don't
remove** — `WorkOrder.productionStatus`/`WorkOrderProductionStatus` are
marked `/// @deprecated`, read/written by zero new code, and left in the
schema until a future cleanup milestone. `WorkOrder.workflowInstance` is
the real state from M1 forward. This kept the M1 migration purely
additive (no column/enum removal at all).

**Architecture notes for future milestones/modules to know:**

- **Workflow Templates are versioned exactly like Quotations** —
  `code` (stable across versions) + `version` + `previousVersionId`
  chain, `publishedAt` null = draft/editable, non-null = immutable. A
  running `WorkflowInstance.templateId` points at one exact version
  forever; publishing a new version never touches it — **verified live**,
  not just declared (two independently created `WorkOrder`s on two
  different published versions, running side by side correctly).
- **Stage routing is service-layer-only**, the same discipline as
  `quotationService.ts`'s `LEGAL_STATUS_TRANSITIONS` — a `WorkflowStage`'s
  own `nextStageId`/`failureStageId` is the only source of legal
  movement; `advanceWorkflowInstance` is the one place this is decided.
- **Workflow Variables** (`WorkflowStageVariable` definitions +
  `StageInstance.variableValues` JSON) are how business-line-specific
  data capture (e.g. Brass Plate's "Collect Customer Text") works without
  the engine ever growing a new column per business line — required
  variables block advancing past their stage, enforced live.
- **Workflow Events** (`WorkflowEvent`, append-only) are a deliberately
  separate concept from `AuditLog` — both are written for the same
  transition, but `WorkflowEvent` is the purpose-built feed future
  Timeline/Dashboard/Notifications/AI/Reporting consumers read, never
  `AuditLog`'s generic security/compliance rows. Any future feature
  wanting "what happened in this job's production" reads `WorkflowEvent`,
  not `AuditLog`.
- **Department is real, admin-manageable data** (11 seeded defaults),
  not a hardcoded enum — mirrors the `Branch`/`UserBranchAccess`
  "home + explicit grants" shape exactly
  (`StaffProfile.departmentId`/`UserDepartmentAccess`,
  `canAccessDepartment()` alongside `canAccessBranch()` in
  `authContext.ts`). Department answers "what kind of work," Branch
  answers "where" — deliberately independent axes, no
  Department-Branch relationship exists.
- **Queue metadata (priority, due date, delay) lives on `StageInstance`
  directly** — `isDelayed` is computed at read time from `dueDate`,
  **never stored** (a stale flag would need active maintenance this
  milestone doesn't build). `PUT .../current-stage` edits this plus
  External Supplier fields on the currently-open stage instance,
  deliberately separate from `.../advance` — it never writes a
  `WorkflowEvent` since it's metadata editing, not a state transition.
- **External Supplier stages reuse `BusinessPartner`** (a SUPPLIER-role
  partner) for `assignedSupplierId` — same reuse precedent as
  `SupplierPurchase`/`SupplierPayment`, not a parallel Supplier model.
- Remaining: Milestone 2 (frontend — template authoring, department
  queue view, instance timeline), Milestone 3 (SLA alerting, automation
  execution, Production Dashboard), and authoring the real production-
  line templates (Offset Printing, Digital Printing, Stamp, T-Shirt,
  Acrylic Sign, Brass Plate) as **data** through this milestone's API —
  none started.

## FEATURE-005 — ERP User Experience & Production Dashboard (in progress; Milestone 1 done)

A UX/application-structure feature, not a business feature — no schema,
API, or business-rule changes. Full detail in
`docs/AI/FEATURES/FEATURE-005-UX-PRODUCTION-DASHBOARD/`
(00_REQUIREMENTS → 01_ANALYSIS → 02_PLAN → 03_IMPLEMENT → 04_VERIFY).
Approved M1–M4 breakdown, with 5 refinements applied before M1 started:
a two-layer component library, a responsive/collapsible/multi-level-ready
App Shell, one approved-in-principle Dashboard aggregate endpoint
(`GET /api/workflow-instances/dashboard-summary`, built in M2), a
widget-based Dashboard from the start, and design tokens before any UI.

**Architecture notes for future milestones to know:**

- **Two-layer component library**: `src/components/ui/` (shadcn,
  generated via CLI, internal only) and `src/components/cleopatra/` (the
  Cleopatra Design System — composes shadcn into ERP-shaped components:
  `Sidebar`, `Topbar`, `CommandPalette`, `MobileNavDrawer`, `StatusBadge`
  so far). Application code imports from `cleopatra`, never `ui`,
  directly — M2+'s `WorkflowCard`/`DashboardWidget`/`CustomerCard`/
  `DepartmentQueue` follow the same pattern.
- **Design tokens** (`src/index.css`'s `@theme` block) are the only place
  color/spacing/typography/radius/shadow values live — every component
  references a token (`bg-primary`, `text-danger`, `shadow-md`), never a
  hardcoded value, so a future rebrand is a token edit.
- **Nav is data, not JSX** — `NavEntry` (`src/components/cleopatra/
  nav-types.ts`) is a recursive `NavLink | NavGroup` structure feeding
  both the Sidebar and the Command Palette from one source of truth.
  Nesting works today even though M1's actual nav is flat — a future
  Orders/Treasury/Reports group is new data, not a new component.
- **Global RTL is structural, not per-page**: `<html lang="ar" dir="rtl">`
  in `index.html` plus one global font (Cairo). The three pages that used
  to carry their own `dir="rtl"` wrapper (Settings route in `App.tsx`,
  `LoginPage`, `AcceptInvitePage`) had it removed — they inherit from
  `<html>` now, page content otherwise byte-for-byte unchanged. No text
  translation happened or is in scope for this feature.
- Remaining: Milestone 2 (Production Dashboard + Production Board, incl.
  the dashboard-summary endpoint), Milestone 3 (Smart Forms + Partner
  Profile rework, Side View host), Milestone 4 (search, keyboard
  shortcuts) — none started.

**Sprint 1 (UX Foundation) — done, pending manual live verification.**
Reorganizes pieces of the original M2/M4 milestone content under a sprint
framing — see `docs/AI/FEATURES/FEATURE-005-UX-PRODUCTION-DASHBOARD/
SPRINT-1-UX-FOUNDATION/`. Full Arabic localization of every screen this
sprint touches; Smart Search (`CommandPalette` extended to fan out to
`/api/partners`, `/api/quotations`, `/api/ready-products`, `/api/services`,
grouped, permission-gated, cmdk's own fuzzy filter — no new endpoint); a
real Dashboard (`useWorkflowQueueSummary` aggregates the existing
per-department queue endpoint across every accessible department
client-side, since no cross-department aggregate endpoint exists); and a
fully editable Printing Settings screen (`Setting`/`SheetType`/
`SizeFamily`+entries/`ReadyProduct`/`Service` — all already had CRUD
routes since Phase 1, M1's `SettingsPage.tsx` had only ever rendered them
read-only). Zero `apps/api`/`packages/shared` diff.

**Load-bearing correction made mid-implementation**: `SizeFamilyEntry`
has a `sortOrder` column, but it's only ever set once at creation
(`sizeFamilies.ts` controller, an append-via-count) —
`updateSizeFamilyEntrySchema` doesn't accept it, so no route actually
reorders entries. A field existing on a model is not the same claim as
the API exposing that capability; this was caught by reading the
controller, not assumed from the schema, and both Sprint 1 planning docs
were corrected in place before the UI was built (no reorder controls
shipped).

**Nine requested capabilities have no backing data source and were
scoped out rather than faked** (full list in Sprint 1's `01_ANALYSIS.md`
Critical Findings): Order list/Revenue/Cash/Inventory tracking don't
exist as modules at all — "Today's Orders," "Revenue," "Cash," "Inventory
Alerts," and Orders/Invoices/Machines search are blocked on those,
not on anything this sprint could fix within "no schema, no new API."

**Sprint 1 status: verified and closed** (live browser verification
completed against the real running app + real Supabase database — every
Dashboard number, Smart Search result, and Settings CRUD write was
cross-checked against a direct authenticated API call, not just visual
inspection). Two real layout bugs were found and fixed during that pass
— both are exactly the kind of thing static checks (typecheck/lint/grep)
cannot catch:

1. `DashboardWidget`'s icon rendered stacked above the label instead of
   beside it — `Card`'s base class ships `flex-col`, and the override
   only added `items-center`/`gap-4` with no `flex-direction` utility for
   `tailwind-merge` to cancel it against. Fixed with `flex-row`.
2. Table header cells (`<th>`) never actually respected the RTL
   alignment fix — `text-start` was placed on the `<tr>`, but `<th>` has
   its own UA-stylesheet default (`text-align: center`) that wins over
   an *inherited* value regardless of ancestor specificity. This was a
   **latent bug predating Sprint 1 entirely** (the original `text-left`
   never worked on headers either) — not a regression. Fixed by moving
   alignment onto each `<th>` directly via Tailwind's `*:` child variant,
   across all 8 affected table-header files.

**Refinement pass (post-review, pre-Sprint-2)** — full rationale in
`SPRINT-1-UX-FOUNDATION/REFINEMENTS.md`. Three registry/provider
architectures any future FEATURE-005 work should extend, not
route around:

- **Search**: `src/lib/search/` — `SearchProvider { id, groupLabel,
  permission?, fetch() }`, registered in `providers/index.ts`.
  `CommandPalette.tsx` is a generic renderer over this list; it never
  changes for a new searchable entity.
- **Dashboard**: `src/lib/dashboard/` — `DashboardWidgetDefinition {
  id, permission?, Component }` in `registry.ts`'s `DASHBOARD_WIDGETS`;
  shared data sources (e.g. the per-department queue fan-out) go through
  a React context in `providers/`, listed in `DASHBOARD_DATA_PROVIDERS`,
  so multiple widgets reading the same source don't each fetch
  independently. `DashboardPage.tsx` only filters by permission and
  renders — no widget logic lives there.
- **Settings**: `src/pages/settings/categories.ts` — `SETTINGS_CATEGORIES`
  maps category id → screen component. `/settings` is a picker,
  `/settings/:categoryId` renders one. A category with no real screen
  yet (Library, Workflow, AI & Advisor) simply isn't registered — same
  discipline as Search/Dashboard, no placeholder pages.

RTL audit also landed: physical-direction Tailwind classes
(`text-left`/`right`, `ml-`/`mr-`/`pl-`/`pr-`, `left-`/`right-`)
converted to logical properties app-wide. Two exception classes were
identified and deliberately left physical: `dir="ltr"` input fields in
Login/Accept-Invite (email/password boxes), and Radix's own
`data-[side=...]` runtime-placement classes.

**Sprint 2 (Production Dashboard & Production Board) — verified and
closed.** Full detail in `SPRINT-2-PRODUCTION-DASHBOARD-BOARD/`. One new
backend endpoint, `GET /api/workflow-instances/dashboard-summary`
(`work-orders.view`-gated, department-scoped via a new
`accessibleDepartmentScope()` helper in `authContext.ts` that mirrors
`canAccessDepartment`'s bypass rule as a scope instead of a per-call
check) — waiting/in-progress/delayed/active-work-order totals plus
by-department, by-operator, and supplier-delay breakdowns and today's
completed-stage count, all from one query pass reusing
`computeIsDelayed`. `/production-board` is the first real screen over
the Workflow Engine (FEATURE-004 M1 was verified entirely via direct
HTTP calls until now) — department switcher, queue table, and working
Complete/Fail/Skip/Edit actions against the existing `advance`/
`current-stage` endpoints. `WorkflowQueueSummaryProvider` now calls the
new endpoint once instead of Sprint 1's N-department client-side
fan-out (Dashboard network calls: 12 → 1); five new widgets complete
VISION.md's full seven-representative-view Production Dashboard.
`DashboardWidgetDefinition` gained an optional `span?: 'sm'|'lg'` layout
hint for widgets wider than a single number — `DashboardPage.tsx` still
contains no widget-specific knowledge, only a generic, data-driven
layout rule. No schema change, no `VISION.md` change. **Known gap,
named rather than assumed away**: Production Board's stage actions were
verified by code/endpoint review, not end-to-end against a real
in-flight `WorkflowInstance` — this environment has none.

**Sprint 2.5 (Production Readiness) — verified and closed.** Followed a
Production Readiness Review (`PRODUCTION_READINESS_REVIEW.md`, feature
root) written from a printing-business-owner perspective; implements its
highest-value Quick Wins + Sprint 2.5 findings. Full detail in
`SPRINT-2.5-PRODUCTION-READINESS/`. Two small additive backend fields
(`customerName` on queue rows via `WorkOrder → Order → BusinessPartner`;
`failedToday` on `dashboard-summary`, same pattern as
`dailyProductionCount` against `WorkflowEvent`) — no migration. Production
Board gained due-date/time-in-stage/customer columns, delayed/urgent row
tinting, a client-side filter bar (priority/delayed/search) that narrows
without re-sorting the server's existing priority→dueDate→age order, a
real mobile card layout (no horizontal scroll), a confirmation step before
Fail/Skip, and manual refresh. A new read-only Work Order timeline
(`/production-board/timeline/:workflowInstanceId`) reuses the existing,
unchanged `GET /workflow-instances/:id` — the first frontend consumer of
an endpoint that's existed since FEATURE-004 M1; per `01_ANALYSIS.md`,
that endpoint has never been department-scoped (only the per-department
queue is), which the timeline now makes visible rather than changes. The
sidebar's delayed-count badge (`NavLink.badgeCount`, rendered in
`NavTree.tsx`) is deliberately a second, independent `dashboard-summary`
fetch (`AppShell.tsx`'s `useDelayedJobsBadge`) rather than lifting
`WorkflowQueueSummaryProvider` out of `DashboardPage` — same precedent as
`Topbar.tsx`'s own independent branch fetch. Only the Jobs by Department
Dashboard widget was made clickable into a pre-filtered Production Board
(`?department=<id>`); Delayed Jobs and Jobs by Operator were deliberately
left non-clickable — both are cross-department aggregates a
per-department queue view can't represent without landing on a
potentially misleading arbitrary department, and this was raised with the
user mid-implementation rather than guessed at. No job/item description
beyond customer name — nothing approximated from `OrderItem`. Same
known-empty-environment verification caveat as Sprint 2: stage-action-
dependent UI (row tinting, Fail/Skip confirmation, nonzero badge, a
populated timeline) is code-reviewed and static-checked but not exercised
against real non-zero data.

## Known gaps (as of the FEATURE-001-IAM audit; updated after FEATURE-001.2)

- **Admin `StaffProfile` found deactivated with a stale `supabaseUserId`**
  (discovered during FEATURE-003 M1 live verification, not caused by
  it): `razein2345@gmail.com`'s `StaffProfile` had `isActive: false` and
  a `supabaseUserId` that no longer matched the Supabase Auth user
  actually returned for that email by `generateLink` — login would have
  failed for this account entirely. Both were corrected directly
  (`isActive` restored to `true`; `supabaseUserId` realigned to the
  current real Supabase Auth user id). Neither the cause nor the timing
  is known — if this recurs, it's worth checking whether some flow in
  this codebase can flip a StaffProfile's `isActive` or drift its
  `supabaseUserId` unexpectedly; nothing currently known points to a
  specific culprit.
- ~~No frontend route exists to complete a Supabase invite or
  password-recovery flow~~ — **closed by FEATURE-001.2, and field-verified
  against a real Supabase-issued invite link** (genuine
  `generateLink`/`inviteUserByEmail`-equivalent token, a disposable test
  `StaffProfile`, real callback, real `otp_expired` error on reuse — see
  `docs/AI/FEATURES/FEATURE-001-IAM/04_VERIFY.md`). Confirmed working:
  callback detection (both implicit and PKCE code paths), the `expired`/
  `no-context` error states, and — critically — that the session Supabase
  establishes at invite-click time already flows correctly through
  `requireAuth` → `/api/auth/me` → RBAC → branch-scoped nav filtering.
  **Not verified**: the literal "type a password and submit" action and
  the resulting `success` state (this session does not type passwords
  into any form field, even for disposable test accounts) — recommend a
  human complete that one click to close the loop.
- Two **pre-existing** (not caused by FEATURE-001.2) issues were found
  during this field verification, neither fixed (out of that task's
  scope):
  - `apps/api/src/services/userService.ts`'s `mapStaffToUser()` omits the
    user's home branch from the `accessibleBranchIds` it returns to the
    frontend (only includes explicit `UserBranchAccess` grants) — unlike
    `authContext.ts`'s `loadAuthContext()`, which correctly includes both.
    Real authorization is unaffected (`canAccessBranch()` uses the
    correct source), but any UI trusting this DTO field would
    undercount accessible branches.
  - `apps/web/src/state/AuthContext.tsx`'s `signOut()` is fire-and-forget;
    navigating away immediately after clicking "Sign out" can outrace its
    async cleanup, leaving a stale Supabase session in `localStorage`.
    Reproduced directly during this verification.
  - **Update**: both issues have fixes implemented under
    FEATURE-001.4 (`docs/AI/FEATURES/FEATURE-001-IAM/FEATURE-001.4/`),
    each in its own separate worktree/branch
    (`claude/musing-ardinghelli-442f94` for the `signOut()` fix,
    `claude/silly-goldstine-315a52` for the `accessibleBranchIds` fix).
    Both independently pass build/typecheck/lint. **Not yet merged to
    `main`, not yet live-retested** — see FEATURE-001.4's `04_VERIFY.md`
    for exact status. The `signOut()` fix also introduced the
    architectural decision recorded below.
- No seed step or self-service path creates the first `StaffProfile`.
  `apps/api/prisma/seed.ts` never touches `StaffProfile`. The first
  account in this environment was created via a one-off manual script,
  not a repeatable setup step.
- Three files are currently modified but uncommitted in the working tree:
  `apps/web/src/lib/supabase.ts` (contains two leftover debug
  `console.log` lines that must be removed before committing),
  `apps/web/src/pages/login/LoginPage.tsx`, and
  `apps/web/src/state/AuthContext.tsx` (a working phone-or-email login
  field).
- `apps/web/apps/api/...` is a stray, empty, untracked directory tree
  (no files, just nested folders) sitting inside `apps/web/` — harmless,
  never committed (git doesn't track empty directories), but unexplained
  clutter worth removing eventually.
- No automated tests exist yet for any part of the system.

## Architectural decisions

### Authentication cleanup must never depend on network requests

**Decision**: Authentication cleanup must never depend on network
requests.

**Reason**: Authentication cleanup is security-critical. Audit logging is
best-effort and must not block local session cleanup.

**Implementation**: Local Supabase sign-out happens immediately. Audit
logging uses a best-effort keepalive request.

Concretely (`apps/web/src/state/AuthContext.tsx`'s `signOut()`, fixed
under FEATURE-001.4): the access token is captured first, then
`supabase.auth.signOut({ scope: 'local' })` clears the local session with
no awaited network call — this cannot be interrupted by navigation the
way an awaited `fetch` can. Only afterward is the `LOGOUT` audit entry
sent, via `apiPostBeacon()` (`apps/web/src/lib/api.ts`), a
`fetch(..., { keepalive: true })` call that isn't awaited and is allowed
to outlive the page if the user navigates away — the browser platform's
standard mechanism for exactly this "must survive unload" requirement.

This reverses the previous ordering (which awaited the backend logout
call *before* clearing the local session, specifically so the request
would still have a valid token) without losing the audit trail: the
token remains valid for the beacon request even after local `signOut()`
runs, because `scope: 'local'` only removes the browser's copy — it
doesn't revoke the token server-side.

**Applies to**: any future auth-adjacent cleanup work (e.g. session
invalidation on account deactivation, forced logout) should follow the
same shape — the user-facing state change must complete with no network
dependency; anything that needs the backend (audit, revocation) is
best-effort and fired after, not gating.

Background: found and fixed as part of FEATURE-001.4
(`docs/AI/FEATURES/FEATURE-001-IAM/FEATURE-001.4/`), itself triggered by
a real bug found during FEATURE-001.2's field verification (a stale
session surviving a sign-out interrupted by navigation).

### "Exactly one flagged row per group" needs two layers: a partial unique index and a row lock

**Decision**: Any "exactly one X per group" invariant (one primary
contact per partner, one default address per partner+type, and any
similar future rule) must be enforced by **both** a database-level
partial unique index **and** an application-level row lock around the
write — neither alone is sufficient, and they are not redundant with
each other.

**Reason**: An array-form `prisma.$transaction([updateMany, update])`
("unset all flagged rows, then flag one") looks atomic but is not
concurrency-safe under Postgres READ COMMITTED. A blocked-then-resumed
`UPDATE ... WHERE` only re-checks the specific row it was blocked on
against newly-committed data — it does not re-scan the table for rows
that newly match. Two concurrent requests targeting *different* rows in
the same group (e.g. two different contacts on the same partner) can
each observe "no flagged row yet" and each successfully flag a different
row, with neither transaction ever conflicting with the other at the
statement level. A DB unique index alone would catch this only if it
existed and the transaction happened to hit it; an application lock
alone gives correctness only within the application, not against direct
DB access or a future code path that bypasses the lock.

**Implementation**: 
1. A Postgres partial (filtered) unique index expressed in Prisma via
   the `partialIndexes` preview feature (`schema.prisma`'s generator
   block: `previewFeatures = ["partialIndexes"]`), letting
   `@@unique([...], where: {...})` compile to a native
   `CREATE UNIQUE INDEX ... WHERE (...)`. This is the backstop — it
   guarantees the invariant even against bugs, future code, or direct
   database access, independent of any application logic.
2. An *interactive* Prisma transaction
   (`prisma.$transaction(async (tx) => {...})`, not the array form) that
   opens with `SELECT id FROM "<ParentTable>" WHERE id = $1 FOR UPDATE`
   on the parent/group-defining row, before the unset-then-set writes.
   This forces all concurrent "change the flagged row" requests for the
   same group to fully serialize, giving a clean, race-free happy path.
   A `P2002` catch around the transaction translates any conflict that
   still somehow reaches the unique index into a clean `409`, rather
   than a raw 500.

Confirmed via live testing (not just reasoned about): firing several
concurrent `setDefault`/`setPrimary` requests targeting different rows
in the same group, then confirming via a direct list query that exactly
one ended up flagged, with no double-flagged state. See
`docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md`'s "M2
Hardening" and M3 "As Implemented" sections for the specific
before/after and verification detail.

**Reusable implementation** (extracted during the post-M3 engineering
review, before M4): both layers' write-path logic now live in
`apps/api/src/services/partnerChildEntity.ts` —
`setExclusiveDefault({ partnerId, unsetOthers, setTarget })` owns the
row lock + interactive transaction + `P2002` → conflict-error
translation; `canBeDefault(entity)` is the shared inactive-rejection
predicate; `loadPartnerOr404` is the shared parent-lookup used by every
partner-scoped child entity. `ContactPerson`/`setPrimaryContactPerson`
and `PartnerAddress`/`setDefaultPartnerAddress` both now call this
module rather than each having their own copy of the lock/transaction
code (they did, briefly, immediately after M3 shipped — the review
caught and removed that duplication before M4 began).

**Applies to**: `ContactPerson.isPrimary` (M2) and
`PartnerAddress.isDefault` (M3) today; any future "exactly one X per
group" rule (e.g. a future default price tier, default payment method,
primary document version) **must** build on `partnerChildEntity.ts`'s
`setExclusiveDefault`/`canBeDefault`/`loadPartnerOr404` rather than
reimplementing the pattern — this is now the standing convention, not
merely a suggestion.

**Does NOT apply to**: `PartnerTag` assignment (M4) or
`PartnerNote.isPinned` (M5) — both were deliberately built as plain,
lock-free writes, because neither is an "exactly one per group"
invariant (unlimited tags may be assigned at once; unlimited notes may
be pinned at once). Reusing `setExclusiveDefault` for either would have
been a misapplication of the pattern. Recognizing when a flag is *not*
exclusivity is as important as reusing the pattern when it is.

## Environment notes

- Windows/PowerShell dev environment; Node and npm are not reliably on
  `PATH` in fresh shells — prefix commands with the Node install
  directory (`C:\Program Files\nodejs`) when a command isn't found.
- Dev servers: API on port 4000 (`npm run dev --workspace=apps/api`), web
  on port 5173 (`npm run dev --workspace=apps/web`). `.claude/launch.json`
  has both configured for the Browser-pane preview tool.
- Real Supabase project credentials live in `apps/api/.env` /
  `apps/web/.env` (gitignored) — never echoed in chat, never asked for
  again once confirmed present.

## Documentation structure

- `docs/AI/HANDBOOK/` — engineering rules. Only
  `02_DATABASE_RULES.md` currently has content; all other numbered
  handbook files are empty scaffolding.
- `docs/AI/FEATURES/FEATURE-00N-<name>/` — per-feature
  README/analysis/plan/implement/verify docs. `FEATURE-001-IAM` is the
  first, created retroactively for the already-implemented IAM feature.
- Root-level `ARCHITECTURE.md`, `API_CONVENTIONS.md`, `CODING_STANDARDS.md`,
  `CONTRIBUTING.md`, `MIGRATION_PLAN.md`, `LEGACY_ANALYSIS.md`,
  `LEGACY_MAPPING.md`, and `adr/` (27 ADRs) predate the `docs/AI/`
  structure and remain the authoritative source for architecture/decision
  history — `docs/AI/` does not replace them.
