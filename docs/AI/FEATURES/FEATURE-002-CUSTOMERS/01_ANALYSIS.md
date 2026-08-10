# FEATURE-002 — Business Partners — Architecture Analysis

> This document evaluates the long-term architecture for managing
> organizations and people in Cleopatra ERP. It builds directly on the
> business requirements discovered in `00_REQUIREMENTS.md` and does not
> revisit or re-derive them. This is a conceptual architecture
> comparison only — it does not describe implementation, storage design,
> or integration surfaces at a technical level.
>
> **This is a green-field decision.** No Customers/Suppliers module
> exists yet in Cleopatra System (`docs/AI/PROJECT_MEMORY.md` confirms
> business modules have not been started). "Migration Complexity" below
> therefore evaluates the cost of *changing course away from* an option
> later, after real data and behavior have accumulated around it — not
> the cost of adopting it now, which is comparable across all three.

---

## The Three Options

**Option A — Customer Entity.** A single, self-contained concept
representing a buyer. Suppliers, if ever tracked, would be an entirely
separate, structurally unrelated concept. Prospects and other partner
types from `00_REQUIREMENTS.md` §3 would need to be represented as
Customer variants or bolted-on adjacent concepts.

**Option B — Business Partner Entity.** A single, unified concept
representing any organization or individual the business deals with,
capable of holding one or more roles (Customer, Supplier, Prospect,
Internal Department, etc.) at once. Contact information is treated as
attributes of the partner itself, without a distinct, independently
managed concept for the people who represent that partner.

**Option C — Business Partner + Contact Person.** The same unified
partner concept as Option B, plus a distinct, first-class concept for
the individual people associated with a partner — each with their own
identity, role/authority within that relationship, and communication
details, related to (not merged into) the partner record.

---

## Comparative Evaluation

| Dimension | A — Customer | B — Business Partner | C — Business Partner + Contact |
|---|---|---|---|
| **Scalability** | Poor — new roles (Supplier) and partner types force parallel structures | Good — new roles attach to an existing partner | Best — scales in both partner-role and contact-complexity dimensions |
| **Simplicity** | Highest — one concept, least to explain | Moderate — one concept, plus the idea of "roles" | Lowest upfront — two related concepts, more to design and explain |
| **Future Supplier Management** | Forces a disconnected, duplicate-prone Supplier concept | Supplier is just another role — no duplication | Same benefit as B, plus procurement-side contacts modeled with the same rigor as sales-side ones |
| **Future Purchasing** | Duplicates most of what Sales already models, against a separate concept | Reuses the same partner concept Sales uses | Same as B, plus supplier-side approval contacts modeled cleanly |
| **Website Integration** | A web inquiry doesn't fit "Customer" cleanly — needs a bolted-on Lead concept and a later conversion step | A web inquiry becomes a Partner with a Prospect role directly — no conversion | Same as B, plus the actual person submitting the inquiry (vs. the organization they represent) is captured correctly from day one |
| **Customer Portal** | No natural place to attach a login — org, not a person | Better than A, but a login still has to attach to the whole partner (one shared identity per organization) | Cleanly supports independent, scoped login per authorized contact — matches the actual business goal in `00_REQUIREMENTS.md` §25 |
| **API Design** *(conceptual)* | Two structurally different integration surfaces eventually needed (Customer-shaped, Supplier-shaped) | One consistent integration surface for all partner data | One core partner surface plus a small, reusable contact concept — both stay simple individually |
| **Search** | Splits across two lists once Supplier exists — same real-world entity may need to be searched for twice | One unified list regardless of role | Same as B, plus "who do I know at this company" becomes a first-class search, not a free-text guess |
| **Duplicate Prevention** | Highest risk — the same entity can silently exist as both a Customer and a Supplier record with no structural link | Structurally safer — one entity, one place for duplicate logic to operate | Same safety as B, plus catches a second, real risk: the same person appearing under two unmerged company records |
| **Accounting** | Dual-role exposure (owed to us / owed by us) is split across two disconnected records | A single partner naturally supports a combined exposure view | Same as B |
| **Treasury** | Same fragmentation risk as Accounting | Coherent, single-counterparty cash-flow view | Same as B |
| **Quotations** | Fits the common case, but doesn't cleanly cover quoting a Prospect who isn't yet a "Customer" | Quotes target any partner at any stage — matches how selling actually works | Same as B, plus records which named contact requested and must approve the quote |
| **Work Orders** | Doesn't cleanly cover internal-use production (Internal Department, §3) without a workaround | Internal work stays visible and reportable through the Internal Department role | Same as B, plus production-relevant contact detail (proof approver, completion notice recipient) available directly |
| **Reporting** | "Total relationship" reporting for a dual-role entity requires manual reconciliation across two lists | One coherent population; role is just a reporting dimension | Same as B, plus representative-to-contact reporting becomes possible |
| **Performance** | Marginally lighter for a small, single-role dataset | Negligible difference at this business's scale | Marginally more to assemble per full profile, but a well-understood, normal pattern at this scale — not a meaningful concern if handled with ordinary care |
| **Security** | Access policy must be defined and kept consistent twice (Customer, later Supplier) | One access-control surface for all partner data | Same as B, plus finer-grained scoping — e.g. a contact's own portal authority independent of the broader partner's commercial data |
| **Maintainability** | Two concepts drift apart over time — inconsistent fields, duplicated rules for anything generic (documents, notes, audit, addresses) | One concept to maintain for everything generic to "any counterparty" | Same benefit as B, with a clean, disciplined boundary between partner-level and contact-level concerns |

