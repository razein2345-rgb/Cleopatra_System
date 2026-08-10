# FEATURE-002 — Business Partners — Implementation Blueprint

> This is a system architecture and implementation planning document. It
> does not specify database schema, API contracts, or UI components — it
> defines scope, domain responsibilities, service boundaries, and a
> phased delivery plan, built directly on the Approved architectural
> decision in `01_ANALYSIS.md` (Business Partner + Contact Person) and
> the business requirements in `00_REQUIREMENTS.md`.

---

## 1. Feature Scope

FEATURE-002 delivers the foundational capability for managing every
organization and individual Cleopatra ERP deals with: creation,
identity, roles, contacts, addresses, commercial/credit profile, tax
profile, documents, notes, lifecycle status, categorization, duplicate
prevention, merging, search, and bulk import/export.

This feature is **foundational infrastructure** for the rest of the
system: Quotations, Work Orders, Treasury, and Reports will all depend on
it existing and being stable, but this feature does not itself implement
any of those. It is scoped to the Business Partner domain only.

## 2. Domain Model

### Main Entities and Responsibilities

- **Business Partner** — the core entity (per the Approved decision).
  Responsible for identity (name, legal/individual status), current
  role(s), lifecycle status, branch relationship, and acting as the
  single anchor point that contacts, addresses, documents, and notes
  attach to.
- **Partner Role** — a role assignment held by a partner (Customer,
  Supplier, Prospect, Government, School, Hospital, Printing House,
  Internal Department, and future roles). Responsible only for signaling
  which capabilities/behaviors apply to a given partner — it carries no
  identity of its own separate from the partner it belongs to.
- **Contact Person** — a named individual associated with a partner.
  Responsible for representing who can be reached, how, and what they
  are authorized to do on the partner's behalf (per the Approved
  decision's field list: name, job title, phone, mobile, WhatsApp,
  email, preferred contact method, approval authorities, notes).
- **Address** — a place associated with a partner (billing, delivery,
  registered, site). Responsible only for location and purpose/label,
  independent of the partner's other attributes.
- **Partner Category** — a business-defined, admin-managed segmentation
  label (e.g. VIP, Wholesale, Institutional). Responsible for commercial
  segmentation, independent of Partner Role.
- **Partner Tag** — a lightweight, multi-valued, business-managed label
  for informal grouping, independent of Category.
- **Partner Document** — a supporting file associated with a partner
  (tax card, credit agreement, NDA, etc.), responsible for its own type
  and, where relevant, expiry tracking.
- **Partner Note** — a timestamped, attributable free-text entry
  associated with a partner, responsible for distinguishing internal-only
  visibility from anything a future portal might expose.
- **Commercial/Credit Profile** — the set of responsibilities covering
  price tier, credit limit, credit terms, and credit status for a
  partner. Treated as a distinct *responsibility area* (see Service
  Boundaries) because it has a different approval chain than the
  partner's core identity, even though it is data held about the same
  partner.
- **Duplicate Candidate** — a detected potential match between two
  partner records (or a new entry and an existing one), responsible for
  holding match evidence until a human decision is made.
- **Merge Record** — the outcome of an executed merge, responsible for
  preserving which records were combined and how conflicts were
  resolved, for traceability.

### Relationships (conceptual)

- A Business Partner holds one or more Partner Roles.
- A Business Partner has zero or more Contact Persons; each Contact
  Person belongs to exactly one Business Partner.
- A Business Partner has zero or more Addresses, Documents, and Notes.
- A Business Partner has zero or one primary Category and zero or more
  Tags.
- A Business Partner has a primary relationship with one Branch (its
  usual servicing branch) while remaining visible and usable across the
  system, consistent with the existing multi-branch architecture.
- A Business Partner may have a responsible Sales Representative — a
  relationship to the existing Staff/IAM domain (FEATURE-001), not
  something this feature owns or redefines.
- A Duplicate Candidate relates two Business Partner records (or one
  incoming, unsaved entry and one existing record) without altering
  either until a merge decision is made.

## 3. Service Boundaries

