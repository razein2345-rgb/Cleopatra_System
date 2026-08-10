# FEATURE-002 — Business Partners — Execution Roadmap

> This document converts the implementation blueprint (`02_PLAN.md`)
> into an execution roadmap of small, independent, vertical-slice
> milestones. Each milestone cuts through every layer — Backend,
> Frontend, Validation, Permissions, Audit Logging, Documentation, and
> Testing — for a thin but complete, deployable, verifiable piece of the
> feature, rather than building one layer at a time across the whole
> domain. No code, schema, or API contract is specified here — only what
> each milestone must deliver and how it will be verified.
>
> `02_PLAN.md`'s ten conceptual phases are expanded here into fourteen
> milestones, splitting anything that bundled more than one
> independently-deployable capability (e.g. Categories/Tags/Notes;
> Tax/Documents; Duplicate Detection/Merge/Import), consistent with the
> instruction to keep each milestone small.

## Engineering Rules Established During M1 Review

Two standing rules, adopted after M1's implementation was reviewed, that
apply to every milestone from M2 onward (and to any future feature that
touches migrations or permissions).

### Migration Safety Rule

M1 replaced the empty, unused `Customer`/`Supplier` placeholder tables
with `BusinessPartner` via a Drop/Create migration (`DROP TABLE
"Customer"` / `DROP TABLE "Supplier"`, followed by `CREATE TABLE
"BusinessPartner"`). This was safe **only** because both tables were
verified empirically to hold zero rows before the migration was applied
— confirmed by direct row-count queries, not assumed. Going forward:

- **Future migrations must never use Drop/Create when production data
  exists** in the affected table(s).
