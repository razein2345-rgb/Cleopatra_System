# Product Vision

Cleopatra System is a Printing ERP first — the first production release exists to run the day-to-day operations of a printing house end to end: pricing, quotations, work orders, production, invoicing, treasury, and customer relationships.

It is designed from the beginning to become a complete, long-term ERP platform, not just an internal management system. Every architectural decision in this document is made so the platform can grow — in business scope, in the number of clients that connect to it, and in the number of organizations that run on it — without ever requiring the core to be rewritten.

---

# Core Principles

These are the permanent architectural principles of Cleopatra System. Every other section in this document is an application of one or more of these principles to a specific area (system design, business modeling, UX, engineering practice). They are stated once, here, and referenced — not redefined — elsewhere.

- **ERP First** — The ERP is the core of the ecosystem. Every other surface (website, portals, mobile apps, AI) is a client of the ERP, never a peer system with its own copy of business logic or data.
- **API First** — Every application, present or future, communicates with the ERP through the official REST API. There is no other integration path.
- **Single Source of Truth** — The ERP database is the only authoritative record of business state. No external system maintains its own copy of business data.
- **Database Isolation** — Only the ERP backend can access the database. No client, integration, or external system connects to it directly, under any circumstance.
- **Reuse Before Create** — Business logic exists in exactly one place. A new feature, module, or business line extends and reuses existing services and entities rather than duplicating them.
- **Feature-Based Development** — Every new capability is implemented as an independent feature, carried through the mandatory lifecycle defined in [Feature Development Standard](#feature-development-standard).
- **Arabic-First UX** — The product experience is designed for Arabic with full RTL support, while the codebase itself remains English.
- **Security by Default** — Authentication, authorization (RBAC), auditing, and validation are mandatory for every business operation. None of these are optional add-ons.
- **Decision-Oriented** — The ERP does not exist only to record business activity. Its ultimate purpose is to improve business decisions. Every reporting, analytics, or advisory capability (see [Strategic Goals & Business Intelligence](#strategic-goals--business-intelligence)) exists in service of this principle, not as a separate concern from day-to-day operations.

---

# System Architecture

The ERP backend is the single point of access to business data and business logic.

- **Official REST API** — All access to ERP data and functionality, from any client, happens through the official REST API. This is the one and only integration surface (see [API Architecture](#api-architecture) for how each client uses it).
- **Database Isolation** — Applying the Core Principle: the database is reachable only from the ERP backend. A future website, portal, mobile app, or integration never opens a database connection of its own.
- **Business Logic Location** — All business logic, calculations, and validation rules live inside ERP backend services. Clients (web UI, portals, mobile apps, website, AI) never implement business logic themselves — they call the API and render or collect data.
- **Internal Services** — The backend is organized as a set of internal services, one per business domain (Business Partners, Quotations, Work Orders, Treasury, and so on), each owning its own data and rules, consumed by the API layer rather than reimplemented per endpoint. See [Modular ERP Philosophy](#modular-erp-philosophy) for how these domains are bounded from one another.

---

# Modular ERP Philosophy

Cleopatra is a modular ERP platform. Every business capability is an independent module, not a feature bolted onto a monolith.

Module categories include:

- CRM
- Printing
- Treasury
- Inventory
- Purchasing
- Accounting
- Marketing
- Photography
- Video Production
- Website Design

(See [Future Business Expansion](#future-business-expansion) for the full, more granular list of planned service lines within these categories.)

Three rules keep modules independent:

- **Modules communicate only through business services.** A module never calls into another module's internals directly — it calls the service that owns that data, the same way an external client would (per [System Architecture](#system-architecture)'s Internal Services).
- **Business logic must never be duplicated.** Applying [Core Principles](#core-principles)'s Reuse Before Create at the module level: a capability needed by two modules is built once, in the module that owns it, and reused — never reimplemented a second time.
- **No module may directly depend on another module's database tables.** This is distinct from — and in addition to — [Core Principles](#core-principles)'s Database Isolation, which governs *external* client access to the database. This rule governs access *between modules inside the backend itself*: even internally, a module reaches another module's data through that module's service, never through a direct table read or join across module boundaries.

---

# Business Architecture

## Business Objects

The ERP is modeled around a small set of core Business Objects, shared by every module and every future client:

- **Business Partner** — Any external party the business deals with (customer, supplier, or another capacity) — a single unified record rather than separate customer/supplier records.
- **Quotation** — A priced proposal for goods or services, prior to commitment.
- **Order** — A confirmed commercial commitment, on which invoicing is based.
- **Work Order** — The production-facing instruction derived from an order, tracked through the shop floor.
- **Invoice** — The financial document billing a partner for an order.
- **Treasury** — The record of money movement (income, expense, transfer) tied to the business's accounts.
- **CRM** — The relationship layer around a Business Partner: contacts, notes, categorization, and interaction history.

These objects, and only these objects, are the vocabulary every future module is built from — see [Future Business Expansion](#future-business-expansion).

Each Business Object is owned by exactly one backend service (per [System Architecture](#system-architecture)) and moves through the system according to [Workflow Philosophy](#workflow-philosophy) and the [Workflow Engine Architecture](#workflow-engine-architecture) that implements it. How that same object is exposed identically to every client is the subject of [Business Object Architecture](#business-object-architecture), directly below.

---

# Business Object Architecture

**Business Objects exist only once. Different applications expose different views of the same object — never a second implementation of it.**

For Business Partner:

```
Business Partner
       ↓
   ERP View
       ↓
Customer Portal
       ↓
   Website
       ↓
 Mobile App
       ↓
Future Integrations
```

One Business Partner record. Every layer above reads and (within its permissions) writes that same record through the official API — none of them holds its own copy.

The same principle applies identically to every other Business Object:

- **Quotation** — one Quotation, viewed by internal staff, the Customer Portal, and any future client, per each viewer's permissions.
- **Order** — one Order, the same way.
- **Work Order** — one Work Order — internally detailed for production staff, summarized (or hidden entirely) for a customer-facing view.
- **Invoice** — one Invoice, the authoritative billing record regardless of which client displays it.
- **Payment** — one Payment record within Treasury, visible to a customer only as confirmation of their own transaction, never as raw treasury detail.

**One Business Object. Multiple Views. Never multiple implementations.** Which fields and actions a given view exposes is governed by [Portal Architecture](#portal-architecture)'s permission-based visibility, not by a second, parallel copy of the object.

---

# Workflow Philosophy

Every business document in Cleopatra ERP follows a workflow — a sequence of stages a record passes through from creation to completion.

A representative example:

```
Lead
  ↓
Quotation
  ↓
Approval
  ↓
Order
  ↓
Work Order
  ↓
Production
  ↓
Quality Control
  ↓
Delivery
  ↓
Invoice
  ↓
Payment
  ↓
Archive
```

Two rules govern every workflow in the system:

- **Workflow must remain configurable.** The stages above are an example, not a hard-coded pipeline. Different document types, branches, or business lines may define different stages or skip stages that don't apply to them.
- **Business logic must never assume a fixed workflow.** Services validate and act on the *current stage* of a record, not on an assumption of which stage came before or which comes next. Hard-coding a specific sequence into business logic is exactly the kind of duplication and rigidity the [Core Principles](#core-principles) exist to prevent.

How this configurability is actually implemented — a generic Workflow Engine, not a status field per module — is described next.

---

# Workflow Engine Architecture

Cleopatra ERP is driven by a generic **Workflow Engine**, not hardcoded status fields scattered across business modules.

Key principles:

- **Every business process is driven by workflow templates.** A workflow template defines the ordered stages a document type moves through (see [Workflow Philosophy](#workflow-philosophy) for the representative example).
- **Business modules never hardcode workflow stages.** A module's business logic acts on "the current stage," supplied by the Workflow Engine — it never encodes a specific sequence of stages itself.
- **Workflow templates define the lifecycle.** Changing how a process flows means changing its template, not changing code in the module that owns the underlying Business Object.
- **Business Objects remain unchanged** whichever workflow template governs them — a Quotation is still a Quotation whether it follows the Printing Workflow or a future Marketing Workflow.
- **Only workflow templates differ**, per business line:
  - Printing Workflow
  - Marketing Workflow
  - Photography Workflow
  - Video Editing Workflow
  - Website Design Workflow
  - Future Services

**Future modules must integrate into the Workflow Engine instead of creating independent process logic.** A new business line does not get its own bespoke status system — it gets a new workflow template, expressed in the same engine every other module already uses, per [Core Principles](#core-principles)'s Reuse Before Create.

**Cleopatra ERP must never assume that every product follows the same production process.** Offset Printing, a Ready Product bought from an external supplier, and a future Marketing Campaign have nothing in common operationally — they only share the same engine underneath. The sections below elaborate the Workflow Engine's concrete shape; this remains architecture, not an implemented module — see [Feature Development Standard](#feature-development-standard) for how it eventually gets built, one milestone at a time, like every other feature in this system.

---

# Workflow Templates

Every business activity is attached to a Workflow Template, which defines its complete production lifecycle end to end. A template is data, not code — creating a new business line means authoring a new template, never writing a new status system (see [Workflow Extensibility](#workflow-extensibility)).

Representative templates:

- Offset Printing
- Digital Printing
- Ready Products
- External Manufacturing
- T-Shirt Printing
- Acrylic Signs
- Brass Door Plates
- Stamps
- Marketing Campaigns *(future)*
- Graphic Design *(future)*
- Video Production *(future)*

---

# Workflow Stage Configuration

A Workflow Template consists of multiple ordered stages. Each stage carries its own configuration — the Workflow Engine reads this configuration to decide what a stage requires and where a record goes next; nothing about it is inferred by business-module code:

- Stage Name
- Department (see [Department-Based Workflow](#department-based-workflow))
- Assigned Employee
- Status
- Estimated Duration
- Required Files
- Required Approval
- Required Cost Entry
- Required Time Tracking
- Internal or External (see [External Supplier Workflow](#external-supplier-workflow))
- Optional or Mandatory
- Can Skip
- Next Stage
- Failure Stage

The engine controls movement between stages from this configuration alone. Business logic must never hardcode production steps — the same discipline [Workflow Philosophy](#workflow-philosophy) already establishes for document-level stages applies identically at the production-stage level.

---

# Department-Based Workflow

The production queue is department-driven, not a single flat work-order list. Each department sees only the stages assigned to it — an employee never browses all work orders, only the work currently sitting in their own department's queue.

Representative departments:

- Sales
- Design
- Offset Printing
- Digital Printing
- Plate Preparation
- Finishing
- Warehouse
- Purchasing
- External Supplier
- Delivery
- Customer Service
- Marketing *(future)*

A stage's `Department` field (see [Workflow Stage Configuration](#workflow-stage-configuration)) is what routes it into the right queue — department scoping is a property of the stage, not a separate access-control system layered on top.

---

# Representative Workflow Examples

These illustrate the shape a Workflow Template takes — concrete instances of [Workflow Templates](#workflow-templates), not an exhaustive or final list. New templates (or edits to these) are an administrator authoring data, never an engineering change (see [Workflow Extensibility](#workflow-extensibility)).

**Offset Printing:**

```
Quotation → Customer Approval → Design → Plate Preparation → Paper Preparation
  → Offset Printing → Numbering (Optional) → Finishing → Quality Check
  → Delivery → After Sales Follow-up
```

**Digital Printing:**

```
Quotation → Customer Approval → Design → Digital Printing
  → Finishing (Optional) → Quality Check → Delivery → After Sales Follow-up
```

**Ready Products are not inventory-only** — each ready product may define its own workflow, since "ready" describes the catalog, not a uniform fulfillment process:

- **Stamp**: `Quotation → Customer Approval → Design → Send Artwork to External Supplier → Receive Product → Quality Check → Delivery`
- **Brass Door Plate**: `Quotation → Collect Customer Text → Determine Size → Determine Options → Send to External Supplier → Receive Product → Quality Check → Delivery`
- **Acrylic Sign**: `Quotation → Customer Approval → Design → Print White-backed Vinyl → Send Vinyl to Acrylic Workshop → Cut Acrylic → Apply Vinyl → Receive Product → Quality Check → Delivery`
- **T-Shirt**: `Quotation → Customer Approval → Design → Prepare Garment → Print → Quality Check → Delivery`

---

# External Supplier Workflow

Some production stages are performed outside the company (see the Stamp, Brass Door Plate, and Acrylic Sign examples above). The Workflow Engine must support External Supplier stages as first-class stages — external work behaves exactly like an internal workflow stage everywhere it participates in the engine (routing, required approvals, department queues), not as a special case bolted on beside it.

An external stage tracks:

- Supplier
- Sent Date
- Expected Return Date
- Actual Return Date
- Responsible Employee
- External Cost
- Supplier Status
- Notes
- Attachments

---

# Supplier Service Costing

Every External Supplier stage (see [External Supplier Workflow](#external-supplier-workflow)) already tracks `External Cost` as a single figure. That figure is the outcome of a costing model, not an arbitrary number — the model itself belongs in the architecture even though it is not implemented yet:

**Cost to the business** = Supplier Cost + Transportation Cost + Employee Handling Cost

**Price to the customer** = Cost to the business + Profit Margin

- **Supplier Cost** — what the external supplier actually charges for the work (Stamp, Brass Door Plate, Acrylic Sign, or any future externally-sourced line).
- **Transportation Cost** — moving material or product to and from the supplier.
- **Employee Handling Cost** — the internal labor spent coordinating, inspecting, and managing the external stage — never assumed to be zero just because the work itself happens outside the building.
- **Profit Margin** — applied the same way it already applies to internally-produced work, per [Strategic Goals](#strategic-goals)'s Monthly Profit goal — external sourcing is priced with the same discipline as production, never treated as a pass-through cost.

This model feeds pricing the same way every other cost input does — through the Quotation/Order pricing that already exists (see [Business Objects](#business-objects)), never as a parallel pricing path for externally-sourced items. **Not implemented now.** Recorded here so `External Cost` (and the External Supplier Workflow it lives in) is designed for this breakdown from the start, rather than needing a later rework — the same "prepare, don't implement" discipline as [SLA & Time Tracking](#sla--time-tracking) and [Workflow Automation](#workflow-automation). [External Manufacturing Profitability Analysis](#external-manufacturing-profitability-analysis) is the reporting layer built on top of this model.

---

# Workflow Visibility

The same workflow is viewed differently depending on who's looking, per [Business Object Architecture](#business-object-architecture)'s "one object, multiple views" rule — a Work Order is never duplicated into an internal copy and a customer copy.

- **Production employees see**: internal stages, costs, materials, machines, internal notes.
- **Customers see**: design approval, order status, delivery status — never internal workflow detail.

Which fields and stages a given view exposes is governed by [Portal Architecture](#portal-architecture)'s permission-based visibility — the same mechanism already used elsewhere (e.g. FEATURE-003's Quotation `canSeeInternal` pattern), not a second visibility system invented for production stages specifically.

---

# Workflow Automation

A future capability, attached to workflow stages rather than to individual modules — an automation rule configured once on a stage applies to every template that uses that stage, the same reuse discipline as the rest of the engine:

- Automatic assignment
- Automatic reminders
- Deadline alerts
- Escalation rules
- Supplier notifications
- Customer notifications
- WhatsApp updates
- Email notifications

Not built yet — recorded here so it is designed for, not retrofitted, when the engine itself is built (the same "prepare, don't implement" discipline as [Future Reminder Engine](#future-reminder-engine)).

---

# Workflow Extensibility

Administrators must be able to create new Workflow Templates — new stages, new departments, new external-supplier steps — without changing application code. A new business line (Laser Cutting, Wood Engraving, Canvas Printing, Packaging, Photography, Video Editing, Marketing Campaign, Website Development, and whatever comes after) is a new template authored through configuration, never a new bespoke module.

**Every future business module — Printing, Creative Services, Marketing, Retail, Manufacturing, and the Customer Portal alike — operates through this same configurable Workflow Engine.** Business logic exists only once; workflow behavior is what stays configurable. This is what makes the Workflow Engine the operational heart of Cleopatra ERP, not a feature belonging to Printing alone.

---

# Dynamic Workflow Engine

Sharpening [Workflow Engine Architecture](#workflow-engine-architecture)'s core rule into its strictest form: **the Workflow Engine must never contain hardcoded business logic for a specific business line.** Every workflow is generated from a configurable template, never from a code path written for that business line.

Offset Printing, Digital Printing, Ready Products, External Manufacturing, Marketing Services, Photography, Video Production, and every future service **must all use the same engine.** Only the workflow template changes between them. The engine itself never changes.

If adding a business line ever requires touching the engine's own code rather than authoring a new template, that is a design failure to correct, not a one-off exception to accept.

---

# Workflow Versioning

Workflow Templates must support versioning — publishing a new version of a template must never reach back into work already in flight.

- **A running Work Order continues using the template version it started with**, unaffected by later template edits.
- **A new Work Order automatically uses the newest published version** at the moment it's created.
- **Workflow template updates must never modify running jobs.** Editing "Offset Printing v3" into existence does not change what "Offset Printing v2" means for the job that's already mid-Plate-Preparation under it.

This is the same non-destructive versioning discipline FEATURE-003 already established for Quotations (a new version is a new row; the prior version is never overwritten) — applied here to templates instead of documents, for the same reason: a process that's already running must stay predictable regardless of what changes after it started.

---

# SLA & Time Tracking

Each workflow stage should eventually support, in addition to [Workflow Stage Configuration](#workflow-stage-configuration)'s existing `Estimated Duration`:

- Expected Duration
- Actual Duration
- Started At
- Finished At
- Delayed Flag
- Delay Reason

**Not implemented now.** Recorded here so the stage configuration shape is designed for it from the start, rather than needing a later rework — the same "prepare, don't implement" discipline as [Workflow Automation](#workflow-automation) and [Future Reminder Engine](#future-reminder-engine).

---

# Production Dashboard

The future Production Dashboard must never contain business logic. It is only a visualization layer over Workflow Engine data — every number it shows is a read of state the engine already tracks, never a parallel calculation of its own.

Representative views:

- Jobs waiting
- Jobs in progress
- Delayed jobs
- Jobs by department
- Jobs by operator
- Supplier delays
- Daily production

If the Dashboard ever needs a number the Workflow Engine doesn't already expose, the fix is to have the engine track and expose that data — never to have the Dashboard compute it independently.

---

# Queue Philosophy

Departments never manually search for work. Each department owns a queue, and an employee simply works from the next available item in their department's queue — the queue is the entire interface between an employee and their work, not one option among several ways to find it.

Representative queues:

- Design Queue
- Plate Preparation Queue
- Printing Queue
- Numbering Queue
- Finishing Queue
- Delivery Queue
- Supplier Queue

This is [Department-Based Workflow](#department-based-workflow)'s queue-per-department model stated as the operating discipline it implies: a department's queue is the only place its employees look for work.

---

# No Workflow Duplication

Restating [Workflow Extensibility](#workflow-extensibility)'s integration rule as its own explicit constraint: **every future business module must integrate into the Workflow Engine. No module may create its own production pipeline.**

Printing, Marketing, Graphic Design, Photography, Video Editing, Packaging, and every future service must all use the same Workflow Engine — never a bespoke, module-specific process implementation living beside it.

---

> **The Workflow Engine is the operational heart of Cleopatra ERP.**
>
> Pricing decides what should be produced.
>
> The Workflow Engine decides how it will be produced.
>
> The ERP records every business event.
>
> The Dashboard visualizes those events.
>
> Every future module must integrate into this architecture instead of creating independent workflows.

---

# Customer Lifecycle

A Business Partner is not only "a customer." Every Business Partner moves through a complete lifecycle, from first contact through to long-term relationship — or loss and recovery.

A representative example:

```
Lead
  ↓
Prospect
  ↓
Qualified
  ↓
Quotation
  ↓
Negotiation
  ↓
Won Customer
  ↓
Repeat Customer
  ↓
VIP Customer
  ↓
Loyal Customer
  ↓
Inactive
  ↓
Reactivated
```

The lifecycle is governed by the same rule as every other business process in the system: it is a [Workflow Engine Architecture](#workflow-engine-architecture) template, not hardcoded business stages. It must remain configurable, and business logic must act on a Business Partner's current lifecycle stage, never assume a fixed sequence of stages — exactly as [Workflow Philosophy](#workflow-philosophy) requires for any business document.

The current implementation's `PartnerStatus` (Prospect / Active / Inactive / Blocked) is a simplified subset of this envisioned lifecycle, not the final model — reconciling the two, and making the full lifecycle configurable, is future work, not a redesign owed to this document.

---

# Marketing Funnel

Before a Business Partner exists in the ERP at all, they typically pass through a marketing funnel. The ERP must be capable of tracking that complete funnel, not just the moment a Lead is created.

Typical stages:

```
Awareness
  ↓
Interest
  ↓
Consideration
  ↓
Intent
  ↓
Evaluation
  ↓
Purchase
  ↓
Retention
  ↓
Loyalty
  ↓
Advocacy
```

Like the [Customer Lifecycle](#customer-lifecycle) it feeds into, the funnel is a template, not a hardcoded pipeline — it should become configurable by administrators, per [Workflow Engine Architecture](#workflow-engine-architecture). This is not implemented now; only the architecture must not prevent it later.

---

# CRM Philosophy

The Business Partner module **is** the CRM module — not a separate system that happens to reference the same partner. There is one Business Partner record ([Business Object Architecture](#business-object-architecture)); CRM is the set of relationship-management capabilities built around it.

Future CRM capabilities include:

- Lead Management
- Sales Pipeline
- Follow Ups (see [Follow-Up Philosophy](#follow-up-philosophy))
- Meetings
- Phone Calls
- WhatsApp Conversations
- Emails
- Tasks
- Reminders (see [Future Reminder Engine](#future-reminder-engine))
- Sales Opportunities (see [Sales Opportunity](#sales-opportunity))
- Lost Reasons
- Win Reasons
- Customer Satisfaction
- Referral Tracking

These capabilities arrive in future milestones. **The current implementation must not block them** — no design decision made now may assume a Business Partner has at most one deal, one contact channel, or one point of engagement.

---

# Marketing Leads

Extending [CRM Philosophy](#crm-philosophy)'s Lead Management capability: the CRM must support field marketing, not only inbound leads. A future Marketing Lead captures:

- Customer Name
- Company Name
- Address
- Phone Numbers
- Industry
- Contact Person
- Lead Source
- Current Status
- Interested Products
- Notes
- Assigned Sales Representative

**A Lead is not yet a customer.** It moves through the same progression [Customer Lifecycle](#customer-lifecycle) already defines — Lead → Prospect → Quotation → Customer — ending as the same Business Partner, per [Business Object Architecture](#business-object-architecture)'s "one object, never a second implementation" rule. **The CRM must support the complete transition without data duplication**: a Lead becoming a Customer is the same underlying record moving through lifecycle stages, never a copy from a separate Leads table into a separate Customers table.

---

# Sales Opportunity

A future Opportunity belongs to a Business Partner, the same way Contacts, Addresses, and Notes already do.

A single Business Partner may have, at the same time:

- Multiple Opportunities
- Multiple Quotations
- Multiple Orders
- Multiple Projects

**Do not assume one active project per partner.** Anything built against a Business Partner — now or later — must treat these relationships as unlimited, not one-to-one, the same way [Business Architecture](#business-architecture)'s existing Business Objects already do.

---

# Follow-Up Philosophy

The ERP must remind employees automatically, rather than relying on staff to remember.

Representative examples:

- Customer has not replied.
- Quotation expires soon.
- Customer usually reorders after X days.
- Annual contract renewal.
- Warranty expiration.
- Maintenance reminder.
- Birthday greeting.
- Holiday greeting.
- No purchase for N months.

This reminder engine will be implemented later, as the [Future Reminder Engine](#future-reminder-engine) described next. The current architecture must remain compatible with it — nothing built now may assume a Business Partner's activity is only ever staff-initiated.

---

# Future Reminder Engine

The Reminder Engine should eventually generate reminders from multiple sources, not just one module:

- CRM
- Orders
- Invoices
- Payments
- Projects
- Marketing
- Production
- Maintenance
- Customer Lifecycle

**The Reminder Engine must never be coupled to a single module.** Like the [Workflow Engine Architecture](#workflow-engine-architecture) it parallels, it is a shared, generic capability that every module feeds into and consumes from — not a feature owned by CRM alone.

---

# Customer Retention

Future analytics will include:

- Purchase Frequency
- Average Order Value
- Lifetime Value
- Last Purchase Date
- Predicted Next Purchase
- Churn Risk
- Customer Score
- Loyalty Level

**Do not add these calculations now.** They are derived, read-only views over data the ERP already owns (orders, invoices, payments) — ensuring future compatibility means not designing those underlying records in a way that would make these calculations impossible or require duplicating the data elsewhere.

---

# Printing Business Intelligence

Because this ERP is specialized for printing houses, future analytics should include:

- Frequently Ordered Products
- Seasonal Products
- Estimated Reorder Date
- Customer Printing History
- Favorite Paper Types
- Favorite Finishing
- Favorite Sizes
- Favorite Quantities
- Most Profitable Customers
- Most Active Customers
- Lost Customers
- Recovered Customers

**Do not implement now.** As with [Customer Retention](#customer-retention), this is future reporting over data the ERP already captures through Orders and Work Orders — not a reason to add new fields or a parallel data model today.

---

# Strategic Goals & Business Intelligence

The ERP is not only for managing today's work — it must continuously help management reach long-term business goals, the operational counterpart to [Long-Term Goal](#long-term-goal)'s customer-facing outcomes. This is intelligence layered over data the ERP already captures through normal operation (per [Printing Business Intelligence](#printing-business-intelligence)'s "reporting, not a parallel data model" rule) — nothing here proposes new fields, endpoints, or schema.

## Strategic Goals

The system should support creating measurable business goals such as:

- Monthly Revenue
- Monthly Profit
- Monthly Sales
- Number of New Customers
- Customer Retention
- Production Capacity
- Machine Utilization
- Average Delivery Time
- Customer Satisfaction
- Marketing Conversion Rate

**Goals must never be hardcoded — goals are configurable.** Different companies may define different goals, the same "configuration over hardcoded values" discipline [Engineering Standards](#engineering-standards) already requires everywhere else.

## ERP Advisor

The ERP should evolve into a business advisor, not only a reporting surface — it should analyze data and recommend business decisions, not just display them.

Future examples:

- When sales exceed current production capacity, recommend hiring another operator.
- When machine utilization reaches a defined threshold, recommend purchasing another machine.
- When outsourcing costs exceed owning a machine, recommend buying that machine.
- When customer growth increases, recommend expanding departments.
- When workload consistently exceeds employee capacity, recommend hiring.
- When a machine remains idle, recommend redistributing production.
- When one workflow becomes a bottleneck, recommend improving that department (a [Workflow Engine Architecture](#workflow-engine-architecture) stage, in that vocabulary).

The ERP must eventually become capable of making management recommendations using real operational data. **Recommendations are suggestions only — management always makes the final decision.**

## Department Growth Recommendations

Naming [ERP Advisor](#erp-advisor)'s department- and headcount-related recommendations as their own capability, since they recur across every business line, not only Printing: when a [Department](#department-based-workflow)'s queue consistently exceeds its capacity — measured the same way [Production Dashboard](#production-dashboard) already reports jobs waiting and jobs in progress — the ERP should recommend growing that department, whether by hiring, adding a machine, or redistributing work from another department.

**Growth recommendations are per department, not a single company-wide suggestion.** A Design department running at capacity and a Finishing department sitting idle call for different recommendations, evaluated independently, even inside the same company. [AI Marketing Advisor](#ai-marketing-advisor) applies this same discipline specifically to the [Internal Marketing Department](#internal-marketing-department).

## Budget-Aware Planning

Future planning must always consider available cash, business budget, current workload, ROI, priorities, and production demand.

The ERP should eventually rank recommendations by priority rather than list them unordered. Instead of presenting "Buy Machine A / Hire Designer / Buy Printer" as an unranked list, it should recommend them as Priority 1 / Priority 2 / Priority 3, according to business impact and available budget.

## Marketing Budget Recommendations

Extending [Budget-Aware Planning](#budget-aware-planning) to Marketing specifically: future marketing spend recommendations — how much to allocate to a campaign, a channel, or the [Internal Marketing Department](#internal-marketing-department) as a whole — must be ranked and bounded by the same available cash, ROI, and priority discipline Budget-Aware Planning already requires for every other recommendation, never a separate marketing budget process invented on the side.

A marketing budget recommendation is only ever a recommendation — the same governance as [ERP Advisor](#erp-advisor): management makes the final call.

## AI Marketing Advisor

A specialization of [ERP Advisor](#erp-advisor) focused on Marketing: the same "analyze data, recommend decisions, never decide automatically" discipline, applied to marketing spend, campaigns, and growth instead of production capacity. It is not a separate advisory system — it reads the same operational data (Orders, Work Orders, the [Marketing Funnel](#marketing-funnel), the [Internal Marketing Department](#internal-marketing-department)'s own workload) through the same REST API every other client uses, per [AI Architecture](#ai-architecture).

The capabilities below — [Marketing Opportunity Detection](#marketing-opportunity-detection), [Capacity-Aware Marketing](#capacity-aware-marketing), [Business-Line Growth Recommendations](#business-line-growth-recommendations), [Campaign Recommendations](#campaign-recommendations), and [Marketing Budget Recommendations](#marketing-budget-recommendations) — are what the AI Marketing Advisor produces. None of them are implemented now; they are recorded so the underlying data (Orders, Work Orders, Workflow Engine stage data, Strategic Goals) is captured in a shape that supports them later, the same "prepare, don't implement" discipline used throughout this document.

## Marketing Opportunity Detection

The AI Marketing Advisor should eventually surface opportunities the business would otherwise miss, using data the ERP already owns rather than a separate market-research input:

- A [business line](#future-business-expansion) with declining orders, worth a targeted campaign.
- A department with spare capacity (see [Capacity-Aware Marketing](#capacity-aware-marketing)) that marketing could fill with demand.
- A customer segment (per [Printing Business Intelligence](#printing-business-intelligence) and [Customer Retention](#customer-retention)) whose reorder pattern suggests they're due, and receptive to being reached.
- A seasonal pattern in past orders that a campaign should anticipate rather than react to.

Every opportunity is a read of existing operational history — never a new external data source bolted onto the ERP to make this work.

## Capacity-Aware Marketing

Marketing must never be recommended in isolation from production reality. Before recommending a campaign or a growth push, the AI Marketing Advisor checks the same [Department-Based Workflow](#department-based-workflow) queue and [Production Dashboard](#production-dashboard) data [ERP Advisor](#erp-advisor) already reads for its own capacity recommendations:

- **Departments with spare capacity** are good candidates for demand-generating campaigns.
- **Departments already at or over capacity** should not be handed more demand by a campaign until [Department Growth Recommendations](#department-growth-recommendations) has been acted on — recommending more sales than the business can fulfill is not a useful recommendation.

This is the same capacity discipline [ERP Advisor](#erp-advisor) already applies to hiring and machine purchases, applied one step earlier — to whether more demand should be generated at all.

## Business-Line Growth Recommendations

The AI Marketing Advisor should eventually recommend which [future business line](#future-business-expansion) — Graphic Design, Branding, Motion Graphics, Video Editing, Photography, Website Design, Social Media Management, or whichever module is active for a given deployment — is worth growing next, based on real demand and profitability signals rather than intuition:

- Order volume and profit margin per business line (per [Printing Business Intelligence](#printing-business-intelligence)'s "Most Profitable Customers" discipline, applied per line instead of per customer).
- Capacity headroom in the departments that line depends on (see [Capacity-Aware Marketing](#capacity-aware-marketing)).
- How the line performs against its own [Strategic Goals](#strategic-goals), where one is defined.

**A business-line recommendation is never a reason to build a business line that doesn't exist yet.** This capability recommends where to invest marketing and growth effort among lines the business already offers, per [Modular ERP Philosophy](#modular-erp-philosophy) — it does not imply the ERP decides to launch new modules on its own.

## Campaign Recommendations

A future campaign recommendation combines four inputs the ERP already has reason to track, never a fifth, invented one:

- **Workload** — the [Internal Marketing Department](#internal-marketing-department)'s own current queue, so a recommended campaign is one the department can actually execute.
- **Utilization** — spare capacity in the production departments a successful campaign would ultimately feed, per [Capacity-Aware Marketing](#capacity-aware-marketing).
- **Demand** — signals from [Marketing Opportunity Detection](#marketing-opportunity-detection) and the [Marketing Funnel](#marketing-funnel).
- **Strategic Goals** — whether the campaign moves a defined goal (per [Strategic Goal Integration](#strategic-goal-integration)), not just whether it's plausible in isolation.

Like every other advisory capability in this document, a campaign recommendation is a suggestion for management to approve — the [Internal Marketing Department](#internal-marketing-department) still authors and runs the campaign itself through the normal [Workflow Engine](#workflow-engine-architecture) (a Marketing Campaign workflow template, per [Workflow Templates](#workflow-templates)).

## Internal Marketing Department

Marketing is modeled as a real internal [Department](#department-based-workflow) — already named among Representative Departments as a future addition — not only as external channels (see [Marketing Integration](#marketing-integration)). As a department, it owns a queue like any other:

- Campaigns move through a **Marketing Campaign** workflow template (see [Workflow Templates](#workflow-templates) and [Workflow Engine Architecture](#workflow-engine-architecture)) — the same generic engine every other department's work runs through, never a bespoke marketing process living beside it (per [No Workflow Duplication](#no-workflow-duplication)).
- The department's own workload and utilization are what [Capacity-Aware Marketing](#capacity-aware-marketing) and [Campaign Recommendations](#campaign-recommendations) read before recommending new campaigns — the advisor must know how busy Marketing itself is, not only how busy the departments it feeds are.
- Like every department, its growth (more marketing staff, more tooling) is a candidate for [Department Growth Recommendations](#department-growth-recommendations), evaluated with the same capacity evidence as any other department.

Not implemented now — recorded so [Department-Based Workflow](#department-based-workflow)'s existing "Marketing *(future)*" entry has a concrete shape to grow into.

## External Manufacturing Profitability Analysis

Applying [Printing Business Intelligence](#printing-business-intelligence)'s "reporting over data already captured" discipline to externally-sourced work: once [Supplier Service Costing](#supplier-service-costing) is in place, the ERP should be able to report, per supplier and per externally-manufactured product line (Stamps, Brass Door Plates, Acrylic Signs, and any future External Manufacturing line):

- Actual margin realized after Supplier Cost, Transportation Cost, and Employee Handling Cost.
- Which externally-sourced lines are worth continuing to outsource versus bringing in-house — the same comparison [ERP Advisor](#erp-advisor) already names ("when outsourcing costs exceed owning a machine, recommend buying that machine"), now backed by the actual cost breakdown instead of an aggregate estimate.
- Supplier performance (delay patterns, from the [External Supplier Workflow](#external-supplier-workflow) fields already tracked) alongside their cost, so a cheaper supplier that is chronically late is evaluated as the trade-off it actually is, not on cost alone.

Not implemented now — this is future reporting over [Supplier Service Costing](#supplier-service-costing) and [External Supplier Workflow](#external-supplier-workflow) data, not a reason to add new fields beyond what those two already define.

## Future AI Decision Support

Future AI modules should analyze Sales, Production, Marketing, Treasury, Inventory, Profit, Growth, Customer behavior, Supplier performance, Machine utilization, and Department performance — the same operational data the [ERP Advisor](#erp-advisor) and [Strategic Goals](#strategic-goals) above already describe, one step further toward automation. [AI Marketing Advisor](#ai-marketing-advisor) is the first concrete specialization of this — the Marketing dimension named above, given its own architecture rather than left as a single bullet.

**The AI should recommend actions, never execute them automatically — human approval is always required.** Any such module remains bound by [AI Architecture](#ai-architecture)'s existing governance (REST API only, RBAC-respecting, audited, no bypassing business validation) — decision support is a new *capability* built on that access model, not an exception to it.

## Strategic Goal Integration

No recommendation described in this section — from [ERP Advisor](#erp-advisor) to [AI Marketing Advisor](#ai-marketing-advisor) to [Future AI Decision Support](#future-ai-decision-support) — is generated in isolation from [Strategic Goals](#strategic-goals). A recommendation must be traceable to the goal it serves: a campaign recommendation exists because it moves a defined revenue or growth goal; a department growth recommendation exists because capacity is blocking a goal the business has actually set, not because a metric merely looks high.

**Where no Strategic Goal is defined for a given area, the ERP should say so rather than recommend anyway.** Recommending against an undefined goal is guessing, not advising — the same honesty this system already requires of itself when data is genuinely missing rather than merely unbuilt.

This is the final governing rule over every advisory capability in this document: human approval per [ERP Advisor](#erp-advisor) and [AI Architecture](#ai-architecture) decides *whether* to act; Strategic Goal Integration decides *whether the recommendation was worth making at all*.

---

# Marketing Integration

Future Marketing modules will use the same Business Partner — never a duplicated customer database.

Examples of future channels:

- Email Campaigns
- SMS Campaigns
- WhatsApp Campaigns
- Facebook Ads
- Google Ads
- Social Media Campaigns
- Retargeting
- Audience Segmentation

**No duplicated customer database is ever allowed.** This is [Core Principles](#core-principles)'s Single Source of Truth, applied to Marketing the same way it already applies to every other future client in [API Architecture](#api-architecture) — a Marketing module is a consumer of the one Business Partner record, not a second copy of it.

---

# Long-Term Goal

Cleopatra ERP should eventually help the company:

- Acquire customers
- Convert customers
- Serve customers
- Retain customers
- Recover customers
- Grow customer value

This is achieved through one unified Business Partner model, per [Business Object Architecture](#business-object-architecture). **Never duplicate customer information across future modules** — every capability described above (Marketing Funnel, CRM, Sales Opportunities, Retention, Marketing Integration) is a different lens on the same Business Partner record, not a different customer database.

---

# Portal Architecture

Cleopatra ERP is one system with multiple audience-specific views onto it, not one system per audience.

- **Internal ERP** — The full-featured workspace used by staff, with visibility governed entirely by RBAC.
- **Customer Portal** (future) — Customers view and act on their own business outcomes only (see [Customer Experience](#customer-experience)).
- **Future Supplier Portal, Designer Portal, Marketing Portal** — Each is a different audience-specific view over the same underlying Business Objects, added as the business needs them.

The governing rule is [Business Object Architecture](#business-object-architecture)'s **same object, different views**, applied specifically to portals. What changes per portal is:

- **Customer restrictions** — what a customer may see and do with their own records.
- **Internal restrictions** — what internal roles may see and do, per RBAC.
- **Permission-based visibility** — every portal and every role is a permission scope over the same object model, not a separate data model.

---

# API Architecture

```
Customer
    ↓
Website
    ↓
REST API
    ↓
Cleopatra ERP
    ↓
Database
```

The REST API is, and will remain, the only way anything outside the ERP backend reaches ERP data or logic. This applies uniformly to every current and future client:

- Company Website
- Customer Portal
- Mobile Applications
- Sales Representative App
- Future AI (see [AI Architecture](#ai-architecture))
- Future third-party integrations and automation services
- WhatsApp / chat integrations
- Online payment providers
- Shipping providers

Online orders submitted from the website (or any future client) must enter the ERP as proper business documents — a Quotation or a Work Order, per the [Workflow Philosophy](#workflow-philosophy) in effect — automatically, without manual re-entry.

**Everything communicates only through the REST API. The database is never exposed**, applying [Core Principles](#core-principles)'s Database Isolation to every client without exception.

---

# User Experience (UX)

Cleopatra's UX philosophy is a modern, workspace-oriented application — closer in spirit to tools like Notion and Linear than to a traditional page-by-page enterprise system, while remaining a professional ERP interface, not a general-purpose productivity tool.

Concretely, this means navigation, workspace layout, and view composition are treated as first-class architecture, not incidental UI detail:

- How a record is opened and how the user gets back to where they were — see [Multi View System](#multi-view-system).
- How staff move through their day inside the ERP — see [Employee Experience](#employee-experience).
- How the same underlying screens serve different audiences — see [Customer Experience](#customer-experience) and [Portal Architecture](#portal-architecture).

This section is intentionally the single place these ideas are introduced; the sections above and below apply them without repeating them.

---

# Multi View System

Every record in the ERP can be opened in more than one way, without the underlying screen being implemented more than once:

- **Full Page** — the record's complete, dedicated page.
- **Side View** — the record opened alongside the current context, without leaving it.
- **Modal** — a focused, temporary view for a quick look or a quick edit.
- **New Tab** — the record opened in parallel with the user's current work.

All four are different *presentations* of the same single React component, not four separate implementations. **No UI is ever duplicated to support a different presentation mode** — this is [Component Architecture](#component-architecture)'s "never duplicate" rule applied specifically to how a record is opened.

---

# Employee Experience

Internally, Cleopatra ERP is built for staff productivity, all day, every day. The guiding principles:

- **Fast Navigation** — moving between records and modules is immediate, not a sequence of full page loads.
- **Context Preservation** — switching to look at something else doesn't lose what the user was doing (see [Multi View System](#multi-view-system)).
- **Workspace Tabs** — multiple records can be open at once, the way a professional works across multiple documents.
- **Minimal Reloads** — the application behaves like a workspace, not a stack of separately-loaded pages.
- **Keyboard Friendly** — frequent actions are reachable without reaching for the mouse.
- **Professional ERP Experience** — fast and modern, but built for the seriousness and precision of running a real business, not a casual consumer app.

---

# Customer Experience

Customers, wherever they interact with Cleopatra (today: nowhere directly; in the future: the [Customer Portal](#portal-architecture)), interact only with **business outcomes** — the state of their own quotations, orders, and deliveries — never with how the business produces those outcomes internally.

A customer never sees:

- Costs
- Margins
- Production details
- Machines
- Internal notes
- Internal workflow stages
- Employees
- Suppliers
- Treasury
- ...and any other internally-scoped data, by default

This is enforced the same way every other visibility rule in the system is enforced: permission-based visibility over the same underlying objects (see [Portal Architecture](#portal-architecture)), not a separate, weaker copy of the data.

---

# Component Architecture

Every screen in Cleopatra ERP is composed from reusable components — screens are assembled, not individually hand-built.

The following are never duplicated across the application:

- Forms
- Tables
- Dialogs
- Search
- Filters
- Side Panels
- Tabs

**Business logic belongs to Services** (per [System Architecture](#system-architecture)'s Business Logic Location principle). **UI components display and collect data — they do not decide business rules.** A component that needs to enforce a business rule calls a service through the API; it does not encode the rule itself.

---

# Engineering Standards

These are the permanent, non-negotiable engineering rules for building on Cleopatra ERP:

- Never duplicate business logic.
- Never duplicate business entities.
- Never bypass the REST API.
- Never access the database outside the backend.
- Every operation is auditable.
- Every feature respects RBAC.
- Prefer configuration over hardcoded values.
- Soft delete first — records are deactivated, not destroyed, unless there is an explicit, deliberate reason otherwise.

## Security

- **The system must never allow the last active Administrator to be
  orphaned out of existence.** Deactivating, deleting, blocking,
  archiving, or stripping the last active holder of `ADMIN`/`SUPER_ADMIN`
  of their administrator role is always rejected — `409 { code:
  'LAST_ACTIVE_ADMIN' }` — regardless of which operation triggered it.
- **Every operation that can orphan the system this way must go through
  `AdminSafetyService`** (`apps/api/src/services/adminSafety.ts`) —
  never a re-implemented headcount check. This applies to every current
  operation (Deactivate, Delete, Remove Admin Role) and every future one
  (Block, Archive, and whatever comes after). See ADR 0028.
- `AdminSafetyService` is also the one place that records the audit trail
  for a rejected security-relevant attempt (`SECURITY_REJECTION`) — a
  future security-reporting feature reads this without any caller having
  had to remember to log it.
- Frontend UI may hide or disable actions it already knows are impossible
  (a UX convenience), but the backend service is always the sole source
  of truth and always re-validates — the UI check is never a substitute
  for the server-side one.

## Database Security

- **PostgreSQL is never considered a public API.** The database is an
  implementation detail of the ERP backend, not a service other clients
  talk to — regardless of what Supabase makes technically reachable by
  default.
- **Supabase Authentication may be used.** It owns credentials, sessions,
  and JWT issuance (ADR 0005/0021) — this is the one Supabase surface the
  frontend talks to directly.
- **Supabase Storage may be used**, once adopted, for file blobs — a
  storage bucket is not the same surface as a business-data table, and
  adopting Storage later does not imply direct table access is also fine.
- **Supabase Realtime may be used**, once adopted, strictly as a
  notification/refresh signal — never as the transport for business data
  itself, which still flows through the REST API.
- **Business data must never be accessed directly from the frontend**
  (ADR 0030). No `supabase.from(...)` table query, no direct PostgREST
  call, from any client — this was true in practice since Phase 1
  (verified empirically: the frontend's only Supabase calls are `.auth.*`)
  and is now enforced at the database layer too (see below), not just by
  convention. Permanent and client-agnostic: a future Customer Portal,
  Mobile App, Website, AI agent, or third-party integration follows the
  exact same rule as every client today.
- **Every business operation must pass through the ERP REST API.** This
  is the same "Never bypass the REST API" rule above, restated for the
  database specifically: there is no secondary path into business data
  that skips Express.
- **Authorization belongs to the ERP Service Layer.** `StaffProfile` →
  `UserRole` → `Role` → `RolePermission` → `Permission` (ADR 0022),
  enforced by `requirePermission()` middleware and service-layer business
  rules (e.g. `AdminSafetyService`) — this is where "who can do what" is
  decided, in full, independent of anything the database layer does or
  doesn't enforce.
- **Row Level Security exists only as a Defense-in-Depth layer.** Every
  application table has RLS enabled with an explicit, named deny policy
  for `anon`/`authenticated` (ADR 0029) — this closes the direct-PostgREST
  exposure that RLS-disabled tables otherwise leave open to any holder of
  the public anon key. It is a second, independent barrier, not the
  mechanism deciding who can do what.
- **RLS must never replace ERP authorization.** No RLS policy may ever
  encode a business rule (branch scoping, role checks, ownership) as a
  substitute for the service layer — if a table ever needs
  narrower-than-deny-all access from a non-backend caller, that policy is
  a second enforcement of a rule the service layer already enforces, not
  the sole place that rule lives.
- **This is now a mandatory rule, not a recommendation:**

  > Every new application table MUST enable Row Level Security.
  > Every backend-only table MUST receive the standard
  > `backend_only_deny_direct_access` policy.
  > No application table may be considered complete without this
  > requirement.

  See MASTER_PROMPT.md's Database Checklist — every feature that
  introduces a new table finishes with this requirement checked, not
  assumed. `_prisma_migrations` is the one deliberate, named exception
  (Prisma's own internal bookkeeping table, not an application table).
- **Database Isolation remains a core architectural principle.** Every
  business module's data lives behind its owning module's service layer,
  reachable only through the API — the database-security rules above are
  this same principle applied at the Postgres-role boundary, not a new,
  separate one.

---

# Feature Development Standard

Every feature follows the same mandatory lifecycle, without exception:

1. **Requirements** — what is needed and why.
2. **Analysis** — how it fits the existing business and technical model.
3. **Planning** — the concrete implementation plan.
4. **Implementation** — the actual build, against the approved plan.
5. **Verification** — real verification that the feature works, against the running system.
6. **Documentation** — the feature's own record of what was built and why.
7. **Changelog** — a durable record of what changed.

This is not aspirational — it is the standard already in active use for every feature under `docs/AI/FEATURES/`, one numbered document per lifecycle stage.

---

# Feature Evolution Policy

No feature is considered permanently complete. A feature's initial delivery is the start of its lifecycle, not the end of it.

- **Features evolve through milestones.** A feature grows by adding milestones (each carried through the [Feature Development Standard](#feature-development-standard) lifecycle), not by being redone from scratch.
- **Existing modules should be extended rather than rewritten.** New requirements are, by default, evidence that a module needs to grow, not evidence that it was built wrong.
- **Backward compatibility should always be preserved whenever possible.** Consumers of a module — other modules, clients, integrations — should not break because that module evolved.
- **Breaking architectural changes require a new ADR.** A change that cannot preserve backward compatibility is a deliberate architectural decision, and is recorded as one (see the project's `adr/` decision log), not made silently inside a routine feature change.

The objective: future AI assistants — and future engineers — extend the platform instead of replacing previously implemented features.

---

# Scalability

Cleopatra ERP is architected to grow along four independent axes, without rewriting business logic for any of them:

- Single Branch → Multiple Branches
- Single Company → Multiple Companies
- Single Country → Multiple Countries
- Single-Tenant → Future SaaS

Each axis is a matter of scoping and configuration on top of the same object model and the same services (per [Core Principles](#core-principles)'s Reuse Before Create) — never a fork of the business logic.

---

# AI Architecture

AI is treated as just another ERP client — nothing more, nothing less.

- AI never talks to the database.
- AI uses the REST API, exactly like every other client (see [API Architecture](#api-architecture)).
- AI respects RBAC — an AI acting on behalf of a user can only do what that user is permitted to do.
- AI respects Audit Logging — every action AI takes is recorded like any other action.
- AI cannot bypass business validation — the same service-layer rules apply, whether the caller is a person or an AI.

---

# Offline Strategy

Cleopatra ERP is Online First.

Offline synchronization is intentionally outside the current architecture — it is not a gap to be quietly filled later inside the existing design, but a deliberately excluded concern. If offline support is ever required, it should be treated as its own project, with its own analysis of the conflict-resolution and sync implications, rather than retrofitted piecemeal.

---

# Future Business Expansion

Cleopatra ERP is intentionally designed as a modular platform (see [Modular ERP Philosophy](#modular-erp-philosophy)). The first production release focuses on Printing Operations; future modules extend the same platform into a complete Creative Agency ERP.

Planned future modules include:

- Graphic Design
- Branding
- Logo Design
- Social Media Design
- Motion Graphics
- Video Editing
- Photography
- Videography
- Marketing Campaign Management
- Social Media Management
- Advertising Management
- Content Creation
- Website Design
- Customer Portal
- Mobile Applications

Every one of these reuses the same core, per [Core Principles](#core-principles)'s Reuse Before Create — none of them introduces a parallel copy of:

- Business Partner (see [Business Architecture](#business-architecture))
- Quotation
- Work Order
- Treasury
- CRM
- Reporting
- RBAC
- Notifications
- The API Layer (see [API Architecture](#api-architecture))

Each new module integrates into the existing [Workflow Engine Architecture](#workflow-engine-architecture) via its own workflow template, rather than introducing independent process logic.

**No future module duplicates existing ERP logic.** The ERP remains the single source of truth for every business activity, printing or otherwise.

---

# Roadmap

| Phase | Focus |
|---|---|
| **Phase A** | Business Partner Management, Quotations, Work Orders, Production Workflow, Invoicing, Treasury |
| **Phase B** | Inventory, Purchasing, Supplier Management, Accounting, Reports & Dashboards |
| **Phase C** | Customer Portal, Company Website Integration, Mobile Applications, Online Payments, Shipping Integration, WhatsApp Integration |
| **Phase D** | Multi Company, Business Intelligence, AI Assistant, Workflow Automation, Public API |

---

# Definition of Success

Cleopatra System should be able to run an entire printing house without relying on external software.

Every operation — from receiving an online order, through pricing, production, invoicing, payment, and reporting — must be managed inside Cleopatra ERP.

The system should remain modular, maintainable, scalable, and easy to extend for many years.
