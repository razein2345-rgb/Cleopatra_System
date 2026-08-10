# FEATURE-002 — Business Partners (Customers & Suppliers) — Business Requirements

## Executive Summary

Cleopatra System needs a single, trustworthy record of every party the
printing house transacts with — not only "customers" in the narrow sense,
but every school, government office, hospital, company, peer printing
house, and prospect the business deals with, some of which act as
customers, some as suppliers, and some as both at different points in
their relationship with the business.

This document recommends replacing the narrow "Customer" concept with a
broader **Business Partner** concept — a single record per real-world
entity, capable of holding one or more commercial roles (Customer,
Supplier, Prospect, Internal Department, etc.) at once. This is the
standard, proven approach used by mature ERP systems for exactly this
situation, and it directly fits how printing houses actually trade: the
same institution is often a customer today, a supplier of overflow
capacity tomorrow, and a prospect before either. Modeling "Customer" and
"Supplier" as separate, disconnected entities would force duplicate data
entry, produce inconsistent records, and make it painful the moment a
Customer starts also acting as a Supplier — which, in this industry, is
not a rare edge case but a normal pattern.

This document is a business requirements discovery only. It intentionally
does not describe how any of this should be built.

---

## 1. Business Goals

- Maintain one trusted, accurate record for every party the business
  deals with, regardless of whether they buy, sell, or both.
- Support informed credit and pricing decisions based on a partner's full
  relationship history, not a fragmented view.
- Support the business's existing multi-branch structure, so a partner
  relationship is understood correctly whether they are served from one
  branch or several.
- Support long-running, seasonal, and tender-driven relationships typical
  of printing (school-year cycles, government tenders, recurring
  corporate stationery orders) rather than only one-off transactions.
- Reduce duplicate data entry, reconciliation errors, and the staff time
  wasted resolving "which record is the real one."
- Provide a foundation that does not need to be redesigned when the
  business later adds a public website or a self-service customer
  portal.
- Give management a reliable view of commercial risk (credit exposure,
  dormant accounts, blocked accounts) at any time.

## 2. Business Actors

- **Sales representative / account manager** — owns the relationship,
  needs full commercial context to sell and negotiate.
- **Customer service / order-intake staff** — needs to find and confirm
  partner details quickly during a live call or walk-in.
- **Credit controller / accountant** — needs visibility into credit
  terms, outstanding balances, and payment reliability.
- **Production planner** — needs delivery addresses, job-specific
  preferences, and urgency/confidentiality flags, but not financial
  detail.
- **Branch manager** — needs a view of their branch's partner
  relationships and performance.
- **Management / ownership** — needs portfolio-level reporting: risk
  exposure, dormant accounts, category performance.
- **The partner itself** — today, passive; in the future, an active
  actor via a self-service portal (see §25).
- **External authorities** (tax authority, auditors) — indirectly
  relevant through tax and compliance documentation held on the partner
  record.

## 3. Types of Partners — and Why "Business Partner" Is the Right Concept

The request to enumerate partner types is itself the strongest argument
for not treating "Customer" as the foundational concept. Consider how
these relationships actually behave in a printing house:

- A **peer Printing House** is very often *both* a customer and a
  supplier of the same business at different times — sending you
  overflow work when their press is down, and receiving overflow work
  from you when yours is. Modeling this as two disconnected records
  (one "Customer," one "Supplier") loses the fact that it's the same
  real relationship, the same contacts, and potentially a running
  balance that should be understood together.
- A **Company** that buys promotional printing from you may also be the
  distributor you buy paper or ink from.
- A **Prospect** who has never bought anything is, commercially, the
  same kind of record as an active Customer — just earlier in its
  lifecycle. Forcing a "conversion" from one entity type to another when
  they place their first order is unnecessary friction and a common
  source of duplicate records.
- A **Government Entity** or **School** may begin as a Prospect (an
  inquiry or tender invitation), become a Customer, and — because public
  and institutional procurement rules often require rebidding — cycle
  back to "inactive" and later "active" again. The relationship record
  should persist through all of this, not be recreated.