- **Prefer Rename migrations** (`ALTER TABLE ... RENAME`,
  `ALTER TYPE ... RENAME`, Prisma's `@@map`/`@map` where a rename is all
  that's needed) whenever a table or column is being renamed rather than
  structurally redesigned.
- **Drop/Create is acceptable only when the affected table(s) are
  confirmed empty** — confirmed the same way M1 did it: an explicit row
  count against the live database immediately before the migration is
  applied, not an assumption based on "no feature was ever built here."

This is now a permanent engineering rule for this project, not specific
to FEATURE-002.

### Permission Cleanup Governance

M1 also removed the obsolete `customers.*`/`suppliers.*` permission
catalog entries (and their now-meaningless `RolePermission` grants)
directly inside its own migration/seed work, because nothing had ever
been built against them and the feature that made them obsolete
(FEATURE-002 itself) was the one doing the cleanup — a one-time
bootstrapping case, not a pattern to repeat casually.

**Removing obsolete permissions is IAM cleanup work, not a side effect
of feature implementation.** From here on:

- Future permission removals must be handled through **dedicated
  cleanup migrations**, scoped and reviewed on their own, not performed
  silently inside an unrelated feature's implementation.
- A feature that makes a permission obsolete should **propose** the
  cleanup (documented, like this note) rather than **execute** it as
  part of its own delivery, unless — as with M1 — the permission being
  removed has zero real-world grants/usage and the cleanup is trivially
  safe.

No code change accompanies this rule — it governs future work, not a
correction to what M1 already did.

---

## Roadmap Overview

| # | Milestone | Depends On | Complexity |
|---|---|---|---|
| M1 | Core Partner Record | — | Medium |
| M2 | Contact Persons | M1 | Small |
| M3 | Addresses | M1 | Small |
| M4 | Categories & Tags | M1 | Small |
| M5 | Notes | M1 | Small |
| M6 | Commercial & Credit Profile | M1 | Medium |
| M7 | Tax & Compliance Information | M1 | Small |
| M8 | Documents & Attachments | M1 | Medium |
| M9 | Search & Filtering | M1–M8 | Medium |
| M10 | Export | M9 | Small |
| M11 | Duplicate Detection | M1 (benefits from M3) | Large |
| M12 | Merge Workflow | M11 (benefits from M2/M3/M5/M8) | Large |
| M13 | Import Workflow | M11, M12 | Large |
| M14 | Integration Enablement | M1–M13 substantially complete | Small |

---

## M1 — Core Partner Record

**Goal:** Establish the foundational Business Partner record so staff can
create, view, edit, and list partners — the minimum on which every other
milestone builds.

**Scope:** Identity (Arabic and English name, short/display name), one
or more Partner Roles, lifecycle status, branch association, assigned
sales representative (a reference to the existing Staff/IAM domain), and
a minimal partner-level primary contact method.

**Included functionality:** Create, view, edit, list; role assignment;
status transitions, including the business rule that a partner cannot be
marked Active without at least one valid contact method
(`00_REQUIREMENTS.md` §28); soft deactivation.

**Out of scope:** Contact Persons (M2), Addresses (M3), Categories/Tags
(M4), Notes (M5), Commercial/Credit (M6), Tax (M7), Documents (M8),
Search/Filtering beyond a basic list (M9), Export (M10), Duplicate
Detection (M11), Merge (M12), Import (M13).

**Dependencies:** None beyond the existing IAM/Branch foundation already
delivered under FEATURE-001.

**Vertical slice coverage:**
- **Backend:** partner create/read/update/list capability; status-
  transition rule enforcement.
- **Frontend:** Quick-Add creation flow, Partner Profile Overview
  section, Directory list screen.
- **Validation:** required-information checks (§4); status-transition
  rule (§28).
- **Permissions:** `partners.view`, `partners.create`, `partners.edit`,
  `partners.delete` enforced on every corresponding action.
- **Audit Logging:** creation, edits, status changes, and deactivation
  all logged, attributable.
- **Documentation:** internal note on required-information and status
  meaning; user-facing guidance for staff on the Quick-Add flow.
- **Testing:** manual verification of create/edit/list/status-transition
  paths and permission-denial paths.

**Verification checklist:**
- [ ] A partner can be created with the minimum required information.
- [ ] A partner cannot be marked Active without a valid contact method.
- [ ] A newly created partner appears in the Directory list.
- [ ] Edits persist and are audit-logged.
- [ ] A user without `partners.create` cannot create a partner.
- [ ] A user without `partners.view` cannot see the list or profile.
- [ ] Deactivation is soft — the record remains, marked inactive.

**Estimated complexity:** Medium.

---

## M2 — Contact Persons

**Goal:** Deliver Contact Persons as a first-class capability, per the
Approved architectural decision, so organizational partners can have
multiple named, accountable contacts.

**Scope:** Add, edit, and remove Contact Persons under an existing
partner; the approved field set (name, job title, phone, mobile,
WhatsApp, email, preferred contact method, approval authorities, notes);
primary-contact designation.

**Included functionality:** Contact CRUD scoped to a partner; marking
one contact as primary; recording approval-authority flags (e.g. can
approve a print proof, can approve payment) as business-meaningful
attributes.

**Out of scope:** Contact-level portal login/identity (future);
contact-level duplicate detection (covered under M11).

**Dependencies:** M1 — a partner must exist before a contact can be
attached to it.

**Vertical slice coverage:**
- **Backend:** contact CRUD scoped to a parent partner.
- **Frontend:** Contacts section within the Partner Profile.
- **Validation:** a contact requires a name and at least one contact
  method; only one contact per partner may be marked primary at a time.
- **Permissions:** `partners.contacts.manage`.
- **Audit Logging:** add/edit/remove logged against the owning partner.
- **Documentation:** guidance on what each approval-authority flag means
  operationally.
- **Testing:** add/edit/remove a contact, switch the primary
  designation, confirm permission-denial for unauthorized users.

**Verification checklist:**
- [x] A partner can have multiple contacts.
- [x] Exactly one contact can be primary at a time.
- [x] Approval-authority flags are recorded and editable.
- [x] A user without `partners.contacts.manage` cannot add/edit/remove a
      contact (enforced by the same `requirePermission` middleware as
      every other module — not independently re-tested with a
      non-privileged account this session; see `04_VERIFY.md`).
- [x] Contact changes are audit-logged.

**Estimated complexity:** Small. **Actual: as estimated.**

### As Implemented

- Field set matches the requested list exactly, plus `department`
  (requested) and a `notes` field, split from the M1-approved field list
  into: `fullName`, `jobTitle`, `department`, `mobile`, `phone`,
  `whatsapp`, `email`, `preferredContactMethod` (nullable enum —
  "unspecified" is a valid, distinct state), `isPrimary`,
  `canApproveQuotations`, `canApproveWorkOrders`,
  `canApproveFinancialDocuments`, `notes`, `isActive`.
- `isActive` (business toggle) is kept distinct from `isDeleted`
  (soft-delete lifecycle) — same split as `StaffProfile`.
- **`isPrimary` is deliberately excluded from create/update** — the only
  way to become primary is a dedicated `PUT
  .../contacts/:contactId/primary` endpoint, which atomically unsets any
  other primary contact for the same partner in one transaction. This
  keeps the exclusivity guarantee in one place instead of duplicating it
  across every write path that could theoretically touch `isPrimary`.
- **Deactivating the current primary contact automatically clears
  `isPrimary`** in the same update (not a separate request) — enforces
  "inactive contacts cannot be primary" as an invariant, not just an
  entry-point check. The audit entry for that update records the
  automatic clear explicitly.
- Attempting to set an inactive contact as primary is rejected
  server-side with `400 INACTIVE_CANNOT_BE_PRIMARY` — verified to reject
  even when called directly (bypassing the UI, which also hides the
  "Make Primary" action for inactive contacts as a client-side
  convenience, not the enforcement point).
- Audit actions used: `CREATE`, `UPDATE`, `STATUS_CHANGE` (existing
  enum values, disambiguated by `entityType: 'ContactPerson'`) plus one
  new enum value, `PRIMARY_CHANGED`, added specifically because "who is
  primary" is a relationship/exclusivity change distinct from a generic
  status toggle. The requested `CREATE_CONTACT`/`UPDATE_CONTACT`/
  `DELETE_CONTACT`/`STATUS_CHANGED` names were intentionally *not* added
  as separate enum values — `entityType` already disambiguates "what
  kind of thing changed," so per-entity action-name variants would
  duplicate that information and wouldn't scale to future entities.
- Routes nested under the owning partner
  (`/api/partners/:partnerId/contacts[...]`), mirroring the existing
  `/api/users/:id/roles` sub-resource pattern rather than a flat
  `/api/contacts/:id`.
- Permissions used exactly as specified: `partners.view` (list) and
  `partners.contacts.manage` (create/update/delete/set-primary) — no new
  permission name introduced. `ADMIN` and `SALES` already hold
  `partners.contacts.manage` automatically via their existing
  `partners.*` wildcard grant; no seed data changes were needed.
- Frontend: the Partner Profile gained its first tab bar (Overview /
  Contacts), replacing the M1 placeholder comment that said this would
  happen "when [a second section] does."

### M2 Hardening (Post-Approval Review, before M3)

M2 was reviewed and Approved, then hardened with three architectural
improvements before M3 began — applied to both M2 (Contact Persons) and
carried forward into M3 (Addresses) from the start, since both share the
same "exactly one flagged row per group" shape.

1. **Database-level uniqueness, not just service logic.** Prisma 7's
   `partialIndexes` preview feature (enabled in `schema.prisma`'s
   generator block) allows `@@unique([...], where: {...})`, which
   compiles to a native Postgres partial unique index. Added
   `@@unique([partnerId], where: { isPrimary: true, isDeleted: false })`
   on `ContactPerson`. Confirmed empirically — not assumed — via a
   throwaway test model before touching the real schema: attempted the
   syntax without the preview flag (got Prisma's own error naming the
   required flag), enabled it, then confirmed with `prisma migrate diff`
   that the generated SQL was a correct `CREATE UNIQUE INDEX ... WHERE
   (...)` statement. The test model was deleted before the real change
   was made.
2. **Concurrency-safe Set Primary.** The original `setPrimaryContactPerson`
   used an array-form `prisma.$transaction([updateMany, update])`. Under
   Postgres READ COMMITTED, this has a genuine race: a blocked-then-
   resumed `UPDATE ... WHERE` only re-checks the specific row it was
   already blocked on — it does not re-scan the table for rows that
   newly match after the blocking transaction commits. Two concurrent
   "set primary" requests targeting *different* contacts on the *same*
   partner could each observe "no current primary," and each could
   successfully set a different contact primary, producing two primaries
   despite the array-transaction. Fixed by switching to an *interactive*
   transaction (`prisma.$transaction(async (tx) => {...})`) that first
   takes `SELECT id FROM "BusinessPartner" WHERE id = $1 FOR UPDATE`
   inside the transaction, locking the parent partner row and forcing
   all concurrent "set primary" requests for that partner to fully
   serialize. The DB partial unique index from (1) remains as an
   independent backstop — a `P2002` catch translates any conflict that
   somehow still reaches the constraint into a clean `409
   PRIMARY_CONTACT_CONFLICT` rather than a raw 500. **The lock is
   necessary and sufficient on its own for correctness; the index is
   defense-in-depth, not a substitute for it** — a lock-only fix without
   the index would still be correct under normal application traffic but
   would leave no protection against a future code path that writes
   `isPrimary` without going through this transaction, or against direct
   database access.
3. **Service-layer ordering.** `listContactPersons` previously ordered
   inline in the controller
   (`orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }]`, with no
   active/inactive tiering). Moved to an exported `CONTACT_ORDER_BY`
   constant in `contactPersonService.ts`:
   `[{ isPrimary: 'desc' }, { isActive: 'desc' }, { fullName: 'asc' }]`
   — Primary first, then Active before Inactive, then alphabetical. Any
   future consumer of contact lists (not just this one controller
   method) gets the same canonical order automatically.

The identical pattern (partial unique index + `FOR UPDATE` row lock +
service-layer ordering constant) is applied to `PartnerAddress`/
`setDefaultPartnerAddress` in M3 below, rather than treated as a
one-off fix specific to contacts.

---

## M3 — Addresses

**Goal:** Allow a partner to hold multiple labeled addresses for
different purposes.

**Scope:** Add, edit, and remove addresses; purpose/label (billing,
delivery, registered, site); default-per-purpose designation; delivery
instructions.

**Included functionality:** Address CRUD scoped to a partner;
default-address designation per purpose.

**Out of scope:** Map/GPS integration (a future enhancement, not core);
address-based duplicate matching (covered under M11).

**Dependencies:** M1.

**Vertical slice coverage:**
- **Backend:** address CRUD scoped to a partner.
- **Frontend:** Addresses section within the Partner Profile.
- **Validation:** a label and address text are required; only one
  default address per purpose.
- **Permissions:** `partners.addresses.manage`.
- **Audit Logging:** address changes logged.
- **Documentation:** guidance on the standard address-purpose labels.
- **Testing:** add/edit/remove, switch default, permission-denial.

**Verification checklist:**
- [x] A partner can hold multiple addresses with distinct purposes.
- [x] Only one default address exists per purpose at a time.
- [x] A user without `partners.addresses.manage` cannot modify addresses
      (enforced by the same `requirePermission` middleware as every other
      module — not independently re-tested with a non-privileged account
      this session; see `04_VERIFY.md`).
- [x] Address changes are audit-logged.

**Estimated complexity:** Small. **Actual: as estimated.**

### As Implemented

- Field set matches the requested list exactly: `name`, `type`
  (`AddressType` enum — `BILLING`, `SHIPPING`, `OFFICE`, `FACTORY`,
  `BRANCH`, `WAREHOUSE`, `REGISTERED`, `OTHER`), `country`,
  `governorate`, `city`, `district`, `street`, `building`, `floor`,
  `apartment`, `postalCode`, `googleMapsUrl`, `latitude`, `longitude`,
  `notes`, `isDefault`, `isActive`. **Note:** `02_PLAN.md`'s original M3
  scope listed "Map/GPS integration" as a future enhancement, out of
  scope for this milestone — the current, more specific milestone
  request explicitly asked for `googleMapsUrl`/`latitude`/`longitude` as
  M3 fields, so they are included here; this supersedes that line in
  `02_PLAN.md` for this milestone.
- `isActive` (business toggle) kept distinct from `isDeleted`
  (soft-delete lifecycle) — same split as `ContactPerson`/`StaffProfile`.
- **`isDefault` is deliberately excluded from create/update** — the only
  way to become default is a dedicated `PUT
  .../addresses/:addressId/default` endpoint, which atomically unsets any
  other default address of the same `type` for the same partner. Same
  pattern as M2's `isPrimary` exclusion, generalized from "one primary
  contact per partner" to "one default address per (partner, type)."
- **Deactivating the current default address automatically clears
  `isDefault`** in the same update — enforces "inactive addresses cannot
  be default" as an invariant, not just an entry-point check.
- Attempting to set an inactive address as default is rejected
  server-side with `400 INACTIVE_CANNOT_BE_DEFAULT` — verified directly
  via a request that bypassed the UI (the UI also hides the "Set
  Default" action for inactive addresses as a client-side convenience,
  not the enforcement point).
- Concurrency safety and the DB-level partial unique index are built in
  from the start (not a post-review addition, as they were for M2) — see
  "M2 Hardening" above for the shared design: `SELECT ... FOR UPDATE` on
  the parent `BusinessPartner` row inside an interactive transaction,
  backed by
  `@@unique([partnerId, type], where: { isDefault: true, isDeleted: false })`,
  with a `P2002` catch returning `409 DEFAULT_ADDRESS_CONFLICT`.
  Verified live by firing three concurrent `setDefault` requests for
  three different `OFFICE` addresses on the same partner — all three
  requests succeeded individually (each transaction serialized on the
  row lock and ran in turn), and exactly one address ended up default
  afterward, confirmed by a direct list query.
- Audit actions used: `CREATE`, `UPDATE`, `STATUS_CHANGE` (existing
  values, disambiguated by `entityType: 'PartnerAddress'`) plus the new
  `DEFAULT_CHANGED` enum value — kept separate from `PRIMARY_CHANGED`
  (M2) rather than reused, since the two flags belong to different
  entities and audit queries should be able to filter for one without
  the other, per the explicit M3 requirement.
- List ordering implemented in the service layer
  (`partnerAddressService.ts`'s `ADDRESS_ORDER_BY`:
  `[{ isDefault: 'desc' }, { isActive: 'desc' }, { name: 'asc' }]`), same
  shape as M2's `CONTACT_ORDER_BY`.
- Routes nested under the owning partner
  (`/api/partners/:partnerId/addresses[...]`), mirroring the M2 Contact
  Persons route pattern.
- Permissions used exactly as specified: `partners.view` (list) and
  `partners.addresses.manage` (create/update/delete/set-default) — no
  additional permission name introduced. `ADMIN` and `SALES` already
  hold `partners.addresses.manage` automatically via their existing
  `partners.*` wildcard grant; no seed data changes beyond adding the
  new permission key itself were needed.
- Frontend: the Partner Profile gained a third tab (Addresses), built as
  `AddressesTab.tsx` mirroring `ContactsTab.tsx`'s list/create/edit
  structure — a list table (Name/Type badge/Default badge, Location
  summary, a "Open map" link when `googleMapsUrl` is set, Active/Inactive
  status) and a form component handling both create and update, with the
  same null-on-clear-vs-undefined-on-omit branching between update and
  create as `ContactForm`. `ADDRESS_TYPE_LABELS`/`ADDRESS_TYPE_OPTIONS`
  added to `partnerLabels.ts` alongside the existing role/status maps.

### Post-Approval Engineering Review (M2/M3, before M4)

M2 and M3 were reviewed and Approved, then three engineering
improvements were applied before M4 began.

**1. Reusable default-entity pattern.** `setPrimaryContactPerson` and
`setDefaultPartnerAddress` had independently implemented the identical
five-part shape (load parent partner, lock+transaction, unset-others +
set-target, inactive rejection, `P2002` conflict translation). Extracted
into `apps/api/src/services/partnerChildEntity.ts`:
- `loadPartnerOr404(partnerId, res)` — was duplicated verbatim in both
  `contactPersons.ts` and `partnerAddresses.ts`; now a single shared
  function.
- `setExclusiveDefault({ partnerId, unsetOthers, setTarget })` — the
  lock/transaction/conflict-translation logic from the M2 hardening
  pass, generalized: callers supply only the two model-specific write
  operations (`unsetOthers`, `setTarget`); the helper owns the
  `BusinessPartner` row lock, the interactive transaction, and the
  `P2002` → `ExclusiveDefaultConflictError` translation.
- `canBeDefault(entity: { isActive: boolean })` — the shared
  inactive-cannot-be-default/primary predicate (previously duplicated as
  `contactPersonService.ts`'s `canBePrimary` and
  `partnerAddressService.ts`'s own `canBeDefault`, byte-for-byte
  identical logic under different names).

  Both controllers were rewritten against this module; the duplicate
  `loadPartnerOr404` functions and the two duplicate inactive-check
  functions were deleted rather than left alongside the shared versions.
  **This is now the standard toolkit for any future "exactly one
  default/primary per group" entity** — see PROJECT_MEMORY.md's
  "Exactly one flagged row per group" decision, updated to point at this
  module. A future default-flag entity should call `loadPartnerOr404` +
  `setExclusiveDefault` + `canBeDefault` directly, not reimplement the
  pattern.

  Ordering constants (`CONTACT_ORDER_BY`, `ADDRESS_ORDER_BY`) were
  deliberately **not** merged into a shared generic — Prisma's
  `orderBy` typing wants literal field names per model for its own type
  inference, so a generic "build me an order-by" helper would need
  either `any`/casts (defeating the type-safety Prisma otherwise gives)
  or per-model overloads that would out-weigh the three lines of
  duplication they'd replace. The three-line arrays stay as documented,
  parallel, model-local constants.

**2. Soft-delete convention.** Reviewed `ContactPerson` and
`PartnerAddress` against ADR 0007 — both already use the exact same
three-field triad (`isDeleted Boolean @default(false)`, `deletedAt
DateTime?`, `deletedBy String? @db.Uuid`) with identical types and
defaults; no code change was needed. ADR 0007 predated both models (and
`BusinessPartner`), so its entity list and the general convention text
were updated to name all three and to explicitly document the
`isActive`-vs-`isDeleted` two-flag split these two models introduced (a
reversible business toggle is not the same axis as the soft-delete
lifecycle) as the standard going forward for any entity needing both.

**3. Query performance.** Reviewed every Partner-domain query
(`BusinessPartner`, `ContactPerson`, `PartnerAddress` controllers and
services). Findings:
- **No nested/`include` loading exists anywhere in this domain today** —
  every query is a flat `findMany`/`findUnique`/`update` against a
  single table. There is no N+1 risk to fix because no relation is ever
  eagerly loaded in the same query as its parent.
- `loadPartnerOr404` was already select-narrowed
  (`select: { id, branchId, isDeleted }`) since M2 — no change needed.
- `deleteBusinessPartner`'s existence check only inspects `isDeleted`,
  and its final `update()` result is only used for `id`/`branchId` in
  the audit call — narrowed both to `select: { isDeleted: true }` and
  `select: { id: true, branchId: true }` respectively.
- `deleteContactPerson`/`deletePartnerAddress`'s final `update()` result
  is only used for `id` in the response — narrowed to
  `select: { id: true }`.
- Every other full-row fetch is load-bearing and was **not** narrowed:
  `updateBusinessPartner`/`updateContactPerson`/`updatePartnerAddress`
  need nearly every column for their audit `previousValue` snapshot;
  create/update/set-default results are passed straight to a DTO mapper
  that surfaces every field to edit forms; `loadContactOr404`/
  `loadAddressOr404` are shared across call sites with different field
  needs (some need the full row, e.g. update; some don't, e.g. delete),
  and splitting them into per-caller narrow loaders was judged not
  worth the added surface area for models this small (a few dozen
  scalar columns, no blobs).
- `listBusinessPartners` (the Directory list) returns the full
  `BusinessPartner` row even though the Directory table only renders
  `nameAr`/`nameEn`/`roles`/`branchId`/`status`/`phone`. Narrowing this
  would require a distinct summary DTO (the `BranchSummary` precedent
  already exists for exactly this shape) and a shared-type contract
  change. **Deferred, not applied** — with no measured performance
  problem and no pagination yet, this is premature optimization; it's
  the natural thing to add alongside M9 (Search & Filtering), which
  introduces pagination and will need to think about list-response shape
  anyway.

---

## M4 — Categories & Tags

**Goal:** Provide business-configurable commercial segmentation
(Categories) and lightweight labeling (Tags), kept distinct from Partner
Role/Type per `00_REQUIREMENTS.md` §14–15.

**Scope:** Admin management of the Category and Tag lists; assigning one
Category and multiple Tags to a partner.

**Included functionality:** Category/Tag creation, renaming, and
retirement; assignment to partners.

**Out of scope:** Category-driven automatic pricing/credit-term
defaults (a possible future behavior, not required now).

**Dependencies:** M1.

**Vertical slice coverage:**
- **Backend:** Category/Tag administration and partner-assignment
  capability.
- **Frontend:** a Category & Tag Management admin screen; assignment
  controls on the Partner Profile Overview.
- **Validation:** category/tag names must be non-empty and unique.
- **Permissions:** admin management falls back to `settings.edit`
  pending the dedicated decision noted as an open item in `02_PLAN.md`
  §5; assignment to a partner requires `partners.edit`.
- **Audit Logging:** administrative changes to the lists, and
  assignment/unassignment on a partner, both logged.
- **Documentation:** guidance distinguishing Category, Tag, and Type.
- **Testing:** create/retire a category and tag, assign/unassign on a
  partner, permission-denial.

**Verification checklist:**
- [x] An admin can create, rename, and retire (deactivate) categories and
      tags.
- [x] A partner can hold one category and multiple tags at once.
- [x] Retiring (deactivating) a category/tag does not silently break
      partners already using it — an already-assigned inactive
      category/tag remains visible and assigned; only *new* assignment
      of an inactive one is rejected.
- [x] Unauthorized users cannot manage the category/tag lists
      (`settings.edit` required for all mutations — enforced by the
      same `requirePermission` middleware as every other module).

**Estimated complexity:** Small. **Actual: as estimated.**

### As Implemented

- **Category** — `PartnerCategory` model: `name` (unique), `description`
  (optional), `isActive`, plus the standard soft-delete triad. A
  `BusinessPartner` holds a plain nullable `categoryId` FK — zero-or-one,
  exactly as specified. **No exclusivity lock pattern is used here**,
  unlike `ContactPerson.isPrimary`/`PartnerAddress.isDefault` — there is
  only ever one FK column to update on the partner row itself, not a
  flag to move between sibling rows, so `setExclusiveDefault` from the
  post-M3 review doesn't apply and isn't misused here.
- **Tag** — `PartnerTag` model: `name` (unique), `isActive`, soft-delete
  triad. Many-to-many via an explicit `BusinessPartnerTag` join table
  (`@@id([partnerId, tagId])`, cascade-deleted with either side).
  Unlimited per partner, as specified.
- **Assignment is a plain set-replace, not an "exactly one" invariant.**
  `PUT /api/partners/:partnerId/tags` deletes all of a partner's
  `BusinessPartnerTag` rows and inserts the new set in one plain
  transaction — deliberately **not** using `setExclusiveDefault`, since
  there is no "only one" rule to protect here; last-write-wins on a full
  set-replace is acceptable UX, unlike two rows both claiming to be "the"
  primary/default.
- **Delete prevention.** `DELETE /api/partner-categories/:id` and
  `DELETE /api/partner-tags/:id` each check for existing assignments
  first (`isCategoryInUse`/`isTagInUse` in their respective services —
  a `count()` scoped to non-deleted partners) and return `409
  CATEGORY_IN_USE`/`409 TAG_IN_USE` rather than deleting, per the
  explicit M4 requirement. Verified live: assigning a category/tag to a
  partner, then attempting to delete it, correctly failed with 409;
  after removing the assignment (soft-deleting the test partner), the
  same delete then succeeded.
- **Inactive-cannot-be-assigned**, enforced server-side in both
  assignment endpoints — `setPartnerCategory` checks `category.isActive`
  before accepting a new `categoryId`; `setPartnerTags` checks every
  incoming `tagId` the same way. Verified live via direct API calls
  bypassing the UI: `400 INACTIVE_CATEGORY` / `400 INACTIVE_TAG`.
  Already-assigned inactive categories/tags remain visible (and
  removable) in the frontend picker, marked "(inactive)" — the rule is
  "cannot newly assign," not "must silently disappear."
- **Audit actions used exactly as specified**: `CREATE_CATEGORY`,
  `UPDATE_CATEGORY`, `DELETE_CATEGORY`, `CREATE_TAG`, `UPDATE_TAG`,
  `DELETE_TAG`, `CATEGORY_CHANGED`, `TAGS_CHANGED` — all eight added as
  new `AuditAction` enum values. **This is a deliberate, explicit
  exception** to the CREATE/UPDATE/DELETE + `entityType` convention
  established in M2 ("wouldn't scale to future entities" — see that
  section above): the M4 requirement specifies these exact per-entity
  action names, so they are used as specified. This does not reopen or
  reverse the M2/M3 convention for those entities; it is a one-off,
  requirement-driven exception scoped to Category/Tag.
- **Permissions**: admin CRUD (`POST`/`PUT`/`DELETE` on
  `/api/partner-categories` and `/api/partner-tags`) requires
  `settings.edit`, exactly as specified — no new permission name. The
  **list/read** endpoints for both intentionally require **no
  permission beyond `requireAuth`**, matching the existing
  `GET /api/branches` precedent (open, low-sensitivity reference data):
  gating the list on `settings.view` would have blocked SALES (which
  holds `partners.*` but not `settings.*`) from ever populating the
  Category dropdown/Tag checkboxes on a Partner Profile, defeating the
  milestone's own assignment use case, while `settings.edit`-gated
  mutations stay exactly as strict as specified. Assignment
  (`PUT .../category`, `PUT .../tags`) requires `partners.edit`, exactly
  as specified.
- **`categoryId`/`tagIds` added to the shared `BusinessPartner` DTO**,
  read-only there (excluded from `createBusinessPartnerSchema`/
  `updateBusinessPartnerSchema`, same exclusion pattern as
  `isPrimary`/`isDefault`) — the only way to change them is the
  dedicated endpoints. Because `tagIds` requires a join, every read path
  that returns a `BusinessPartner` now decides deliberately whether to
  fetch it: `listBusinessPartners`/`getBusinessPartner` include the
  join (see the Query Performance note below); `createBusinessPartner`
  passes `[]` literally (a brand-new partner genuinely has zero tags —
  not an approximation); `updateBusinessPartner` re-fetches the join
  since a general update never touches tags but must still report the
  partner's real current tag set.
- **Query performance note**: `listBusinessPartners` and
  `getBusinessPartnerDto` now `include: { tags: { select: { tagId:
  true } } }` — the *first* nested-relation query in this domain (the
  post-M3 review found none existed before this). This is Prisma's
  batched-join form (one extra `WHERE partnerId IN (...)` query, not
  per-row N+1), and is necessary, not incidental, now that `tagIds` is
  part of the DTO contract — consistent with the review's "no
  *unnecessary* nested loading" standard, not "no nested loading ever."
  `category` needed no `include` at all — it's a plain FK column already
  present on `BusinessPartner`.
- Frontend: **Settings → Categories Management / Tags Management** —
  two new sections in the existing `SettingsPage.tsx` (previously
  labeled "Phase 1 — read-only"; that label was removed since these two
  sections are now genuinely editable), each with its own list/create/
  edit/delete form (`CategoriesManagement.tsx`, `TagsManagement.tsx`),
  gated on `can('settings.edit')` for the mutation controls. **Partner
  Profile → Category & Tags** is a *section* within the Overview tab
  (per the explicit M4 wording — "section," not "tab" — unlike
  Contacts/Addresses, which are full CRUD lists and got their own
  tabs): a Category `<select>` (auto-saves on change, immediate `PUT
  .../category`) and a Tag checkbox grid (batched — a "Save Tags" button
  fires one `PUT .../tags` call with the full new set, rather than one
  call per checkbox click).

---

## M5 — Notes

**Goal:** Provide a timestamped, attributable running log per partner.

**Scope:** Add, edit, and pin notes on a partner; an internal-only vs.
future-portal-visible distinction on each note.

**Included functionality:** Note CRUD; pinning; the visibility flag
(the flag exists now; actual portal exposure is a future feature).

**Out of scope:** Any real portal-facing visibility of notes.

**Dependencies:** M1.

**Vertical slice coverage:**
- **Backend:** note CRUD scoped to a partner.
- **Frontend:** a Notes section on the Partner Profile, with pin
  control.
- **Validation:** note text must be non-empty.
- **Permissions:** `partners.edit` (notes are treated as a core edit
  action, not broken out into its own permission in the approved set).
- **Audit Logging:** note creation/edits logged; author and timestamp
  always recorded.
- **Documentation:** guidance on the internal-vs-visible convention.
- **Testing:** add/pin/edit a note, permission-denial.

**Verification checklist:**
- [x] Notes are automatically timestamped and attributed to their
      author.
- [x] A note can be pinned and unpinned.
- [ ] ~~Internal-only notes are clearly marked~~ — **superseded**; see
      "As Implemented" below. Not applicable to the field set actually
      delivered.
- [x] Unauthorized users cannot add or edit notes (in fact cannot even
      list them — see the Permissions note below).

**Estimated complexity:** Small. **Actual: as estimated.**

### As Implemented

**Scope supersession, documented explicitly (same precedent as M3's
Google Maps fields superseding `02_PLAN.md`'s "out of scope" note):**
the milestone as actually requested specified a concrete field set —
Title, Body, Color (optional), Pinned, Created By, Updated By, Created
At, Updated At — with **no internal-only-vs-portal-visible flag**. That
flag was part of the original `00_REQUIREMENTS.md` §17 /
`02_PLAN.md`-era conception of Notes; it was not requested for this
milestone and was not built. If partner-portal visibility of notes
becomes a real requirement later (Phase C in `docs/AI/VISION.md`), it
should be added as its own explicit field/decision at that time, not
assumed to already exist here.

- `PartnerNote` model: `title`, `body` (both required), `color`
  (optional, a loose 6-digit hex string, e.g. `#3B82F6` — free-form, not
  a fixed enum of named colors, since the requirement didn't specify
  allowed values; the frontend offers a 5-color preset palette plus "no
  color" as a practical default, not an enforced constraint), `isPinned`,
  `createdBy`/`updatedBy` (bare UUIDs, not formal `StaffProfile`
  relations — same deliberate simplification ADR 0007 already applies to
  `deletedBy`), plus the standard soft-delete triad and timestamps.
- **"Rich text / multiline body" was interpreted as multiline plain
  text**, not a WYSIWYG/HTML rich-text editor — the project has no
  rich-text-editor dependency today (checked `apps/web/package.json`
  before deciding), and introducing one is a meaningfully larger
  architectural addition than this milestone's stated scope. `body` is
  stored as plain `String` (Postgres `TEXT` via Prisma's default) and
  rendered with `white-space: pre-wrap` so line breaks are preserved —
  satisfies "multiline" without inventing a new subsystem. If actual
  rich formatting (bold/lists/links) becomes a real requirement, that is
  a distinct, larger decision for its own milestone.
- **Relation field named `partnerNotes`, not `notes`** — `BusinessPartner`
  already has a scalar `notes String?` field from M1 (a single free-text
  remarks field, still edited from the Overview tab). The two are
  unrelated concepts and neither was renamed or merged: `notes` (M1) is
  one short remark per partner; `PartnerNote` (M5) is an unlimited,
  first-class, pinnable, searchable, audited list.
- **`isPinned` deliberately excluded from create/update** — same
  exclusion pattern as `isPrimary`/`isDefault`/Category's `categoryId`.
  The only way to change it is a dedicated
  `PUT .../notes/:noteId/pin` endpoint. **No lock/transaction pattern
  applies here** — unlike `setExclusiveDefault`'s use elsewhere in this
  feature, pinning is not an "exactly one per group" invariant (many
  notes may be pinned at once; "pinned first, then newest first"
  describes a two-tier sort, not exclusivity), so reusing that helper
  would have been a misapplication of it, consistent with the same
  judgment call M4 made for Tags.
- **Editing preserves `createdBy`** — `updatePartnerNote` never touches
  `createdBy`, only sets `updatedBy` to the editor. Verified live: edited
  a note created by one staff id and confirmed `createdBy` was unchanged
  in the response while `updatedBy` was newly set.
- **Search** (`GET .../notes?q=...`) matches Title **or** Body,
  case-insensitive (Prisma's `contains` with `mode: 'insensitive'`),
  exactly as specified. Verified live: a query matching only a note's
  title returned that note; a separate query matching text only in a
  different note's body returned that note.
- **Ordering**: `NOTE_ORDER_BY` in `partnerNoteService.ts` —
  `[{ isPinned: 'desc' }, { createdAt: 'desc' }]`. "Newest first" is
  read as most-recently-*created* (a running log reads chronologically
  by entry), not most-recently-*edited* — documented as a deliberate
  interpretation, since the requirement text doesn't disambiguate the
  two readings.
- **Audit actions**: `CREATE`/`UPDATE`/`DELETE` reuse the existing
  generic values (`entityType: 'PartnerNote'`), matching the M2/M3
  convention (not M4's per-entity-name exception — the M5 requirement
  listed "Create, Update, Delete, Pin, Unpin," not `CREATE_NOTE`-style
  names). Two new enum values were added: `PIN`/`UNPIN` — named to match
  the requirement's own words, kept as two directions of one toggle
  rather than a single `PINNED_CHANGED`-style value with a payload flag,
  consistent with the `PRIMARY_CHANGED`/`DEFAULT_CHANGED`/
  `CATEGORY_CHANGED` precedent of "each relationship/visibility change
  gets an independently-queryable action."
- **Permissions**: every notes endpoint, **including list**, requires
  `partners.edit` — not the `partners.view` + `*.manage`-split pattern
  M2/M3 used. This is a deliberate reading of the explicit instruction
  ("Use: partners.edit. No new permission is required") together with
  the content examples given (`"Has outstanding issue"`,
  `"VIP customer"` — sensitive internal commentary, not something every
  viewer should see). A practical consequence: CASHIER (which holds only
  `partners.view`) cannot see the Notes tab at all; the tab button itself
  is conditionally rendered only for `can('partners.edit')` users, so
  there is no dead tab that 403s on open.
- Frontend: **Partner Profile → Notes** is its own tab (per the explicit
  M5 wording — unlike M4's Category & Tags, which is a section), built
  as `NotesTab.tsx` mirroring `ContactsTab.tsx`/`AddressesTab.tsx`'s
  list/create/edit structure, plus: a debounced search box (250ms,
  calling the same `?q=` endpoint the backend search is defined on — no
  client-side filtering, so search results are always consistent with
  what a fresh page load would show), a Pinned badge, author name
  (resolved by cross-referencing the `staff: User[]` list already
  fetched by `PartnerProfilePage` for the sales-rep dropdown — reused,
  not re-fetched), formatted creation date, and a 5-color preset swatch
  picker in the note form. The color, where set, renders as a
  `border-inline-start` accent on the note card — a CSS logical property
  that flips sides automatically under `dir="rtl"` with no extra markup,
  which is how this component satisfies the Arabic RTL requirement
  (consistent with the rest of the app: no dedicated `dir="rtl"` wrapper
  is added here, matching how `ContactsTab`/`AddressesTab` already rely
  on the browser's natural bidi text rendering rather than a page-level
  RTL wrapper).

### Pre-M6 Engineering Rules (applied before M6 begins)

Seven standing engineering rules were set for M6 and beyond, before any
M6 code was written. Two are concrete, implemented changes to the
existing system; five are binding constraints on how M6 itself must be
built, recorded here so M6's own "As Implemented" section can be
checked against them.

**1. Timeline Preparation & 3. Activity Feed Ready — implemented now.**
Every future Partner activity (notes, contacts, addresses, category/tag
changes, credit changes, attachments, quotations, work orders, payments,
...) must be assemblable into one unified Timeline later, and nothing in
the current design may prevent that. The concrete problem: `AuditLog`
had no way to ask "everything that happened to partner X" in one query
— `entityId` refers to whichever entity was audited (a `ContactPerson`
id, a `PartnerAddress` id, ...), not the owning partner, so answering
that question meant knowing every partner-scoped `entityType` in
advance and joining per type — exactly the "scattered business history"
the rules warn against, and a cost that grows with every future
milestone that adds another partner-scoped entity.

Fixed by adding `AuditLog.partnerId` (nullable, denormalized, a real FK
relation to `BusinessPartner` with `onDelete: SetNull` — not a bare UUID
like `deletedBy`, since only one relation is needed here, not the
many-relations problem ADR 0007's bare-UUID convention exists to avoid).
Every partner-scoped `recordAudit()` call site now passes it explicitly
(`contactPersons.ts`, `partnerAddresses.ts`, `partnerNotes.ts`,
`partnerCategoryTags.ts`, `businessPartners.ts`); catalog CRUD
(`partnerCategories.ts`, `partnerTags.ts`) and non-partner domains
(auth, users, roles, permissions) correctly leave it `null`. The
migration backfills `partnerId` for every existing partner-scoped audit
row (resolving `ContactPerson`/`PartnerAddress`/`PartnerNote` rows'
`entityId` back to their owning partner, and copying `entityId` directly
for `BusinessPartner`-typed rows) — additive `UPDATE` statements only, no
data loss, reviewed before applying per the Migration Safety Rule.

**Result**: a future Timeline for partner X is
`SELECT * FROM "AuditLog" WHERE "partnerId" = X ORDER BY "createdAt"`,
one indexed query across every entity type, verified live (created a
partner, a contact, an address, and a note, then confirmed a single
`partnerId`-scoped query returned all four `CREATE` entries correctly,
while an unrelated catalog CRUD entry correctly had `partnerId: null`).
The Timeline UI itself is still **not** built — only the data model
that makes it cheap to build is.

**2. Commercial Profile Separation — binding constraint for M6.**
Commercial/credit fields (price tier, credit limit, credit terms, credit
status) must **not** be added as columns on `BusinessPartner` — only
true identity fields belong there. They must live in their own model
(e.g. `PartnerCommercialProfile`), related to `BusinessPartner`, the
same way `ContactPerson`/`PartnerAddress`/`PartnerNote` already are.
Nothing has been built yet under this rule; it governs M6 when it
starts.

**4. Future Portal Compatibility — binding constraint for M6.** The
Commercial Profile's API/DTO design must not auto-expose commercial data
to any future portal-scoped client. Visibility must be permission-based
in both directions (internal staff via `partners.credit.manage`, per
`02_PLAN.md` §3/§5, and any future customer-facing token), never
"visible by default, restricted later." Nothing built yet; governs M6.

**5. Avoid God Objects — confirmed, not newly implemented.** Checked
`BusinessPartner` against this rule: it holds only identity fields
(name, roles, status, branch, sales rep, phone, email, notes,
category/tags) plus relations to `ContactPerson`, `PartnerAddress`,
`PartnerNote`. No commercial, attachment, or document fields have crept
onto it. The modular pattern already established by M2/M3/M5 is the
one M6 must continue, not a new pattern to introduce.

**6. UI Consistency — clarified, not changed.** The Partner Profile tab
set (Overview, Contacts, Addresses, Notes, and eventually Commercial,
Attachments, Timeline) continues unchanged. **Category & Tags remains a
*section* inside the Overview tab, not promoted to its own tab** — that
was M4's own explicit, deliberate design decision ("section," not
"tab"); this rule's tab-like listing of "Categories & Tags" alongside
Overview/Contacts/Addresses/Notes/Commercial/Attachments/Timeline is
read as a loose enumeration of Partner Profile *areas*, not a
redesign instruction — reinforced by this same rule's own "Do not
redesign previous tabs." No tabs were changed.

**7. Documentation — this section.** `03_IMPLEMENT.md`, `04_VERIFY.md`,
and `PROJECT_MEMORY.md` are updated for the `AuditLog.partnerId` change.
`README.md` is intentionally **not** updated — no milestone status
changed (M6 has not started), so there is nothing for its status
summary to reflect yet.

---

## M6 — Commercial & Credit Profile

**Goal:** Capture price tier, credit limit, credit terms, and credit
status under their own distinct approval path, per the service-boundary
decision in `02_PLAN.md` §3.

**Scope:** View and edit commercial/credit fields; a credit-status flag
(Active / On Hold / Under Review).

**Included functionality:** Price-tier assignment; credit limit and
terms capture; credit-status management; strict visibility separation
from general partner data.

**Out of scope:** Actual credit-limit enforcement at order-creation
time — that belongs to the future Quotations/Work Orders/Treasury
features that will consume this data as a signal, per `02_PLAN.md` §8.
This milestone establishes the signal, not its enforcement elsewhere.

**Dependencies:** M1.

**Vertical slice coverage:**
- **Backend:** commercial/credit field management, kept separate from
  core partner edit.
- **Frontend:** a Commercial & Credit section, visibility-gated
  separately from the rest of the profile.
- **Validation:** credit limit non-negative; terms within a sensible
  range.
- **Permissions:** `partners.credit.manage`, required for both viewing
  and editing this section (per `02_PLAN.md` §5's note that the approved
  set does not split view from manage for credit).
- **Audit Logging:** every credit-limit, terms, or status change logged
  with before/after values — a heightened standard per
  `00_REQUIREMENTS.md` §26.
- **Documentation:** explanation of what each credit status means and
  who may change it.
- **Testing:** edit credit fields; confirm the section is entirely
  hidden from a user without `partners.credit.manage`; confirm audit
  entries capture old and new values.

**Verification checklist:**
- [x] Credit/commercial fields are invisible to users without
      `partners.credit.manage` — not merely read-only, absent (the
      Commercial tab button itself is conditionally rendered only for
      `can('partners.credit.manage')`, same pattern as M5's Notes tab).
- [x] Credit-limit and terms changes are individually audit-logged with
      old and new values.
- [x] Credit status can be set to On Hold / Under Review.
- [x] Holding `partners.edit` alone does not grant access to this
      section (verified by construction: the route and the tab are both
      gated on `partners.credit.manage` specifically, never
      `partners.edit`).

**Estimated complexity:** Medium. **Actual: as estimated.**

### As Implemented

This milestone arrived with a "suggested areas" field list broader than
`02_PLAN.md`/`03_IMPLEMENT.md`'s original M6 planning (price tier, credit
limit, credit terms, credit status). Each suggested area was resolved
against what already exists elsewhere in the system, rather than built
without checking — per the explicit "do not redesign Business Partner"
and "do not redesign previous milestones" instructions:

- **Credit Limit** → `creditLimit` (`Decimal`, non-negative, per the
  project's "money fields use Decimal, never Float" convention).
- **Payment Terms** → `paymentTermsDays` (`Int`, 0–365) — a single
  net-days number (e.g. 30 for "Net 30"); no richer terms model was
  ever specified.
- **Preferred Payment Method** → `preferredPaymentMethod`, reusing the
  **existing** `PaymentMethod` enum (`CASH`/`VODAFONE_CASH`/`INSTAPAY`/
  `BANK_ACCOUNT`) already defined in `schema.prisma` for Treasury —
  Reuse Before Create, not a new enum.
- **Tax Information** → **excluded from this milestone.** M7 ("Tax &
  Compliance Information") already owns this scope in the established
  roadmap; implementing it here would duplicate a milestone that hasn't
  started yet, which is exactly what "do not redesign previous
  milestones" (read forward, not just backward) exists to prevent.
- **Commercial Classification** → `priceTier` (free-text string, no
  fixed taxonomy specified) — **explicitly distinct from the M4
  `PartnerCategory`** (VIP/Gold/Silver/...): Category is general partner
  segmentation used across the whole partner record; `priceTier` is
  commercial/pricing-specific and scoped to this profile only. Having
  both was a deliberate choice, not an oversight — see the model's
  schema comment.
- **Sales Representative** → **not duplicated.** Already exists as
  `BusinessPartner.salesRepId` (M1, core identity) and stays there
  unchanged — "do not redesign Business Partner."
- **Account Status** → `status` (new `PartnerCommercialStatus` enum:
  `ACTIVE`/`ON_HOLD`/`UNDER_REVIEW`, matching `02_PLAN.md`'s original
  spec exactly) — **explicitly distinct from `BusinessPartner.status`**
  (`PartnerStatus`: Prospect/Active/Inactive/Blocked, the partner's
  overall lifecycle stage). Same word, different concept, different
  enum, different field, on purpose.
- **Risk Level** → `riskLevel` (new `PartnerRiskLevel` enum: `LOW`/
  `MEDIUM`/`HIGH`) — a conservative 3-tier taxonomy, since no specific
  levels were given and a minimal, uncontroversial default was judged
  safer than inventing a more elaborate scale.
- **Preferred Currency** → `preferredCurrency` (free string, e.g.
  `"EGP"`) — captured but **not enforced or used in any calculation
  anywhere**, per the explicit "future-ready" framing; no Currency
  table/enum was added, since that infrastructure doesn't exist yet and
  would be premature.
- **Internal Commercial Notes** → `internalNotes` (free text, max 2000
  chars) — **explicitly distinct from both** `BusinessPartner.notes`
  (M1, one general remark) **and** `PartnerNote` (M5, unlimited
  pinnable/searchable notes): this is a short annotation scoped to the
  Commercial Profile and visible only to `partners.credit.manage`
  holders, not the general Notes feature.

**Model shape**: `PartnerCommercialProfile`, one-to-zero-or-one with
`BusinessPartner` (`partnerId @unique`) — never inline fields on
`BusinessPartner`, per the pre-M6 "Commercial Profile Separation" rule.
**No soft-delete triad** — a deliberate, documented exception to ADR
0007 (see that ADR's updated Consequences/exclusion list): this is a 1:1
detail record, not an independently-addressable list-of-many entity;
the correct soft-delete unit is `BusinessPartner` itself.

**Write path is a single upsert**, not separate create/update endpoints:
`PUT /api/partners/:partnerId/commercial-profile` creates the profile on
first write (`201`, audit `CREATE`) and updates it on every write after
(`200`, audit `STATUS_CHANGE` if `status` changed, else `UPDATE`) —
matching `businessPartners.ts`'s own
`statusChanged ? 'STATUS_CHANGE' : 'UPDATE'` pattern exactly, so no new
`AuditAction` enum values were needed. `GET` returns `data: null` (not
`404`) when no profile has been created yet — a fresh partner having no
Commercial Profile is a normal state, not an error.

**Timeline Preparation carried forward**: every `recordAudit()` call
here passes `partnerId`, continuing the pre-M6 convention — a future
partner Timeline picks up Commercial Profile changes automatically,
with no special-casing.

**Permission note**: `02_PLAN.md` §3's stated rationale for keeping
Commercial Profile separate is that credit decisions follow a different
approval authority (Accounts/Credit Control) than partner identity
(Sales/Customer Service) — but SALES currently holds the `partners.*`
wildcard (established in Phase 2's seed data, unchanged by any FEATURE-002
milestone), which **automatically** grants `partners.credit.manage` too.
This is flagged, not fixed: splitting SALES's wildcard grant into
narrower pieces is a permission-model change affecting every existing
`partners.*` sub-action (contacts, addresses, categories, tags, notes),
not something owed to this milestone, and "do not change any public API
unless required" argues against it here. If credit visibility ever needs
to be genuinely restricted from SALES, that is a dedicated, reviewed
IAM change (a new role, e.g. `ACCOUNTS`/`CREDIT_CONTROL`, or splitting
the wildcard), not a side effect of a feature milestone — the same
governance already established for permission cleanup in the M1 review.

**Frontend**: **Commercial** is its own tab (not a section like M4's
Category & Tags) — `02_PLAN.md`'s "visibility-gated separately from the
rest of the profile" phrasing, and the fact that it needs a genuinely
different permission than every other tab, called for the same crisp
tab-level boundary M5's Notes tab already established, not a subsection
buried inside Overview. Since the profile is a 1:1 record, not a list,
`CommercialTab.tsx` is a single load-then-edit form (mirroring
`OverviewForm`'s shape), not a list+create+edit set of components like
Contacts/Addresses/Notes.

---

## M7 — Tax & Compliance Information

**Goal:** Capture the partner's tax and compliance profile.

**Scope:** Tax registration number, VAT registration status/number,
tax-exemption status flag.

**Included functionality:** Tax field capture and editing; the
exemption-status flag (its dependency on a valid backing document, once
M8 exists, is a small follow-on refinement rather than a blocker here).

**Out of scope:** Withholding-tax calculation (a future Treasury/
Accounting concern); actual e-invoicing submission (a future external
integration).

**Dependencies:** M1.

**Vertical slice coverage:**
- **Backend:** tax-field management.
- **Frontend:** a Tax & Compliance section on the Partner Profile.
- **Validation:** tax registration number format sanity-checked;
  exemption flag surfaces a reminder that it needs backing
  documentation.
- **Permissions:** `partners.edit`.
- **Audit Logging:** tax-field changes logged, consistent with the
  compliance sensitivity noted in `00_REQUIREMENTS.md` §26.
- **Documentation:** explanation of which tax/VAT/exemption fields are
  captured and why.
- **Testing:** edit tax fields, set the exemption flag, permission-
  denial.

**Verification checklist:**
- [ ] Tax registration and VAT fields can be recorded and edited.
- [ ] Exemption status is visibly flagged on the partner profile.
- [ ] Tax-field changes are audit-logged.
- [ ] Unauthorized users cannot edit tax information.

**Estimated complexity:** Small.

---

## M8 — Documents & Attachments

**Goal:** Allow supporting documents to be attached to a partner, with
expiry awareness.

**Scope:** Upload, view, replace, and remove documents; document type/
label; expiry-date tracking.

**Included functionality:** Document CRUD; retaining the prior version
on replace (not deleting it); surfacing expiring/expired documents.

**Out of scope:** Automated document content validation or OCR;
integration with e-invoicing document submission.

**Dependencies:** M1. Once complete, M7's exemption-status rule can be
tightened to require a valid, non-expired document — a small follow-on,
not a blocker for either milestone individually.

**Vertical slice coverage:**
- **Backend:** document CRUD and expiry tracking.
- **Frontend:** a Documents section with expiry indicators.
- **Validation:** document type/label required; expiry date
  sanity-checked when provided.
- **Permissions:** `partners.attachments.manage`.
- **Audit Logging:** upload, replace, and remove actions logged.
- **Documentation:** guidance on expected document types, per
  `00_REQUIREMENTS.md` §16.
- **Testing:** upload/replace/remove, confirm expiry indicators display
  correctly, permission-denial.

**Verification checklist:**
- [ ] Documents can be uploaded, replaced (prior version retained), and
      removed.
- [ ] Expiring and expired documents are visibly flagged.
- [ ] Unauthorized users cannot manage documents.
- [ ] Document actions are audit-logged.

**Estimated complexity:** Medium.

---

## M9 — Search & Filtering

**Goal:** Deliver the dedicated, fast lookup experience across
everything built so far.

**Scope:** Search by name (Arabic/English, partial match), phone, tax
registration number, contact-person name; combinable filters by role,
category, tag, status, branch, sales representative, credit standing,
last-activity recency, tax-exemption status; saved filter views.

**Included functionality:** Directory search and filtering; "recent/
frequently accessed" surfacing.

**Out of scope:** Any change to how partners are created or edited —
this is a read-only capability.

**Dependencies:** M1–M8 (filtering needs the attributes those milestones
introduce — categories/tags from M4, credit standing from M6, and so
on — though it can be delivered incrementally against whatever exists
at the time).

**Vertical slice coverage:**
- **Backend:** lookup/query capability across accumulated partner
  attributes.
- **Frontend:** Directory search bar, filter panel, saved views.
- **Validation:** graceful empty/no-match states.
- **Permissions:** `partners.view` — filtering must never expose data a
  plain view wouldn't already allow, specifically respecting M6's
  credit-visibility boundary.
- **Audit Logging:** not required for read-only search itself, beyond
  whatever general access logging already exists in the system.
- **Documentation:** guidance on search behavior and matching
  tolerance.
- **Testing:** search by each supported field, combined filters, save
  and reuse a filter view, confirm credit-restricted data never leaks
  through filter results to an unauthorized user.

**Verification checklist:**
- [ ] Search finds partners by partial name in Arabic or English.
- [ ] Search finds partners by phone and tax registration number.
- [ ] Filters can be combined and saved for reuse.
- [ ] A user without `partners.credit.manage` cannot filter or see
      credit-status results.

**Estimated complexity:** Medium.

---

## M10 — Export

**Goal:** Provide a filtered, permission-gated, logged export of partner
data for legitimate operational needs.

**Scope:** Export of the current Directory view/filtered result set.

**Included functionality:** Filtered export respecting field-level
visibility — credit fields excluded unless the exporting user holds
`partners.credit.manage`.

**Out of scope:** Scheduled/automated recurring export; export formats
beyond what's operationally needed.

**Dependencies:** M9 — export operates on the result set search/
filtering produces.

**Vertical slice coverage:**
- **Backend:** export generation respecting the active filter and
  field-visibility rules.
- **Frontend:** an Export action on the Directory screen.
- **Validation:** a confirmation step before exporting an unintentionally
  large/unfiltered dataset.
- **Permissions:** `partners.export`.
- **Audit Logging:** every export logged — who, when, and what
  filter/scope was exported, per `00_REQUIREMENTS.md` §27.
- **Documentation:** guidance on what is included or excluded depending
  on the exporting user's permissions.
- **Testing:** export with and without credit-visibility permission,
  confirm the audit entry captures scope accurately.

**Verification checklist:**
- [ ] Export respects the currently applied filters.
- [ ] Credit/commercial fields are excluded for users without
      `partners.credit.manage`.
- [ ] Every export is audit-logged with who/when/scope.
- [ ] A user without `partners.export` cannot trigger an export.

**Estimated complexity:** Small.

---

## M11 — Duplicate Detection

**Goal:** Detect likely duplicate partner records, both at the point of
creation and on demand.

**Scope:** Real-time duplicate warning during creation (M1); a
standalone Duplicate Review screen surfacing candidate matches across
the existing dataset. Matching considers name similarity (Arabic and
English), tax registration number, phone number, and address.

**Included functionality:** Rule-based match-candidate detection
(explicitly not machine-learning-based, per `02_PLAN.md` §10);
entry-time warnings; the Duplicate Review screen; recording a staff
decision to dismiss a candidate as "not a duplicate."

**Out of scope:** Automatic merging (M12); machine-learning matching.

**Dependencies:** M1. Benefits from M3 (address data improves matching)
but name/tax-ID/phone matching alone does not strictly require it.

**Vertical slice coverage:**
- **Backend:** matching logic and candidate generation.
- **Frontend:** entry-time warning UI; Duplicate Review screen.
- **Validation:** matching thresholds tuned to avoid excessive false
  positives, per the tuning risk noted in `02_PLAN.md` §9.
- **Permissions:** `partners.view` or `partners.merge` to review
  candidates (reviewing alone changes no data).
- **Audit Logging:** a staff decision to dismiss a candidate is
  recorded; detection itself, being a read-only computation, is not.
- **Documentation:** explanation of what triggers a duplicate warning.
- **Testing:** create a near-duplicate and confirm a warning appears;
  confirm the Duplicate Review screen surfaces existing candidates;
  confirm dismissal is recorded.

**Verification checklist:**
- [ ] Creating a partner with a name/tax-ID/phone close to an existing
      one triggers a warning.
- [ ] The Duplicate Review screen lists current candidate matches.
- [ ] Dismissing a candidate as "not a duplicate" is recorded.
- [ ] A manual spot-check against realistic sample data shows an
      acceptable false-positive rate.

**Estimated complexity:** Large.

---

## M12 — Merge Workflow

**Goal:** Execute the controlled, five-step merge workflow approved in
`02_PLAN.md` §4, for confirmed duplicates.

**Scope:** Select Records → Preview → Conflict Resolution → Merge →
Audit Log, exactly as specified.

**Included functionality:** The full guided workflow; a guarantee that
all related records (contacts, addresses, notes, documents) reattach to
the surviving partner; an explicit-confirmation safeguard reflecting the
action's irreversibility.

**Out of scope:** Any automatic or unattended merging.

**Dependencies:** M11 (merge is normally entered from a detected
candidate, though manual "Select Records" entry is also part of the
workflow). Most meaningfully verified once M2/M3/M5/M8 exist, so there
is real related data to confirm correct reattachment against — though it
can technically ship as soon as M1 and M11 exist.

**Vertical slice coverage:**
- **Backend:** merge execution — survivor selection, conflict-resolution
  capture, history reattachment.
- **Frontend:** the Merge Wizard, covering all five steps.
- **Validation:** every conflicting field must have an explicit
  resolution before the Merge step can proceed — no silent defaulting.
- **Permissions:** `partners.merge`, distinct from and in addition to
  `partners.edit`.
- **Audit Logging:** the merge itself is the workflow's final,
  non-optional step — which records, who performed it, and how each
  conflict was resolved.
- **Documentation:** guidance on when and how staff should use this,
  given its irreversibility.
- **Testing:** merge two partners with conflicting fields and related
  contacts/documents; confirm the survivor has all reattached history;
  confirm the audit entry is complete; confirm a user without
  `partners.merge` cannot execute a merge.

**Verification checklist:**
- [ ] Merge requires an explicit resolution for every conflicting field.
- [ ] All related records (contacts, addresses, documents, notes)
      reattach to the surviving partner.
- [ ] No partner-owned data is dropped during a merge.
- [ ] The merge is fully audit-logged (who, when, which records, how
      conflicts were resolved).
- [ ] A user without `partners.merge` cannot execute a merge.

**Estimated complexity:** Large.

---

## M13 — Import Workflow

**Goal:** Enable bulk import of existing partner data via the
seven-step controlled workflow approved in `02_PLAN.md` §7.

**Scope:** Upload → Preview → Validation → Duplicate Detection → Merge
Suggestions → Confirmation → Import, exactly as specified.

**Included functionality:** The full staged workflow; per-record
decision capture (create new / merge into existing / skip); a commit
step that only writes confirmed records.

**Out of scope:** Scheduled or automatic recurring imports; direct
imports from live external systems — this is a file-based, staff-
initiated workflow only.

**Dependencies:** M11 (Duplicate Detection) and M12 (Merge, since "Merge
Suggestions" during import reuses the same merge mechanics) must both
exist first. This is the most dependent milestone in the roadmap.

**Vertical slice coverage:**
- **Backend:** staged import processing, consuming Duplicate Detection
  and Merge rather than reimplementing either.
- **Frontend:** the Import Wizard, covering all seven steps.
- **Validation:** per-record completeness/correctness checks before any
  record is even considered a duplicate candidate.
- **Permissions:** `partners.import`, required through every step, not
  only the final commit.
- **Audit Logging:** the import batch itself is logged; any record
  merged during import produces the same merge audit trail as M12's
  standalone workflow.
- **Documentation:** guidance on preparing source data and what happens
  to ambiguous records.
- **Testing:** import a small file with a mix of new, duplicate, and
  ambiguous records; confirm each is handled per the decisions made;
  confirm nothing is silently created or dropped.

**Verification checklist:**
- [ ] Every workflow step (Upload / Preview / Validation / Duplicate
      Detection / Merge Suggestions / Confirmation / Import) is
      exercised — none is skippable.
- [ ] Ambiguous records are routed to a staff decision, never
      auto-created or auto-discarded.
- [ ] Merges confirmed during import produce the same audit trail as a
      manual merge (M12).
- [ ] A user without `partners.import` cannot reach any step past
      Upload.

**Estimated complexity:** Large.

---

## M14 — Integration Enablement

**Goal:** Confirm and stabilize the partner-data surface that
Quotations, Work Orders, Treasury, and Reports will depend on, without
building any of those features.

**Scope:** A review of what each future consumer needs from the partner
domain, per `02_PLAN.md` §8, confirming it is complete, stable, and
correctly permission-scoped ahead of those features' own planning.

**Included functionality:** A documented confirmation of the
integration boundary — what future features may rely on reading, and
what remains owned by this feature; any small gaps found are closed.

**Out of scope:** Building any part of Quotations, Work Orders,
Treasury, or Reports themselves.

**Dependencies:** M1–M13 substantially complete — this is a
stabilization and review pass, not new user-facing functionality.

**Vertical slice coverage:**
- **Backend:** confirm the read-surface future features will consume is
  complete and stable.
- **Frontend:** confirm the Related Records placeholder section on the
  Partner Profile is ready to host future cross-links from those
  features.
- **Validation:** not applicable beyond what prior milestones already
  established.
- **Permissions:** confirm read-only consumption by future features
  will not require permissions beyond what this feature already
  defines.
- **Audit Logging:** not applicable — no new mutating actions are
  introduced.
- **Documentation:** finalize the integration-boundary documentation
  this feature owes to future features, per `02_PLAN.md` §8.
- **Testing:** a walkthrough confirming each of the four future
  consumers' stated needs is actually satisfiable with what exists.

**Verification checklist:**
- [ ] Each integration point named in `02_PLAN.md` §8 has a confirmed,
      stable way to be satisfied.
- [ ] No future feature would need this feature's shape to change in
      order to consume it.
- [ ] Integration-boundary documentation is complete and accurate.

**Estimated complexity:** Small.

---

## Recommended First Milestone

**M1 — Core Partner Record.**

Every other milestone depends on it, directly or transitively — there is
no ordering in which anything else could reasonably come first. Beyond
that dependency-ordering argument, M1 is the right starting point for
three further reasons:

1. **It delivers real, standalone business value on its own.** Even
   before contacts, addresses, or credit profiles exist, staff can
   record and find the partners they deal with — a genuine improvement
   over no structured record at all, not a partial feature waiting on
   the rest to become useful.
2. **It has zero new dependencies.** It builds only on what FEATURE-001
   already delivered (IAM, branches, permissions), so it can start
   immediately without waiting on any other in-flight work.
3. **It establishes the vertical-slice pattern on the smallest possible
   surface.** Every subsequent milestone repeats the same
   Backend/Frontend/Validation/Permissions/Audit/Documentation/Testing
   shape. Proving that pattern works end-to-end on the simplest possible
   milestone — before applying it to genuinely hard problems like
   Duplicate Detection (M11) or Merge (M12) — is exactly where any
   process friction should be found and resolved first, while the cost
   of doing so is still low.