To avoid a single "Partner Service" that owns everything (a God Service
that would become a bottleneck for every change), responsibilities are
split by *reason to change*:

- **Partner Directory** — owns the partner's core identity, role
  assignment, and lifecycle status. Changes when the definition of "who
  is this partner and what stage/roles are they in" changes.
- **Contact Management** — owns Contact Person records and their
  authority flags. Kept separate because contacts turn over at a
  different pace and by different staff than core partner identity.
- **Address Management** — owns address records and labeling. Kept
  separate because it is logistics/operations-facing rather than
  identity-facing.
- **Commercial Profile** — owns price tier, credit limit, credit terms,
  and credit status. Kept separate specifically because — per
  `00_REQUIREMENTS.md` §11 — credit decisions follow a different
  approval chain (Accounts/Credit Control) than identity or contact
  changes (Sales/Customer Service), and mixing the two would force one
  service (and one set of permissions) to serve two different
  authorities.
- **Document & Notes** — owns attachments and free-text notes, including
  document expiry tracking. Kept separate because this is a generic
  capability that is not conceptually unique to partners and should not
  be entangled with partner-specific logic.
- **Duplicate Detection** — owns match-candidate logic (name similarity,
  tax ID, phone, address matching). Kept separate from Partner Directory
  so matching rules can be tuned independently without risk to the core
  create/update path; Partner Directory *consults* this responsibility,
  it does not own it.
- **Merge** — owns execution of an approved merge (survivor selection,
  conflict resolution, history reattachment). Kept separate from
  Duplicate Detection because *finding* candidates and *executing* an
  irreversible, high-privilege action are different risk profiles
  requiring different authorization.
- **Search & Filtering** — owns the read-optimized lookup experience
  (name/phone/tax-ID search, multi-dimension filtering). Kept separate
  from Partner Directory's write responsibilities so it can evolve
  (performance, matching tolerance) independently of how records are
  created or edited.
- **Import / Export** — owns bulk data movement. Consumes Duplicate
  Detection rather than re-implementing matching logic; does not own
  partner identity itself.

Each of these should be understood as a distinct area of responsibility
with a clear owner and a single reason to change — not necessarily a
one-to-one mapping onto any particular technical structure, which is an
implementation decision outside this document's scope.

## 4. UI Modules

Described functionally — screens and their purpose, not components:

- **Partner Directory** — the main searchable/filterable list, the
  primary entry point for finding an existing partner quickly.
- **Partner Profile** — the single-partner "home" view, organized into
  functional sections: Overview (identity, roles, status, category,
  tags, branch, rep), Contacts, Addresses, Commercial & Credit
  (visibility-restricted), Tax & Compliance, Documents, Notes,
  Activity/Audit history, and a read-only Related Records section
  surfacing linked Quotations/Work Orders/Treasury activity owned by
  other features.
- **Quick-Add** — a lightweight creation path for fast walk-in/phone
  intake, capturing only what's needed to start a relationship.
- **Full Onboarding** — a more complete creation/completion path for
  institutional accounts that need full documentation captured upfront.
- **Duplicate Review** — surfaces detected candidate duplicates for
  staff decision.
- **Merge Wizard** — a guided, controlled workflow for executing a
  merge, restricted to `partners.merge`:
  1. **Select Records** — staff explicitly choose the two (or more)
     records believed to be duplicates.
  2. **Preview** — a side-by-side view of both records before any
     change is made.
  3. **Conflict Resolution** — staff resolve every field where the
     records disagree (per `00_REQUIREMENTS.md` §20 — this must be a
     deliberate decision, not an automatic "most recent wins" rule
     applied blindly).
  4. **Merge** — the decided, surviving record is committed; the other
     record's history (transactions, documents, notes) is reattached to
     it, never discarded.
  5. **Audit Log** — the merge is recorded as an attributable,
     reviewable event — which records were merged, who performed it,
     and how conflicts were resolved.
  No step in this workflow is reversible once "Merge" is executed, which
  is precisely why it is gated behind its own dedicated permission
  rather than ordinary edit rights.