**Recommendation:** adopt a single **Business Partner** concept. Every
real-world party — individual or organization — is one record. That
record can carry one or more **roles**: Customer, Supplier, Prospect,
Internal Department, and so on, and roles can be added or removed over
time without creating a new record, losing history, or requiring a
"merge" later. This is not a novel idea — it is the same approach used
by SAP (Business Partner), Odoo (`res.partner`), and Microsoft Dynamics,
precisely because the alternative (separate Customer and Supplier
concepts) breaks down as soon as a real relationship doesn't fit neatly
into one box, which — in printing — is common rather than rare.

The types requested should be understood as **roles or classifications
on a Business Partner**, not as separate entities:

- **Customer** — buys goods/services from the business.
- **Supplier** — provides goods/services to the business (paper, ink,
  plates, outsourced finishing, overflow capacity).
- **Customer & Supplier** — not a distinct type, but the natural
  expression of a partner holding both roles simultaneously.
- **Government Entity** — typically tender-driven, subject to public
  procurement formality, often slower and more bureaucratic payment
  cycles, usually requires strict documentation (tax exemption,
  registration) and may have unique invoicing/withholding requirements.
- **School** — strong seasonality (start-of-year peaks: exam booklets,
  certificates, registration forms), sometimes budget-constrained,
  occasionally needs installment-style payment.
- **Hospital** — recurring forms/records printing, frequently
  confidentiality-sensitive, often routed through a procurement
  department separate from the requesting clinical department, may have
  long internal approval-to-payment cycles.
- **Company** — the broadest commercial category; ranges from small
  businesses ordering basic stationery to large corporates with
  standing branding/print agreements.
- **Printing House (peer)** — as above, a frequent dual-role
  (customer/supplier) relationship built on trade reciprocity and
  overflow-capacity sharing.
- **Internal Department** — not an external party at all, but useful for
  tracking the business's own internal print consumption (e.g. its own
  letterheads, business cards) so internal cost is visible and does not
  contaminate external sales reporting. Should always be clearly
  distinguishable from real customers.
- **Prospect** — has not yet transacted; exists to support the sales
  pipeline and to avoid losing the relationship context gathered before
  a first order.

Partner "Type" should be understood as distinct from partner "Category"
(§14): Type describes *what kind of legal/economic entity* this is;
Category describes *how the business chooses to commercially segment*
its partners. The two answer different questions and should not be
conflated.

## 4. Required Information

- Legal/trade name, in both Arabic and English (documents and invoices
  may need either, and many partners are only ever referred to in one
  language colloquially).
- A short/display name for fast searching and everyday use, since legal
  names are often long.
- One or more partner roles (§3).
- Whether the partner is an individual or a legal entity/organization —
  this affects which fields (tax registration, contact-person structure)
  are meaningful.
- A primary point of contact and a primary address, even before detailed
  contact/address records (§5, §6) are built out.
- Preferred language for correspondence.
- Industry/sector (Education, Healthcare, Government, Retail,
  Hospitality, Printing/Media, etc.) — useful for both production
  planning and commercial segmentation.
- Preferred/home branch, where relevant.
- Date first engaged, and how the relationship originated (referral,
  walk-in, tender, future website inquiry) — feeds sales and marketing
  understanding over time.

## 5. Contact Persons

A single address or phone number is not enough for organizational
partners. Each partner should be able to hold multiple named contacts,
each recording:

- Name and job title/role (e.g. procurement officer, accounts payable,
  design/technical liaison, headmaster/administrator for a school).
- Direct phone/email/WhatsApp, distinct from the partner's general
  contact information.
- Department, where relevant (useful for large institutional partners
  such as hospitals with multiple ordering departments).
- Which contact is the **primary** point of contact.
- The contact's **authority level** — printing specifically requires
  knowing who can approve a design/print proof (committing material
  cost) versus who can only place an inquiry, and who is authorized to
  approve payment. These are meaningfully different responsibilities and
  the business needs to know which is which before committing production
  resources.
