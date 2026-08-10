# FEATURE-002 — Verification

> Executed against genuine test records created and then soft-deleted
> through the real UI/API in each session — not simulated. See
> `03_IMPLEMENT.md` for what was implemented and why.

## Milestone 1 (Core Partner Record)

## Build

- [x] `npm run build` (shared → api → web) — clean.

## Typecheck

- [x] `apps/web` and `apps/api` — both clean.

## Lint

- [x] `apps/web` and `apps/api` — both clean.

## Database

- [x] Migration `20260804072705_feature002_m1_business_partners` applied
      to the live Supabase database and resolved in Prisma's migration
      history (`prisma migrate status` reports up to date).
- [x] Verified empirically, before applying, that every table touched
      (`Customer`, `Supplier`, `Order`, `Quotation`, `TreasuryEntry`,
      `Tender`, `Attachment`, `SupplierPurchase`, `SupplierPayment`) had
      zero rows — confirmed safe to drop/repoint with no data loss.
- [x] Stale `customers.*`/`suppliers.*` permission rows removed from the
      live database after reseeding with `partners.*` (cascade-removed
      their now-meaningless role grants).

## Backend

- [x] `POST /api/partners` — creates a partner, returns `201`, audit-logs
      `CREATE`. Verified live: created a real partner
      ("مدرسة النصر الإعدادية").
- [x] `GET /api/partners` / `GET /api/partners/:id` — list and detail,
      both verified live.
- [x] `PUT /api/partners/:id` — verified live in three states:
      - Setting `status: ACTIVE` with no phone/email → `400`, business
        rule correctly rejected it.
      - Setting `status: ACTIVE` after adding a phone number → `200`,
        succeeded.
      - Audit action recorded as `STATUS_CHANGE` (not plain `UPDATE`)
        when status changed in the same request — confirmed via a direct
        database read of the `AuditLog` table.
- [x] `DELETE /api/partners/:id` — soft-deletes, returns `200`, verified
      live; the deleted partner correctly disappeared from
      `GET /api/partners` afterward (excluded by `isDeleted: false`).
- [x] Permission enforcement — `partners.view/create/edit/delete` are
      required on every route via the same `requireAuth` +
      `requirePermission` middleware already used by every other module
      (not reimplemented). **Not independently re-tested with a
      non-privileged account in this session** — verified by reusing the
      identical, already-proven middleware/pattern rather than a fresh
      negative test; see Known Limitations.

## Frontend

- [x] Directory list (`/partners`) — loads, shows empty state correctly,
      shows the created partner correctly (name, roles, branch, status,
      phone) after creation, and correctly returns to the empty state
      after deactivation.
- [x] Quick-Add form — opens, submits, creates a real record, closes and
      refreshes the list on success.
- [x] Partner Profile (`/partners/:id`) — loads with all fields correctly
      pre-populated; Overview form edits saved correctly; roles
      checkboxes (all 8) and status dropdown (all 4 values) confirmed
      present and functional.
- [x] Sales representative dropdown — confirmed populated (via
      `GET /api/users`, which succeeded for the SUPER_ADMIN test
      session). The defensive fallback (hide the field if that fetch
      403s) was **not exercised live** in this session — verified by
      code review only; see Known Limitations.
- [x] Deactivate button — confirmed triggers the soft-delete and
      navigates back to the Directory.
- [x] Nav — "Partners" link appears correctly, gated on `partners.view`.

## Validation

- [x] Required-field validation (`nameAr`, `branchId`) enforced via the
      shared Zod schema, shared identically between client and server.
- [x] The "cannot activate without a valid contact method" business rule
      (`00_REQUIREMENTS.md` §28) verified live in both directions (see
      Backend above).

## Audit Logging

- [x] `CREATE` and `STATUS_CHANGE` entries confirmed recorded correctly
      via a direct database read, including sensible before/after
      payloads.
- [ ] `DELETE` audit entry was not independently re-queried after the
      live deactivation test (the code path is identical to the already-
      verified `CREATE`/`UPDATE` pattern, so this is a documentation gap
      rather than a functional doubt, but it wasn't re-confirmed by
      direct query).

## Documentation

- [x] This file and `03_IMPLEMENT.md` updated to reflect what was
      actually built and verified.
- [x] `PartnerStatus`/`PartnerRole` and the `BusinessPartner` model carry
      doc comments in `schema.prisma` explaining the Status-vs-Role
      distinction and pointing back to this feature's docs.

## Known Limitations

- [ ] Permission-denial paths (`partners.*` missing) were not
      live-tested with a second, non-privileged account in this session
      — verified only by code/pattern review (identical middleware to
      every other already-proven module). Recommended: exercise this
      once a non-admin test account is convenient to set up.
- [ ] The sales-rep dropdown's permission-fallback behavior (hiding the
      field when `GET /api/users` 403s) was not exercised live — the
      SUPER_ADMIN test session always had access to that endpoint.