---

## Option A — Customer Entity

**Advantages**
- Simplest possible starting point; least conceptual overhead for a team
  with no current supplier-tracking need.
- Fastest to explain to non-technical stakeholders.
- Marginally lighter to work with for a small, single-role dataset.

**Disadvantages**
- Does not fit the business's own documented reality
  (`00_REQUIREMENTS.md` §3): peer printing houses and some companies act
  as both customer and supplier, and this option has no way to represent
  that without duplication.
- Prospects, Internal Departments, and other non-buyer partner types
  identified in requirements don't fit the concept cleanly.
- Directly undermines two requirements already documented as business
  goals: unified duplicate prevention (§19) and future portal access per
  named contact (§25).

**Risks**
- Highest long-term risk of exactly the duplicate-data and fragmented-
  exposure problems `00_REQUIREMENTS.md` §3, §19, and §30 warn about.
- Risk compounds the longer the business operates on this model before
  correcting it — more transaction history becomes entangled with the
  narrower shape.

**Migration Complexity (away from this option, later)**
- High. Once real transaction history, credit terms, and documents have
  accumulated against "Customer" records, introducing a Supplier concept
  and reconciling any entity that plays both roles becomes a genuine
  data-migration project, not a simple extension.

**Future Expansion**
- Poor. Every one of the "future" requirements already documented
  (Supplier unification, Purchasing, Website leads, Customer Portal)
  requires working around this option's core limitation rather than
  building on it.

---

## Option B — Business Partner Entity

**Advantages**
- Directly matches the recommendation already established in
  `00_REQUIREMENTS.md` §3: one record per real-world entity, multiple
  roles.
- Solves the dual-role (customer-and-supplier) problem cleanly.
- Solves the Prospect/website-inquiry problem cleanly — no conversion
  step needed.
- Single, coherent surface for duplicate prevention, search, reporting,
  and access control.