- A history of contact changes over time — people change roles or leave,
  but the business needs to know who to speak to *now* while retaining
  continuity of the relationship record.

## 6. Multiple Addresses

Partners commonly need more than one address, each with a distinct
purpose:

- **Billing address** (may be a head office, different from where goods
  are used).
- **Delivery/shipping address(es)** — potentially several, e.g. a school
  with multiple campuses, or a company wanting invoices sent to head
  office but goods delivered to a warehouse.
- **Legal/registered address**, as it appears on tax documents.
- Site addresses for large partners operating from multiple locations.

Each address should record its purpose/label, a full address (including
descriptive/landmark detail, since addressing conventions in this market
are often informal), any special delivery instructions (e.g. "coordinate
with security," "deliveries only before noon"), and which address is the
default for its purpose.

## 7. Communication Methods

- Phone (mobile and landline), WhatsApp (in wide practical use in this
  market for order confirmation and proof approval), email, and fax
  (still used by some government offices).
- A preferred channel and, where relevant, preferred contact hours per
  partner or contact person.
- Marketing communication consent (opt-in/opt-out) — relevant the moment
  the business does any promotional outreach, and increasingly an
  expected practice regardless.
- Preferred language per channel.

## 8. Commercial Information

- Assigned price list, discount tier, or negotiated special pricing
  arrangement.
- Commonly ordered products/services — valuable for proactive sales
  (e.g. knowing a school reliably orders exam booklets every year).
- Typical order frequency and seasonality.
- Any agreed minimum order value/quantity.
- Contract currency — predominantly local currency, but international or
  diplomatic clients may contract in foreign currency.
- Agreed standard lead time, where the business has made such a
  commitment.

## 9. Tax Information

- Tax registration number / commercial registration number.
- VAT registration status and number.
- Readiness for compliant e-invoicing under Egyptian Tax Authority
  requirements — the partner's tax profile needs to be complete and
  valid for this.
- Tax-exemption status, where applicable (common for some government,
  educational, religious, or non-profit entities), backed by a valid
  exemption document (§16).
- Withholding-tax obligations, particularly relevant where a government
  partner also acts as a payer/supplier, since withholding is commonly
  applied on such payments in this market.

## 10. Payment Information

- Accepted payment methods: cash, bank transfer, cheque, installment
  arrangement, and — in the future — online payment.
- Bank account details, where the partner is paid (as a supplier) or
  refunded (as a customer).
- Preferred/agreed payment terms (cash on delivery, net 30, net 60, etc.).
- Deposit/advance-payment requirements — common in printing, where large
  jobs commit significant material cost before completion and an upfront
  deposit is standard practice.
- A visible history of payment reliability, since this directly informs
  credit decisions (§11).

## 11. Credit Policies

- A defined credit limit — the maximum outstanding balance the business
  will carry for this partner.
- Agreed credit terms, in days.
- A clear approval path for extending or raising a credit limit — this
  should never be an informal, undocumented decision.
- A credit hold/block state that prevents new orders once a limit is
  breached, as a matter of business policy, not merely a report someone
  reviews later.
- Grace periods and any late-payment penalty policy, where applicable.
- For higher-risk accounts, provision for guarantees such as post-dated
  cheques — a common credit-control practice among SMEs in this market.
- Different default credit policies by partner type may be warranted
  (for example, Government Entities are commonly slower to pay due to
  bureaucratic cycles, and the business's credit policy should reflect
  that reality rather than apply one blanket rule to every partner type).

## 12. Sales Representatives

- Every partner should have a responsible sales representative or
  account manager, for accountability, commission calculation, and
  relationship continuity.
- The business needs a history of representative assignment, since reps
  change and accounts get reassigned over time — losing that history
  loses useful context.
- Some accounts may reasonably need more than one associated
  representative (e.g. the person who originated the account and the
  person who now actively services it), which has implications for how
  commission or credit is attributed.

## 13. Branch Relationships

- Given the business already operates on a multi-branch basis, a partner
  should be understood as a single, shared relationship — not a
  separate record per branch — with a "home" or usually-serving branch
  noted, while still being able to transact through other branches when
  relevant.
- Modeling partners per-branch would reintroduce the same duplication and
  fragmentation problem described in §3, just along a different axis.
- Reporting still needs to answer branch-specific questions (how much
  business a given branch does with a given partner) even though the
  partner record itself is shared.

## 14. Customer Categories

- Categories are a commercial segmentation the business defines and
  evolves over time — for example VIP/Key Account, Wholesale,
  Retail/Walk-in, Institutional, or Seasonal — distinct from partner
  Type (§3), which describes the kind of entity rather than how the
  business chooses to treat it commercially.
- Categories should be definable and adjustable by business
  administrators as strategy evolves, not fixed in advance.
- A category may reasonably drive default pricing tier, default credit
  terms, or reporting rollups, but should remain a business-configurable
  concept rather than a rigid classification.

## 15. Customer Tags

- Free-form, multiple, lightweight labels for informal, flexible
  grouping that doesn't warrant a formal category — for example "Needs
  Arabic Invoice Only," "Confidential Jobs," "Watch — Slow Payer,"
  "Referral Source," or "Requires Proof Approval Before Print."
- Unlike categories, a partner can carry many tags at once, and tags are
  primarily operational/informational rather than a commercial
  classification used for pricing or credit defaults.

## 16. Attachments

Supporting documents that should travel with the partner record include:

- Commercial registration certificate, tax card, VAT certificate, and
  tax-exemption certificate where applicable.
- Signed credit agreements.
- Confidentiality/non-disclosure agreements, particularly relevant for
  sensitive work such as examination materials or confidential
  government documents.
- Brand/artwork guidelines the partner has supplied.
- Standing purchase orders and significant correspondence.

Time-bound documents (tax cards, exemption certificates) should be
tracked for expiry, so the business is alerted before a document lapses
rather than discovering it has expired when it's needed. Superseding
documents (a renewed tax card, for instance) should replace the active
one while preserving the prior version for record-keeping.

## 17. Notes

- A running, timestamped, attributable log of free-text notes per
  partner — for example preferences ("prefers matte finish"), collection
  history ("promised payment by Thursday"), or relationship guidance
  ("VIP — always confirm with management before quoting").
- Notes should distinguish **internal-only** entries from anything that
  might one day be partner-visible through a future portal (§25);
  internal commentary must never be exposed to the partner.
- Important notes should be easy to keep visible/pinned rather than
  buried under routine entries.

## 18. Customer Status

- A partner's lifecycle should be represented explicitly, at minimum:
  Prospect → Active → Inactive/Dormant → Blocked/Blacklisted, with
  provision for a distinct "Under Credit Review" state.
- Each status should carry clear business meaning for what is and isn't
  permitted — for example, a Blocked partner should not be able to
  receive new quotations without deliberate, authorized override.
- Status changes should always be a deliberate, attributable action —
  who changed it and why — not a silent edit.

## 19. Duplicate Detection

- Arabic/English name variation is a real, material risk in this market
  (transliteration and spelling of the same name can differ across
  entries — e.g. a school name spelled two or three different ways by
  different staff over time) and left unmanaged will degrade data
  quality quickly.
- Detection should consider name similarity (in both languages), matching
  tax registration number (a strong, real-world unique identifier),
  matching phone number, and matching address.
- The business is better served by warning staff **at the point of
  entry**, before a duplicate is created, than by relying on cleanup
  after the fact.

## 20. Merge Rules

- When two records are confirmed to represent the same real-world
  partner, the business needs a safe, deliberate way to combine them:
  a clear rule for which record survives, a defined way to resolve
  conflicting field values, and — critically — every past transaction,
  invoice, and payment must be preserved and correctly reattributed to
  the surviving record, never lost.
- Merging is a business-integrity operation and should be restricted to
  authorized roles, fully attributable, and never allowed to silently
  remove financial history.

## 21. Search Requirements

- Staff need to find a partner quickly during a live phone call or
  walk-in — by name (Arabic or English, partial match), phone number,
  tax registration number, contact-person name, or partner reference.
- Search needs to tolerate the naming variability described in §19
  rather than requiring an exact match.
- Frequently or recently used partners should be easy to get back to
  quickly, since order-intake staff often serve the same repeat
  customers.

## 22. Filtering Requirements

- Staff and management need to filter partners by type, category, tag,
  status, branch, assigned sales representative, credit standing (over
  or near limit), outstanding balance, time since last order (to surface
  dormant accounts), and tax-exemption status — individually and in
  combination.
- Commonly needed filter combinations (for example, "institutional
  accounts currently over their credit limit") should be easy to save
  and reuse rather than rebuilt each time.

## 23. Import / Export

- The business will almost certainly need to bring in existing partner
  records at rollout — from spreadsheets, accountant-maintained lists,
  or informal records kept alongside the legacy system — and this should
  be planned as a core requirement, not an afterthought.
- Imported data should be checked against the same duplicate-detection
  expectations (§19) rather than being loaded blindly.
- Export is needed for accountant reconciliation, physical mailing/
  invoicing runs, management review, and responding to legitimate
  business or compliance requests.
- Because a partner list is a genuinely sensitive competitive asset, who
  is allowed to export it in bulk is a real governance question, not
  just a technical one (see §27).

## 24. Future Website Integration

- A future public website may let prospective clients submit inquiries
  or quote requests. These should be able to become Prospect-type
  partner records automatically, clearly marked as having originated
  online.
- Self-submitted, unverified information should be treated with lower
  initial trust than staff-verified data — for example, credit terms
  should never be automatically granted to a web-submitted prospect.
- The business should be able to recognize a returning inquirer against
  an existing partner record rather than creating a fresh duplicate each
  time (again tying to §19).

## 25. Future Customer Portal Integration

- A future self-service portal would let partners view their orders,
  invoices, and balance, and potentially re-order or approve print
  proofs online.
- This depends on being able to link a specific, authorized contact
  person (§5) to a portal identity — not the partner as a whole — since
  different contacts may reasonably have different allowed actions (view
  invoices, approve a proof, place a new order).
- Anything the portal will eventually show must be clearly separable
  from internal-only information (particularly internal notes, §17, and
  any sensitive commercial or credit information) from the outset.
- This is a future capability; the present requirement is only that
  nothing in the current design should make this harder to add later.

## 26. Audit Requirements

- Creation, status changes, credit-limit changes, merges, and
  deactivation of a partner record should always be attributable (who,
  when) and reviewable.
- Changes to credit limits, tax information, and — especially — bank/
  payment details deserve heightened visibility, since altered payment
  details are a well-known fraud pattern (for example, redirecting a
  supplier's payments to a different account).

## 27. Security Requirements

- Not every staff member needs to see everything on a partner record —
  for example, production staff need delivery details and job
  preferences but have no operational need to see credit limits or bank
  details.
- Sensitive commercial and financial fields (tax ID, bank details, credit
  terms, negotiated pricing) should be visible only to roles that
  genuinely need them, consistent with the business's existing principle
  that access is explicit and role-based, never assumed by default.
- Bulk export of partner data (§23) is itself sensitive and should be
  restricted to authorized roles and logged.
- Some institutional partners (hospitals, government bodies) may carry
  their own confidentiality expectations about how their information is
  handled — worth treating as a contractual and reputational
  consideration, not only an internal policy matter.

## 28. Business Rules

- A partner with any transaction history must never be permanently
  deleted — at most, deactivated or archived, to preserve financial and
  audit integrity.
- A Blocked/Blacklisted partner cannot receive new quotations or orders
  without explicit, authorized override.
- A credit-limit breach should be caught at the point of creating a new
  order, not discovered later when invoicing.
- A partner should have at least one valid contact method before being
  considered fully Active.
- Tax-exempt status must be backed by a currently valid exemption
  document, not merely asserted.
- Merging partners must never result in lost financial history.
- Changing a partner's assigned branch or sales representative should be
  a deliberate, logged action.

## 29. Future Scalability

- The partner model should scale comfortably from today's single-branch,
  moderate partner base to a larger multi-branch — and potentially
  international — operation without needing to be redesigned.
- It should anticipate: more sophisticated pricing agreements (contract
  or volume-tier pricing), partner hierarchies (a large institution with
  multiple ordering departments or cost centers rolling up to one master
  account — common for hospitals and large companies), and future
  integration with external systems such as accounting software,
  government e-invoicing platforms, or marketing/CRM tools.
- Adopting the Business Partner concept now (§3) is itself the
  scalability decision: it is far easier to add a new role to an
  existing, well-established partner record later than to retrofit a
  rigid, Customer-only model after years of data have accumulated around
  it.

## 30. Risks

- **Data quality risk** — without disciplined duplicate prevention from
  day one, the partner database will degrade quickly, undermining
  credit decisions, reporting accuracy, and customer service.
- **Naming inconsistency risk** — Arabic/English transliteration
  variation will actively work against clean search and reporting if not
  deliberately addressed.
- **Credit risk** — without genuinely enforced credit policy, production
  could commit real material cost to an order for a partner already over
  their limit or with a poor payment history.
- **Compliance risk** — incomplete or expired tax and exemption
  documentation could expose the business to penalties, particularly
  under Egypt's e-invoicing requirements.
- **Confidentiality risk** — partner commercial and financial data is a
  genuine business asset; inadequate access control creates both
  competitive and, in some institutional relationships, contractual
  exposure.
- **Change-management risk** — staff accustomed to informal
  spreadsheet- or legacy-system-based tracking may resist a more
  structured process unless it is clearly faster and easier for their
  daily work, not merely "more correct" on paper.
- **Migration risk** — importing existing, informally-kept records is
  likely to surface a significant volume of duplicates and incomplete
  data that needs cleanup before or during rollout.

---

## Open Questions

1. Should the Business Partner (multi-role) model recommended in §3 be
   adopted, or does the business prefer to keep a strict, Customer-only
   scope for this phase and address Supplier unification later?
2. What is the authoritative source of existing partner data today
   (spreadsheets, the legacy system, records kept by the accountant), and
   who owns the effort of cleaning and importing it?
3. Should credit policy differ by partner type by default (for example,
   should Government Entities automatically receive longer payment
   terms than a walk-in company)?
4. Who is authorized to: raise a credit limit, block/blacklist a partner,
   approve a merge of duplicate records, or export the full partner list?
5. Are there existing negotiated or special pricing agreements with
   specific partners today that must be captured during migration, and
   where does that information currently live?
6. Does the business currently track suppliers in any structured way, and
   if so, where — is there existing supplier data that would need to be
   reconciled if Customer and Supplier are unified under one partner
   model?
7. What is the expected timeline and priority for the future website and
   customer portal integrations described in §24–25 — does that affect
   how soon partner records need to be "digital-identity ready"?
8. Do any current institutional clients (hospitals, government bodies)
   carry a formal confidentiality obligation that should shape
   access-control expectations from the outset, rather than being added
   later?
9. What Arabic/English naming convention should be standardized going
   forward, to reduce the ongoing duplicate-detection burden?
10. Should Internal Department partners appear in the same lists and
    reports as real external customers, or always be segregated from
    them?
11. What are the specific e-invoicing and Egyptian Tax Authority
    compliance requirements the business must meet, and on what
    timeline?
12. Is there a minimum set of required documents (tax card, commercial
    registration, etc.) before a partner can be marked fully Active, or
    can an operational relationship begin before full documentation is
    collected?