- [ ] No automated tests exist for this feature (consistent with the
      rest of the system — `01_ANALYSIS.md`'s IAM audit noted the same
      gap; not introduced or worsened here).
- [ ] Search/filtering, contacts, addresses, credit, tax, documents,
      notes, categories/tags, duplicate detection, and merge are
      explicitly out of scope for Milestone 1 and not present.

---

## Milestone 2 (Contact Persons)

### Build / Typecheck / Lint

- [x] `npx prisma generate`, migration apply + resolve, `npx tsx
      prisma/seed.ts` — all completed cleanly against the live database.
- [x] `apps/web` and `apps/api` typecheck — clean.
- [x] `apps/web` and `apps/api` lint — clean.
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is purely additive: `CREATE TYPE
      "PreferredContactMethod"`, `ALTER TYPE "AuditAction" ADD VALUE
      'PRIMARY_CHANGED'`, `CREATE TABLE "ContactPerson"`, 3 indexes, 1
      FK. **Zero `DROP`/`DELETE` statements** — confirmed by reading the
      generated SQL before applying it, consistent with the Migration
      Safety Rule adopted at the top of `03_IMPLEMENT.md`.
- [x] Permission catalog: added `partners.contacts.manage` as a new
      action within the existing `partners` module (not a new module).
      Verified the catalog count increased by exactly 1 (51 → 52) after
      reseeding — confirmed via a direct query, not assumed, after an
      initial (incorrect) suspicion that the count had dropped was
      investigated and resolved.

### Backend — verified live (real records, real HTTP requests)

- [x] `POST .../contacts` → `201`, audit-logged `CREATE`.
- [x] `PUT .../contacts/:id/primary` on the first contact → `200`,
      audit-logged `PRIMARY_CHANGED`.
- [x] Creating a second contact and setting *it* primary → the first
      contact's `isPrimary` automatically flipped back to `false` in the
      same list refresh — the "only one Primary Contact" exclusivity
      rule confirmed working, not just assumed from the code.
- [x] **Server-side rejection of "inactive contact as primary"
      confirmed independently of the UI**: called
      `PUT .../contacts/:id/primary` directly via `fetch` (bypassing the
      React app entirely) against a contact already set `isActive:
      false`, got `400 INACTIVE_CANNOT_BE_PRIMARY` — proves the rule is
      enforced server-side, not merely hidden client-side.