- **Category & Tag Management** — admin screens for defining and
  maintaining categories and tags.
- **Import Wizard** — a staged bulk-import flow: upload, validate,
  preview duplicate candidates, confirm.
- **Export** — a filtered, permission-gated export action available from
  the Directory.

## 5. Permission Matrix

**Approved permission namespace: `partners.*`.** This is a deliberate,
confirmed decision — new permissions for this feature use `partners.*`,
not the existing `customers.*` module. This resolves the naming
ambiguity the earlier version of this document had flagged as an open
item.

| Business Operation | Required Permission |
|---|---|
| View partner list/profile | `partners.view` |
| Create a new partner | `partners.create` |
| Edit core identity, roles, status | `partners.edit` |
| Deactivate / archive a partner | `partners.delete` |
| Manage Contact Persons | `partners.contacts.manage` |
| Manage Addresses | `partners.addresses.manage` |
| Manage Documents / Attachments | `partners.attachments.manage` |
| View commercial/credit information | `partners.credit.manage` (view implied by manage; see note) |
| Change credit limit/terms/status | `partners.credit.manage` |
| Review duplicate candidates | `partners.view` or `partners.merge` |
| Execute a merge | `partners.merge` |
| Manage Categories / Tags | `settings.edit`, pending confirmation — still an open item, see §9 |
| Bulk import | `partners.import` |
| Bulk export | `partners.export` |
| View partner audit/activity history | `partners.view` or a dedicated audit-view permission, pending how audit visibility is generally handled elsewhere in the system |

**Full approved permission set for this feature:**

- `partners.view`
- `partners.create`
- `partners.edit`
- `partners.delete`
- `partners.merge`
- `partners.import`
- `partners.export`
- `partners.credit.manage`
- `partners.contacts.manage`
- `partners.addresses.manage`
- `partners.attachments.manage`

**Note on credit visibility:** the matrix above uses a single
`partners.credit.manage` permission to cover both *viewing* and
*changing* credit information, since the approved permission list does
not include a separate view-only credit permission. Whether viewing and
changing credit information should eventually be split into two
distinct permissions (view vs. manage) remains a legitimate refinement
to consider during implementation, but is not blocked on — the approved
set above is sufficient to build against as-is.

Categories/Tags management and audit-history visibility remain the only
unresolved permission-mapping details, both flagged in §9; neither
blocks starting implementation, since both can reasonably fall back to
existing, already-available permissions (`settings.edit`, `partners.view`)
until a dedicated decision is made.

## 6. Search & Filtering Strategy

- Primary search over name (Arabic and English, tolerant of partial and
  approximate matches), phone number, tax registration number,
  contact-person name, and partner reference.
- Combinable filters across role, category, tag, status, branch, sales
  representative, credit standing, outstanding balance, recency of last
  activity, and tax-exemption status.
- Recently and frequently accessed partners surfaced by default, to
  support fast order-intake workflows.
- Support for saving and reusing common filter combinations.
- Treated as a distinct capability (§3) from the write path, so it can
  be optimized and tuned independently of how records are created or
  edited.

## 7. Import / Export Strategy

**Import is a controlled, staged workflow — not a single bulk-load
action:**

1. **Upload** — staff supply the source data (e.g. an existing
   spreadsheet or export from a prior system).
2. **Preview** — the incoming records are shown before anything is
   committed, so staff can see what will actually happen.
3. **Validation** — each record is checked for completeness and basic
   correctness (per `00_REQUIREMENTS.md`'s required-information
   expectations) before it is considered for import.
4. **Duplicate Detection** — every validated record is checked against
   existing partners using the Duplicate Detection responsibility (§3);
   this step must never be skipped, since uncontrolled import is exactly
   how a partner database accumulates duplicates fastest.
5. **Merge Suggestions** — where a likely match is found, the workflow
   proposes treating the incoming record as an update/merge candidate
   against the existing partner, rather than blindly creating a new one.
6. **Confirmation** — staff make the final, explicit decision per
   ambiguous record (create new / merge into existing / skip) before
   anything is written.