**Disadvantages**
- Without a distinct contact concept, organizational partners are
  pushed toward a single set of contact details, which understates the
  real requirement in §5 — multiple named people, each with a different
  authority level (who can approve a print proof vs. who approves
  payment) — and pushes that complexity onto either the partner record
  itself (fields that don't generalize well) or informal notes.
- Customer Portal access (§25) becomes awkward: a login effectively has
  to represent the whole organization rather than a specific,
  accountable person, which is a poor fit for institutions where
  different staff should have different permissions.

**Risks**
- The temptation to "just add another field" to the partner record for
  each new contact-related need (a second phone number, a second email)
  tends to recreate an unstructured version of the Contact Person concept
  anyway, just without its discipline — a common way this kind of model
  quietly degrades over time.

**Migration Complexity (away from this option, later)**
- Moderate. Introducing a proper Contact Person concept after the fact
  is a real but bounded piece of work — mainly disentangling whatever ad
  hoc contact fields accumulated on the partner record, without the
  deeper problem Option A has (no structural link between roles at all).

**Future Expansion**
- Good for the partner-role dimension (Supplier, Purchasing, Website
  leads all fit cleanly). Weaker for anything that depends on knowing
  *which person* did or is authorized to do something — which
  `00_REQUIREMENTS.md` identifies as a real, near-term need (§5, §25),
  not a speculative one.

---

## Option C — Business Partner + Contact Person

**Advantages**
- Directly satisfies every business requirement in `00_REQUIREMENTS.md`
  that Option B only partially addresses: authority levels per contact
  (§5), scoped future portal access per contact (§25), and
  contact-level duplicate detection (§19, §30) alongside partner-level.
- Keeps two genuinely different concerns — "who is this organization"
  and "who represents it" — cleanly separated, which is what keeps each
  one simple individually even as the system grows.
- Matches the pattern used by mature ERP/CRM platforms for exactly this
  problem (a general, well-proven shape, not a novel risk).
- Scales in both directions requirements are known to grow in: more
  partner roles, and more/richer contact relationships.

**Disadvantages**
- Real, honest upfront cost: two related concepts to design, explain to
  the team, and keep consistent, versus one.
- Slightly more to assemble when presenting a full partner profile
  (partner plus its contacts) than the single-record options.
- Requires early discipline about what belongs at the partner level
  versus the contact level, or the boundary can blur over time.

**Risks**
- If the partner/contact boundary is not clearly defined and followed
  from the start, the team can end up duplicating information across
  both (e.g. a "main phone number" living in both places, drifting out
  of sync) — a discipline risk more than a structural one.
- Marginally higher risk of over-engineering if applied rigidly to
  entities that will only ever be simple individuals with no
  organizational structure (e.g. a walk-in retail customer) — worth
  explicitly allowing a partner to exist with zero or minimal contacts
  rather than forcing contact records where none are meaningful.

**Migration Complexity (away from this option, later)**
- Low. This is already the most complete shape among the three; future
  change is much more likely to be additive (new roles, new contact
  attributes) than structural.

**Future Expansion**
- Best of the three. Every future capability already named in
  `00_REQUIREMENTS.md` — Supplier unification, Purchasing, Website
  leads, Customer Portal, institutional multi-department accounts — is a
  natural extension of this shape rather than a workaround.

---

## Recommendation

**Recommended architecture: Option C — Business Partner + Contact
Person.**

### Justification

This is not a preference for complexity for its own sake — it is the
option that best matches what `00_REQUIREMENTS.md` already established
as real, not speculative, business need for Cleopatra ERP specifically:

1. **The dual-role problem is already documented as a normal case, not
   an edge case.** §3 explicitly identifies peer printing houses and
   companies that act as both customer and supplier. Option A cannot
   represent this without duplication; Options B and C both solve it —
   this alone rules out Option A.

2. **Contact-level authority is already a named requirement, not a
   future nice-to-have.** §5 specifically calls out the need to know
   who can approve a print proof (committing material cost) versus who
   can only place an inquiry versus who approves payment. This is a
   real operational distinction for a printing business — an approved
   proof authorizes production to consume paper, ink, and press time.
   Option B has no clean place to put this; Option C does, by design.

3. **The Customer Portal goal (§25) specifically requires
   person-level, not organization-level, access.** The business
   requirement is that different named people at the same institution
   should be able to have different permissions (view invoices vs.
   approve proofs vs. place orders). This is only cleanly representable
   if a contact person is its own concept with its own identity — Option
   B would force a workaround (shared organizational login, or an
   informal bolt-on) exactly where the business has already said
   individual accountability matters.

4. **Institutional partners in this market genuinely have this
   structure.** Hospitals and large companies commonly have multiple
   departments or cost centers ordering independently under one parent
   relationship (§29). Modeling this well depends on being able to
   represent multiple people/roles under one partner cleanly — which is
   the core of what Option C provides.

5. **Duplicate prevention benefits at two levels, not one.** §19 and §30
   both flag data-quality risk from Arabic/English naming inconsistency.
   Option C allows duplicate detection to operate on both the
   organization (the primary concern) and, secondarily, on people (the
   same named contact appearing under two unmerged partner records) —
   a real, if smaller, version of the same risk.

6. **The added cost is bounded and front-loaded, not compounding.**
   The honest disadvantage of Option C is upfront design and
   explanation cost. But per the Migration Complexity comparison above,
   this cost is paid once, early, while Option A's avoided cost
   compounds — every day of operation under Option A makes the eventual
   correction more expensive, because more transaction history
   accumulates against the narrower shape.

Option B is a legitimate, meaningfully better-than-A middle ground, and
would not be a mistake if the business wanted to defer contact-level
sophistication entirely. It is not recommended here specifically because
`00_REQUIREMENTS.md` already establishes contact-level authority and
portal access as real, current business requirements — not hypothetical
future ones — so choosing B would mean immediately working around a gap
this analysis can already see coming.

One deliberate caution alongside this recommendation: Option C's
contact concept must remain **optional**, not mandatory. A walk-in
individual customer is a complete partner with no organizational
structure and no separate contacts to manage — the architecture should
accommodate that simple case as easily as the complex institutional one,
or the added structure becomes friction instead of value for the
majority of day-to-day, simple transactions this business also handles.

---

## Architectural Decision

**Decision:** Adopt Option C — Business Partner + Contact Person — as the
long-term architecture for managing organizations and people in
Cleopatra ERP.

**Status:**

Approved

### Engineering Decisions

1. The core entity of Cleopatra ERP will be **Business Partner**.

2. A Business Partner may have multiple simultaneous roles. Examples
   include:
   - Customer
   - Supplier
   - Prospect
   - Government
   - School
   - Hospital
   - Printing House
   - Internal Department
   - Future roles

3. Contact Persons are first-class business entities. A Business Partner
   may have multiple Contact Persons. Each Contact Person may have:
   - Name
   - Job Title
   - Phone
   - Mobile
   - WhatsApp
   - Email
   - Preferred Contact Method
   - Approval Authorities
   - Notes

4. Business logic must reference Business Partner rather than Customer
   wherever possible. User interfaces may still present "Customers"
   where appropriate for business users.