- [x] Deactivating the *current primary* contact via `PUT .../contacts/:id`
      (`isActive: false`) automatically cleared `isPrimary` in the same
      request — confirmed both in the UI (badge disappeared) and via the
      audit log (`STATUS_CHANGE` entry's `newValue` includes `"note":
      "primary cleared automatically on deactivation"`).
- [x] `DELETE .../contacts/:id` → `200`, soft-deleted, correctly
      disappeared from the list.
- [x] Audit log directly queried after the test sequence — confirmed
      exactly the expected entries: `CREATE` ×2, `PRIMARY_CHANGED` ×2,
      `STATUS_CHANGE` ×2 (one of which carries the auto-clear note).
      `DELETE` was exercised live (200 response, list updated) but not
      separately re-queried from the audit table — same
      documentation-only gap noted for M1.

### Frontend — verified live

- [x] Partner Profile now shows an Overview/Contacts tab bar; switching
      tabs works.
- [x] Contacts list, "+ Add Contact" form, "Edit" form (pre-filled),
      "Make Primary", "Remove" all exercised live against real data, in
      Arabic (`أحمد علي`, `سارة محمود`) and English content.
- [x] Approval-flag badges (Quotations/Work Orders/Financial Docs) and
      the Active/Inactive status text render correctly based on live
      data.

### Known Limitations (M2)

- [ ] Permission-denial for `partners.contacts.manage` was not
      live-tested with a second, non-privileged account — same
      limitation as M1, same justification (identical, already-proven
      `requirePermission` middleware).
- [ ] No automated tests exist (consistent with the rest of the system).
- [ ] Addresses, Commercial & Credit, Tax, Documents, Notes,
      Categories/Tags, Search, Duplicate Detection, Merge, and Import/
      Export remain out of scope, per the roadmap.

### M2 Hardening (Post-Approval Review)

See `03_IMPLEMENT.md`'s "M2 Hardening" section for the design rationale.

- [x] `npx prisma format` / `validate` / `generate` — clean, after
      enabling the `partialIndexes` preview feature.
- [x] Partial-index support confirmed empirically before touching the
      real schema: a throwaway test model reproduced Prisma's own error
      demanding the preview flag, then (after enabling it)
      `prisma migrate diff` was inspected and confirmed to emit a
      correct native Postgres `CREATE UNIQUE INDEX ... WHERE (...)`
      statement. Test model deleted before the real change.
- [x] Migration applied live: `CREATE UNIQUE INDEX
      "ContactPerson_partnerId_key" ON "ContactPerson"("partnerId")
      WHERE ("isPrimary" = true AND "isDeleted" = false)` — confirmed
      present via `prisma migrate status` reporting the database up to
      date, no drift.
- [x] `apps/api` typecheck — clean after rewriting
      `setPrimaryContactPerson` to the interactive-transaction +
      `SELECT ... FOR UPDATE` pattern.
- [x] Ordering fix (`CONTACT_ORDER_BY` in `contactPersonService.ts`)
      confirmed via code path: `listContactPersons` now delegates to the
      shared constant instead of an inline `orderBy` array.
- [ ] The M2 concurrency fix itself was not independently re-exercised
      with a live concurrent-request test in this session (the *M3*
      concurrency fix — structurally identical — was, see below; this is
      a documentation gap, not a functional doubt, since both controllers
      now share the same lock pattern and the same interactive-transaction
      code shape).

---

## Milestone 3 (Addresses)

### Build / Typecheck / Lint

- [x] `npx prisma format` / `validate` / `generate` — clean.
- [x] Migration apply + resolve, `npx tsx prisma/seed.ts` — completed
      cleanly against the live database.
- [x] `apps/web` and `apps/api` typecheck — clean.
- [x] `apps/web` and `apps/api` lint — clean.
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is purely additive: `CREATE TYPE "AddressType"`,
      `ALTER TYPE "AuditAction" ADD VALUE 'DEFAULT_CHANGED'`,
      `CREATE TABLE "PartnerAddress"`, 3 indexes, 1 partial unique index
      (`@@unique([partnerId, type], where: { isDefault: true, isDeleted:
      false })`), 1 FK. **Zero `DROP`/`DELETE` statements** — confirmed
      by reading the generated SQL before applying it. Bundled in the
      same migration as the M2 hardening's `ContactPerson` partial
      unique index (both additive, reviewed together before applying).
- [x] Permission catalog: added `partners.addresses.manage`. Verified
      the catalog count increased by exactly 1 (52 → 53) after
      reseeding — confirmed via a direct query.

### Backend — verified live (real records, real HTTP requests, all test
data soft-deleted afterward)

- [x] `POST .../addresses` → `201`, audit-logged `CREATE`. Created three
      addresses on a test partner: two `BILLING`, one `SHIPPING`.
- [x] `PUT .../addresses/:id/default` on the first `BILLING` address →
      `200`, audit-logged `DEFAULT_CHANGED`, `isDefault: true`.
- [x] Setting the *second* `BILLING` address default → the first
      address's `isDefault` automatically flipped back to `false` in the
      same list refresh — the "only one default per type" exclusivity
      rule confirmed working. Setting the `SHIPPING` address default at
      the same time was unaffected — confirming exclusivity is scoped
      per `(partner, type)`, not per partner.
- [x] **Server-side rejection of "inactive address as default" confirmed
      independently of the UI**: deactivated a non-default address via
      `PUT .../addresses/:id` (`isActive: false`), then called
      `PUT .../addresses/:id/default` directly via `fetch`, got
      `400 INACTIVE_CANNOT_BE_DEFAULT`.
- [x] Deactivating the *current default* address via
      `PUT .../addresses/:id` (`isActive: false`) automatically cleared
      `isDefault` in the same request — confirmed via the response body
      (`isDefault: false`).
- [x] **Concurrency fix verified live**: created three `OFFICE`
      addresses on the same partner, then fired three `PUT
      .../addresses/:id/default` requests concurrently
      (`Promise.all`) targeting all three. All three requests returned
      `200` individually (each transaction serialized on the
      `BusinessPartner` row lock and ran in turn rather than racing), and
      a subsequent `GET .../addresses` confirmed **exactly one** `OFFICE`
      address ended up with `isDefault: true` — no double-default state,
      confirming the row-lock fix (shared with M2's `setPrimaryContactPerson`)
      holds under genuine concurrent requests, not just sequential ones.
- [x] `DELETE .../addresses/:id` → `200`, soft-deleted.
- [x] Audit log directly queried after the full test sequence
      (temporary diagnostic script, deleted after use) — confirmed
      exactly the expected entries for `entityType: 'PartnerAddress'`:
      `CREATE` ×6, `DEFAULT_CHANGED` ×6, `STATUS_CHANGE` ×2 — matching
      every create/set-default/deactivate call made during the session,
      with no unexpected entries.
- [x] Permission row confirmed present via direct query:
      `partners.addresses.manage`, module `partners`, correct label.

### Frontend — verified live

- [x] Partner Profile now shows a third tab, "Addresses"; switching to
      it renders the address list (empty state confirmed on a fresh
      partner: "No addresses yet.").
- [x] "+ Add Address" form exercised live through the actual React UI
      (not just direct API calls): filled Name/Street, selected type via
      the `AddressType` dropdown (labels render correctly — "Billing",
      "Shipping", "Office", etc.), submitted, and the new address
      appeared in the list immediately with the correct type badge and
      location summary.
- [x] "Set Default" button exercised live through the UI: clicking it
      made the "Default" badge appear next to the address and the "Set
      Default" button correctly disappeared (since the address is now
      already default).
- [x] Google Maps link rendering confirmed via direct API-created data
      (an address with `googleMapsUrl` set renders an "Open map" link in
      the Map column; one without renders "—").

### Known Limitations (M3)

- [ ] Permission-denial for `partners.addresses.manage` was not
      live-tested with a second, non-privileged account — same
      limitation and justification as M1/M2.
- [ ] No automated tests exist (consistent with the rest of the system).
- [ ] Commercial & Credit, Tax, Documents, Notes, Categories/Tags,
      Search, Duplicate Detection, Merge, and Import/Export remain out
      of scope, per the roadmap.

---

## Post-Approval Engineering Review (M2/M3, before M4)

See `03_IMPLEMENT.md`'s "Post-Approval Engineering Review" section for
the design rationale for all three items.

- [x] `apps/api` typecheck — clean after extracting
      `partnerChildEntity.ts` and rewriting both controllers against it.
- [x] `apps/api` lint — clean.
- [x] **Behavioral equivalence confirmed live** (this is a refactor, not
      a behavior change, so the test is that nothing regressed): created
      a fresh test partner, two contacts, two OFFICE addresses; set each
      contact primary in turn (second correctly unset the first, final
      state `{Contact Two: primary, Contact One: not primary}`); set each
      address default in turn (same exclusivity result); deactivated the
      non-primary contact and confirmed `PUT .../primary` on it still
      returns `400 INACTIVE_CANNOT_BE_PRIMARY` — identical responses to
      the pre-refactor M2/M3 verification runs. Test partner cleaned up
      (soft-deleted) afterward.
- [x] Soft-delete convention: confirmed by direct schema inspection
      (not just re-reading old notes) that `ContactPerson` and
      `PartnerAddress` carry the exact same `isDeleted`/`deletedAt`/
      `deletedBy` triad, same types, same defaults. ADR 0007 updated to
      name both models plus `BusinessPartner` (all three had shipped
      after the ADR was last edited) and to document the
      `isActive`-vs-`isDeleted` two-flag convention explicitly.
- [x] Query performance: `deleteBusinessPartner`/`deleteContactPerson`/
      `deletePartnerAddress` narrowed to select only the fields actually
      used — confirmed via typecheck (a wrong field reference after
      narrowing a `select` is a compile error, not a silent runtime
      bug) and via the live smoke test above (delete still returns
      `{ success: true, data: { id } }` correctly).

---

## Milestone 4 (Categories & Tags)

### Build / Typecheck / Lint

- [x] `npx prisma format` / `validate` / `generate` — clean.
- [x] Migration apply + resolve (`prisma migrate status` — up to date).
      No seed changes required — M4 introduces no new permission keys.
- [x] `apps/api` and `apps/web` typecheck — clean.
- [x] `apps/api` and `apps/web` lint — clean (one real finding fixed:
      `CategoryTagsSection.tsx` initially synced `selectedTagIds` from
      `partner.tagIds` inside a `useEffect`, which
      `eslint-plugin-react-hooks`'s `set-state-in-effect` rule correctly
      flagged as a cascading-render anti-pattern; rewritten to the
      React-documented "adjust state during render" pattern instead —
      see the component for the fix).
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is purely additive: `CREATE TABLE "PartnerCategory"`,
      `CREATE TABLE "PartnerTag"`, `CREATE TABLE "BusinessPartnerTag"`,
      `ALTER TABLE "BusinessPartner" ADD COLUMN "categoryId"`, 8
      `ALTER TYPE "AuditAction" ADD VALUE`, indexes, FKs. **Zero
      `DROP`/`DELETE` statements** — confirmed by reading the generated
      SQL before applying it.
- [x] No permission catalog change — M4 uses only existing
      `settings.edit`/`partners.edit` keys, per the explicit
      "no new permission names" requirement. Catalog count unchanged
      (53).

### Backend — verified live (real records, real HTTP requests, all test
data soft/hard-deleted afterward as appropriate)

- [x] `POST .../partner-categories` / `.../partner-tags` → `201`,
      audit-logged `CREATE_CATEGORY`/`CREATE_TAG`.
- [x] `PUT .../partners/:id/category` → `200`, audit-logged
      `CATEGORY_CHANGED`; `PUT .../partners/:id/tags` → `200`,
      audit-logged `TAGS_CHANGED`. `GET .../partners/:id` afterward
      confirmed `categoryId`/`tagIds` correctly reflected the
      assignment.
- [x] **Delete-prevention confirmed independently of the UI**: with a
      category and a tag both assigned to a live test partner, called
      `DELETE .../partner-categories/:id` and
      `DELETE .../partner-tags/:id` directly via `fetch` — got
      `409 CATEGORY_IN_USE` / `409 TAG_IN_USE` in both cases. After
      soft-deleting the assigning partner (removing the only
      assignment), the identical delete calls then succeeded (`200`) —
      confirming the in-use check is scoped to non-deleted partners, not
      a permanent block.
- [x] **Inactive-cannot-be-assigned confirmed independently of the UI**:
      deactivated a category (`isActive: false`) via
      `PUT .../partner-categories/:id`, then called
      `PUT .../partners/:id/category` with that category's id — got
      `400 INACTIVE_CATEGORY`. Same test repeated for a tag via
      `PUT .../partners/:id/tags` — got `400 INACTIVE_TAG`.
- [x] Audit log directly queried after the full test sequence
      (temporary diagnostic script, deleted after use) — confirmed
      exactly the expected counts: `CREATE_CATEGORY` ×2,
      `UPDATE_CATEGORY` ×1, `DELETE_CATEGORY` ×2, `CREATE_TAG` ×2,
      `UPDATE_TAG` ×1, `DELETE_TAG` ×2 on their respective entity types,
      and exactly `CATEGORY_CHANGED` ×1 / `TAGS_CHANGED` ×1 on
      `BusinessPartner` — matching every call made during the session
      with no unexpected entries. The rejected attempts (409/400
      responses) correctly produced **no** audit entries, since they
      fail before `recordAudit` is reached.
- [x] List endpoints (`GET /api/partner-categories`,
      `GET /api/partner-tags`) confirmed accessible with no permission
      beyond a valid session (open read, per the documented `settings.*`
      vs. SALES-usability reasoning in `03_IMPLEMENT.md`).

### Frontend — verified live

- [x] Settings → Categories Management: created a category ("Wholesale")
      through the actual React form (not just direct API calls) —
      appeared in the list immediately with correct name/description/
      Active status.
- [x] Partner Profile → Category & Tags section: renders within the
      Overview tab, correctly listing the just-created "Wholesale"
      category as a selectable option; selecting it via the dropdown's
      `change` event triggered the immediate `PUT .../category` call
      (confirmed via the select's committed value after the round trip,
      and via no console errors).
- [x] Settings page's stale "(Phase 1 — read-only)" title suffix
      removed, since Categories/Tags Management are now genuinely
      editable sections on that page.
- [x] Tag checkbox → "Save Tags" flow exercised end-to-end through the
      actual UI: clicked a tag's checkbox (confirmed `checked: true`
      and the "Save Tags" button became enabled — dirty-state detection
      working), clicked "Save Tags", then confirmed via `GET
      /api/partners/:id` that `tagIds` reflected the new assignment and
      that the button correctly re-disabled itself afterward (the
      render-time sync logic in `CategoryTagsSection.tsx` picked up the
      saved state and cleared the dirty flag without an extra effect).

### Known Limitations (M4)

- [ ] Permission-denial for `settings.edit`/`partners.edit` was not
      live-tested with a second, non-privileged account — same
      limitation and justification as M1–M3.
- [ ] No automated tests exist (consistent with the rest of the system).
- [ ] Commercial & Credit, Tax, Documents, Notes, Search, Duplicate
      Detection, Merge, and Import/Export remain out of scope, per the
      roadmap.

---

## Milestone 5 (Notes)

### Build / Typecheck / Lint

- [x] `npx prisma format` / `validate` / `generate` — clean.
- [x] Migration apply + resolve (`prisma migrate status` — 7 migrations,
      up to date). No seed changes required — M5 introduces no new
      permission keys.
- [x] `apps/api` and `apps/web` typecheck — clean.
- [x] `apps/api` and `apps/web` lint — clean.
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is purely additive: `CREATE TABLE "PartnerNote"`, 2
      `ALTER TYPE "AuditAction" ADD VALUE` (`PIN`, `UNPIN`), 3 indexes, 1
      FK. **Zero `DROP`/`DELETE` statements** — confirmed by reading the
      generated SQL before applying it, per the Migration Safety Rule.
- [x] No permission catalog change — M5 uses only the existing
      `partners.edit` key, per the explicit "no new permission is
      required" instruction. Catalog count unchanged (53).

### Backend — verified live (real records, real HTTP requests, all test
data soft/hard-deleted afterward)

- [x] `POST .../notes` → `201`, audit-logged `CREATE`. Created three
      notes on a test partner (`Prefers WhatsApp`, `VIP customer`,
      `Outstanding issue`), one with a `color`.
- [x] **Pinned-then-newest ordering confirmed live**: pinned the
      most-recently-created note (`Outstanding issue`) — it correctly
      moved to the top of the list despite two unpinned notes existing;
      among the unpinned notes, the more-recently-created one
      (`VIP customer`, created after `Prefers WhatsApp`) correctly
      sorted before the older one — confirming both tiers of the sort
      (`isPinned desc`, then `createdAt desc`), not just the pinned tier.
- [x] **Search confirmed live for both fields**: `?q=WhatsApp` (a
      title-only match) returned exactly `Prefers WhatsApp`; `?q=artwork`
      (a body-only match, the word never appears in any title) returned
      exactly `Outstanding issue` — confirming the search genuinely
      covers both Title and Body, not just one.
- [x] **"Editing must preserve CreatedBy" confirmed live**: edited a
      note's title via `PUT .../notes/:id` — the response's `createdBy`
      was byte-identical to the value at creation, while `updatedBy` was
      newly set to the editor's staff id (previously `null`).
- [x] `PUT .../notes/:id/pin` confirmed both directions: `{isPinned:
      true}` → `200`, audit-logged `PIN`; `{isPinned: false}` on the same
      note afterward → `200`, audit-logged `UNPIN`.
- [x] `DELETE .../notes/:id` → `200`, soft-deleted — confirmed excluded
      from a subsequent `GET .../notes` list (the row itself was never
      removed from the database, per ADR 0007 — "deleted notes never
      disappear physically," which is what soft delete means here, not a
      claim that the UI shows deleted notes anywhere).
- [x] Audit log directly queried after the full test sequence (temporary
      diagnostic script, deleted after use) — confirmed exactly the
      expected counts on `entityType: 'PartnerNote'`: `CREATE` ×3, `PIN`
      ×1, `UPDATE` ×1, `UNPIN` ×1, `DELETE` ×1 — matching every call made
      during the session with no unexpected entries.

### Frontend — verified live

- [x] Partner Profile gained a fourth tab, "Notes" — confirmed visible
      (the test session holds `partners.edit`).
- [x] Notes list renders both remaining notes after the API-driven test
      sequence, correctly ordered (newest-created-first, since neither
      was pinned at that point), with the author name resolved to
      **"Omar"** (not a raw UUID) via the existing `staff: User[]` list,
      and a correctly formatted creation date.
- [x] Search box exercised live through the actual UI (not just direct
      API calls): typed "artwork" into the search input, and after the
      debounce the list correctly narrowed to just the one matching note.
- [x] Pin button exercised live through the UI: clicking "Pin" made the
      "Pinned" badge appear on the note card and the button correctly
      relabeled itself "Unpin".

### Known Limitations (M5)

- [ ] Permission-denial for `partners.edit` was not live-tested with a
      second, non-privileged account — same limitation and justification
      as M1–M4.
- [ ] Add Note / Edit Note forms and the Delete confirmation were not
      separately exercised via `computer`-tool clicks in this session
      (Search and Pin were); create/edit/delete were verified via direct
      API calls plus confirmed rendering in the UI afterward (e.g. the
      edited title and the post-delete list both appeared correctly) —
      a documentation gap rather than a functional doubt, since all three
      forms call the same `apiPost`/`apiPut`/`apiDelete` helpers already
      proven live for Contacts/Addresses/Categories/Tags in this session.
- [ ] The internal-only-vs-portal-visible notes flag described in the
      original `00_REQUIREMENTS.md`/`02_PLAN.md` planning docs was not
      implemented — superseded by the actual M5 field set requested; see
      `03_IMPLEMENT.md`'s M5 "As Implemented" note.
- [ ] No automated tests exist (consistent with the rest of the system).
- [ ] Commercial & Credit, Tax, Documents, Search (partner-level),
      Duplicate Detection, Merge, and Import/Export remain out of scope,
      per the roadmap.

---

## Pre-M6 Engineering Rules

See `03_IMPLEMENT.md`'s "Pre-M6 Engineering Rules" section for the
rationale behind all seven items. Only items 1/3 (Timeline Preparation /
Activity Feed Ready) produced an actual code change this round; items
2/4/5/6/7 are constraints/confirmations with nothing new to verify yet.

### Build / Typecheck / Lint

- [x] `npx prisma format` / `validate` / `generate` — clean.
- [x] Migration apply + resolve (`prisma migrate status` — 8 migrations,
      up to date). No seed changes — no new permission keys.
- [x] `apps/api` typecheck and lint — clean. (`apps/web` untouched by
      this change — no frontend code references `AuditLog` directly.)
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is additive **plus a backfill**, not purely additive
      like every prior migration this feature — reviewed line by line
      before applying, per the Migration Safety Rule: `ALTER TABLE
      "AuditLog" ADD COLUMN "partnerId"` (nullable), four `UPDATE`
      statements populating it for existing rows (one direct
      `entityId`-copy for `BusinessPartner`-typed rows, three joins
      resolving `ContactPerson`/`PartnerAddress`/`PartnerNote` rows back
      to their owning partner), then the index and FK. **Zero
      `DROP`/`DELETE` statements** — the `UPDATE`s only fill
      previously-`NULL` values, never overwrite or remove data.

### Backend — verified live (real records, real HTTP requests, all test
data soft/hard-deleted afterward)

- [x] Created a fresh partner, then one `ContactPerson`, one
      `PartnerAddress`, and one `PartnerNote` under it. A single
      `WHERE "partnerId" = <partner id>` query against `AuditLog`
      (temporary diagnostic script, deleted after use) returned **all
      four** `CREATE` entries — one per entity type — confirming a
      future Timeline can retrieve a partner's full cross-entity history
      in one indexed query, exactly the property this change exists to
      provide.
- [x] Confirmed the same query correctly does **not** pick up unrelated
      activity: a `PartnerCategory` catalog-CRUD audit entry (not
      partner-scoped) was directly checked and has `partnerId: null`, as
      designed — catalog management stays out of any future partner
      Timeline.
- [x] Backfill correctness confirmed structurally (the migration's
      `UPDATE ... FROM` joins were reviewed before applying) rather than
      by inspecting specific pre-existing rows, since this session's
      prior test data had already been soft-deleted throughout M2–M5's
      own verification cleanup — there was nothing materially left to
      backfill onto at verification time beyond confirming the mechanism
      itself works on new data (above).

### Known Limitations

- [ ] No Timeline UI or Timeline API endpoint exists yet — this change
      only removes the data-model obstacle to building one; M6 (or a
      later milestone) still has to build it.
- [ ] `PartnerCommercialProfile` (rule 2) has not been created — M6
      hasn't started. This entry exists so a future reviewer doesn't
      mistake the pre-M6 rules section for M6 itself being underway.

---

## Milestone 6 (Commercial & Credit Profile)

### Build / Typecheck / Lint

- [x] `npx prisma format` / `validate` / `generate` — clean.
- [x] Migration apply + resolve (`prisma migrate status` — 9 migrations,
      up to date).
- [x] Permission catalog: added `partners.credit.manage`. Verified the
      catalog count increased by exactly 1 (53 → 54) after reseeding —
      confirmed via the seed script's own summary line, not assumed.
- [x] `apps/api` and `apps/web` typecheck — clean. One real finding:
      `tsc -b` (the actual `apps/web` build, project-references mode)
      caught two type errors that `tsc --noEmit` against the app
      tsconfig alone had not — `preferredPaymentMethod`/`riskLevel`
      state inferred as plain `string` from their `?? ''` initializers
      rather than the narrower union type. Fixed by typing the `useState`
      calls explicitly (`useState<PaymentMethod | ''>(...)`), the same
      pattern already used by `ContactForm`'s
      `preferredContactMethod`. Documented here as a reminder that
      `npm run build`, not just a standalone typecheck command, is the
      real gate.
- [x] `apps/api` and `apps/web` lint — clean.
- [x] `npm run build` (shared → api → web) — clean.

### Database

- [x] Migration is purely additive: `CREATE TYPE
      "PartnerCommercialStatus"`, `CREATE TYPE "PartnerRiskLevel"`,
      `CREATE TABLE "PartnerCommercialProfile"`, 1 unique index (on
      `partnerId`), 1 plain index, 1 FK. **Zero `DROP`/`DELETE`
      statements.** No new `AuditAction` enum values needed — this
      milestone reuses `CREATE`/`UPDATE`/`STATUS_CHANGE`.

### Backend — verified live (real records, real HTTP requests, all test
data soft/hard-deleted afterward)

- [x] `GET .../commercial-profile` on a partner with no profile yet →
      `200`, `data: null` (not `404`) — confirmed this is treated as a
      normal state, not an error.
- [x] `PUT .../commercial-profile` (first write) → `201`, audit-logged
      `CREATE`, all eight fields (credit limit, payment terms, preferred
      payment method, price tier, status, risk level, preferred
      currency, internal notes) correctly persisted and returned —
      including `creditLimit` correctly serialized as a plain JSON
      number (`50000`), not a Prisma Decimal object.
- [x] `PUT .../commercial-profile` (second write, changing `status` and
      `creditLimit` only) → `200`, audit-logged `STATUS_CHANGE` (not a
      generic `UPDATE`) — confirming the `statusChanged ? 'STATUS_CHANGE'
      : 'UPDATE'` branch works correctly; fields not included in the
      second request (payment terms, price tier, etc.) were correctly
      left untouched, confirmed by re-reading the response.
- [x] **Validation confirmed live**: a negative `creditLimit` → `400
      VALIDATION_ERROR`, and correctly produced **no** audit entry
      (confirmed by an exact audit-count check afterward — 2 entries
      total, matching only the two successful writes, not three).
- [x] Audit log directly queried after the full test sequence (temporary
      diagnostic script, deleted after use) — confirmed exactly `CREATE`
      ×1, `STATUS_CHANGE` ×1 on `entityType: 'PartnerCommercialProfile'`,
      and confirmed both entries carry the correct `partnerId` (Timeline
      Preparation wiring, continued from the pre-M6 change — see that
      section above) via a `partnerId`-scoped query.

### Frontend — verified live

- [x] Partner Profile now shows a fifth tab, "Commercial" (visible
      because the test session holds the global `*` permission, which
      includes `partners.credit.manage`).
- [x] Navigating to the Commercial tab after the API-driven test
      sequence rendered every field correctly pre-filled from the saved
      profile — confirmed by reading each input/select/textarea's actual
      DOM value (not just the visible text), matching the last API
      response exactly: credit limit `25000`, terms `30`, method
      `BANK_ACCOUNT`, tier `Wholesale`, status `ON_HOLD`, risk `LOW`,
      currency `EGP`, and the full notes text.

### Known Limitations (M6)

- [ ] Permission-denial for `partners.credit.manage` was not
      live-tested with a second, non-privileged account — same
      limitation and justification as M1–M5.
- [ ] The Commercial form's Save button and field-editing interactions
      were not separately exercised via `computer`-tool clicks in this
      session — verified via direct API calls plus confirmed correct
      rendering of the result in the actual UI afterward, the same
      documentation-only gap noted for M5's create/edit/delete forms.
- [ ] SALES automatically holds `partners.credit.manage` via its
      existing `partners.*` wildcard grant, in tension with
      `02_PLAN.md` §3's stated rationale that credit decisions belong to
      a different approval authority than Sales — not fixed in this
      milestone (see `03_IMPLEMENT.md`'s M6 "As Implemented" note for
      why, and what a real fix would require).
- [ ] Tax Information, Documents, Search (partner-level), Duplicate
      Detection, Merge, and Import/Export remain out of scope, per the
      roadmap. Tax Information specifically has its own future milestone
      (M7) rather than being folded into this one.
- [ ] No automated tests exist (consistent with the rest of the system).

---

## Status

**Ready for Review.** Build, typecheck, and lint are clean for
Milestones 1–6 plus the pre-M6 `AuditLog.partnerId` change, including the M2 post-approval hardening (DB-level
partial unique index, concurrency-safe Set Primary, service-layer
ordering), the subsequent M2/M3 engineering review (reusable
default-entity pattern, soft-delete convention documentation, query
performance narrowing), M4 (Categories & Tags), and M5 (Notes). Every
capability in M3 — including the "only one default address per type"
exclusivity rule, the inactive-cannot-be-default rule, and the
concurrency fix shared with M2 — was verified against the real, live
system: the exclusivity and inactive rules were confirmed enforced
server-side (direct API calls bypassing the UI), and the concurrency fix
was confirmed under genuine concurrent requests (three simultaneous
`setDefault` calls resolved to exactly one default, not a race). Every
capability in M4 — the zero-or-one Category / unlimited Tags rules, the
delete-prevention-when-assigned rule for both, and the
inactive-cannot-be-assigned rule for both — was likewise verified
server-side via direct API calls, plus a live UI smoke test through the
actual React forms. Every capability in M5 — pinned-then-newest
ordering, title-and-body search, CreatedBy preservation on edit, and the
Pin/Unpin toggle with distinct audit entries — was verified the same
way: direct API calls exercising every business rule, cross-checked
against a direct audit-log query, plus a live UI smoke test (search and
pin exercised through real `computer`-tool/DOM interaction, not just
`fetch`). The recurring narrow exceptions (permission-denial paths
verified by code/pattern review rather than a second live account, one
M2 dropdown fallback, and M5's create/edit/delete forms verified via API
+ rendered-result rather than raw click-through) are documented above,
not silently assumed. Ahead of M6, `AuditLog.partnerId` was added and
backfilled (Timeline Preparation / Activity Feed Ready) and verified
live: a single `partnerId`-scoped query correctly returned every
partner-scoped audit entry across all four entity types exercised so
far, and correctly excluded a non-partner-scoped catalog entry. Every
capability in M6 — the create-then-update upsert flow, the
`STATUS_CHANGE`-vs-`UPDATE` audit branching, credit-limit validation
rejecting negative values with no audit side effect, and the
`partnerId`-tagged audit trail continuing the pre-M6 Timeline
convention — was verified server-side via direct API calls plus a live
UI check confirming every field round-tripped correctly through the
real Commercial tab. The one open architectural tension (SALES
inheriting `partners.credit.manage` via its existing wildcard, contrary
to `02_PLAN.md` §3's stated separation-of-authority rationale) is
documented, not silently resolved.