7. **Import** — only confirmed records are committed.

This workflow requires `partners.import` permission end to end. No step
after Upload should be reachable without it.

**Export** is a filtered, permission-gated (`partners.export`), logged
action, serving the legitimate needs already identified (accountant
reconciliation, mailers, management review) without becoming an
ungoverned bulk-data exit point.

Both import and export must respect the same field-level visibility
rules as the rest of the system — an export triggered by a role without
`partners.credit.manage` should not include credit fields, regardless of
what `partners.export` alone would otherwise allow.

## 8. Integration Points

- **Quotations** — a Quotation is created for a Business Partner in any
  role or lifecycle stage (including Prospect), and may reference a
  specific Contact Person as requester or approver. Quotations consumes
  partner data; it does not own or duplicate partner identity or
  commercial data.
- **Work Orders** — reference a Business Partner (including the Internal
  Department role, for internal production work) and may reference a
  Contact Person for proof-approval or completion-notification purposes.
- **Treasury** — reads the partner's Commercial/Credit Profile (limit,
  terms, status) to inform payment recording and outstanding-balance
  tracking. Treasury owns the actual transaction ledger; this feature
  owns only the partner-level credit *policy* — a clear boundary so the
  two features don't both claim ownership of "the truth" about a
  partner's balance.
- **Reports** — consumes partner attributes (role, category, tag,
  status, branch, credit standing) as reporting dimensions; this feature
  should expose partner data in a form Reports can use without needing
  bespoke, partner-specific logic per report.
- **Website (future)** — an inbound integration point only: web-submitted
  inquiries create or match a Business Partner in the Prospect role,
  with lower initial trust than staff-entered data, per
  `00_REQUIREMENTS.md` §24. This is a controlled intake boundary, not
  open access to the full partner model.
- **Customer Portal (future)** — an outbound integration point only: a
  specific, authorized Contact Person is granted scoped access to a
  defined subset of their own partner's data. This feature is
  responsible for keeping a clean separation between internal-only data
  (notes, credit terms, audit history) and portal-eligible data from the
  start, so this boundary does not need to be retrofitted later.

## 9. Risks

- **Permission catalog gap.** Several sensitive operations identified in
  §5 (credit management, merge, bulk import, bulk export) need
  finer-grained permissions than the existing four-action shape
  provides. Left unresolved, these operations would be under-protected
  relative to what `00_REQUIREMENTS.md` actually requires.
- **Cross-feature sequencing risk.** Quotations, Work Orders, and
  Treasury all depend on this feature existing and being stable first;
  starting those before this feature's domain model settles risks
  churn.
- **Scope-creep risk.** The domain is genuinely rich (roles, contacts,
  credit, documents, categories, tags, merge, import/export); without
  disciplined phasing this becomes one large, risky delivery instead of
  a sequence of independently valuable ones.
- **Service-boundary erosion risk.** Without deliberate discipline,
  "just one more field" changes can gradually blur the boundaries
  defined in §3, most likely between Partner Directory and Commercial
  Profile.
- **Data migration risk** (carried over from `00_REQUIREMENTS.md` §23,
  §30): importing existing, informally-kept partner data is likely to
  surface significant duplication and incompleteness.
- **Duplicate-detection tuning risk.** Name-matching across Arabic and
  English is inherently imperfect. Overly aggressive matching creates
  false positives that frustrate staff; overly lenient matching lets
  real duplicates through. This needs deliberate, ongoing tuning, not a
  one-time setup.

## 10. Out of Scope

- The actual Quotations, Work Orders, Treasury, or Reports functionality
  — this feature only defines how partner data integrates with them.
- Purchasing workflow / purchase orders — the Supplier *role* on a
  partner is in scope; the purchasing *process* is a future, separate
  feature.
- Website and Customer Portal implementation — only their integration
  boundaries are anticipated here.
- Any pricing/calculation engine work.
- Automated or machine-learning-based duplicate matching — this phase
  assumes deliberate, rule-based matching only.
- Database schema, API contracts, or UI component design — explicitly
  out of scope for this document.

## 11. Implementation Phases

Each phase is intended to be independently shippable and verifiable,
with its own future `03_IMPLEMENT.md`/`04_VERIFY.md` pass when actually
executed, following this project's established per-feature convention.

1. **Core Partner Identity** — create, view, edit, and list a Business
   Partner with identity, role assignment, lifecycle status, and branch
   association only. No contacts, credit, or documents yet. Unblocks the
   most basic "who do we deal with" need.
2. **Contact Persons** — add Contact Person management to existing
   partners (identity, authority flags).
3. **Addresses & Communication** — multiple addresses and communication
   preferences.
4. **Categories, Tags & Notes** — business-configurable segmentation and
   free-form annotation.
5. **Commercial & Credit Profile** — price tier, credit limit/terms/
   status, and a credit-hold signal other features can later check.
   Deliberately separated (§3) due to its distinct approval chain.
6. **Tax & Compliance + Documents** — tax profile and document
   attachments with expiry tracking.
7. **Search, Filtering & Reporting Readiness** — the dedicated search/
   filter experience across everything built in phases 1–6.
8. **Duplicate Detection & Merge** — deliberately sequenced late, once
   there is real data to detect duplicates within, and because merge is
   the highest-privilege, least-reversible action in this feature.
9. **Import / Export** — built on top of Phase 8, since import must
   reuse duplicate-candidate logic rather than duplicate it.
10. **Integration Enablement** — confirm and stabilize the read/consume
    points Quotations, Work Orders, Treasury, and Reports will need,
    without building those features themselves.

Website and Customer Portal integration are explicitly deferred beyond
this feature's phases entirely — they are future features building on
the boundary this feature establishes.

## 12. Success Criteria

- Staff can find any existing partner within seconds by name (in either
  language), phone, or tax registration number.
- No duplicate partner record is created without staff first being
  warned of a likely match.
- A partner acting as both Customer and Supplier exists as one record,
  not two.
- Institutional partners can hold multiple named contacts, each with
  distinct, recorded approval authority.
- Commercial and credit information is visible only to roles authorized
  to see it.
- Every consequential change (status, credit, merge) is attributable and
  auditable.
- The feature is stable and complete enough that Quotations, Work
  Orders, and Treasury can be built against it without requiring changes
  to its shape.
- Existing partner data can be bulk-imported without producing a wave of
  new duplicates.

---

## Implementation Readiness

**Ready for Implementation.**

The two substantive planning gaps identified in the prior review are now
resolved by approved engineering decisions:

1. **Permission catalog gap — resolved.** The approved permission set
   (`partners.view`, `partners.create`, `partners.edit`,
   `partners.delete`, `partners.merge`, `partners.import`,
   `partners.export`, `partners.credit.manage`,
   `partners.contacts.manage`, `partners.addresses.manage`,
   `partners.attachments.manage`) directly covers every sensitive
   operation the earlier matrix had flagged as under-protected — credit
   management, merge, import, and export each now have their own
   dedicated permission rather than falling back to a generic edit
   right.
2. **`customers.*` vs. `partners.*` naming — resolved.** `partners.*` is
   now the approved namespace for this feature; `customers.*` is not to
   be used for new permissions. §5 has been updated accordingly.
3. **Import and Merge are now defined as controlled workflows, not
   single actions.** Import (§7) and Merge (§4) each now have an
   explicit, ordered sequence — including mandatory validation,
   duplicate detection, and conflict resolution steps — closing what was
   previously only described at the level of intent.

The remaining minor open items (§5's note on Categories/Tags permission
mapping and audit-history visibility) are not blockers: both have a
reasonable, already-available fallback (`settings.edit`, `partners.view`)
to build against, and can be refined without revisiting this blueprint's
structure.

The phase-sequencing coordination note from the prior review still
stands as **ongoing guidance, not a blocker for this feature**:
Quotations, Work Orders, and Treasury should account for this feature's
phased delivery (§11) when their own planning begins, but nothing about
that requires FEATURE-002 itself to wait.
