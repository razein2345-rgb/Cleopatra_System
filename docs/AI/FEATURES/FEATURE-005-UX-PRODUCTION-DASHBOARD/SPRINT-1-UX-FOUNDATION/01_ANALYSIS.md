# FEATURE-005 — Sprint 1 (UX Foundation) — Analysis

## How This Reconciles With FEATURE-005's Original M2–M4 Plan

The original `02_PLAN.md` (Milestones, not Sprints) proposed M2
(Production Dashboard + Production Board, with a new
`dashboard-summary` aggregate endpoint), M3 (Smart Forms + Partner
Profile), M4 (search + shortcuts). This sprint's request covers pieces
of all three under a new "Sprint" framing, plus two items the milestone
plan didn't name at all (full Arabic localization, Printing Settings).
Per this session's precedent (FEATURE-005 itself superseded part of
FEATURE-004's deferred M2), **Sprint 1 supersedes the search/dashboard
portions of the original M2/M4** — built here, under this sprint, not
revived separately later. Production Board (a full department-queue
screen with stage-advance actions) and the Partner Profile rework/Side
View host are **not** in this sprint's stated scope (Sections 1–6 above)
and remain deferred, unclaimed by this sprint.

**This sprint also changes M1's own boundary.** M1's `02_PLAN.md`
explicitly said existing pages "keep their current content" in M1 — this
sprint's Section 1 (translate everything) necessarily touches that
content. That's an explicit, deliberate supersession by this request, not
scope creep — noted here so it's not read as contradicting M1's own
verification claims.

## Critical Findings — Requested Capabilities With No Backing Data Source

Per MASTER_PROMPT.md ("Never invent APIs. Never invent database
schema.") and this sprint's own constraints ("Do NOT touch APIs unless
absolutely required," "Do NOT modify the database schema"), the
following requested items were checked against the actual schema and
routes (not assumed) and found to have no real data source. Building
them would require exactly what this sprint forbids. Each is scoped out
of Sprint 1 in `02_PLAN.md`, not silently faked:

1. **"Today's Orders" (Dashboard) / "Orders" (Smart Search)** — `Order`
   has only `GET /api/orders/:id` (single record, FEATURE-003 M2). There
   is no list/create/edit endpoint at all (`00_REQUIREMENTS.md §14` of
   FEATURE-003 names a full Order module as future work). No list means
   no "today's count" and nothing to search.
2. **"Revenue" / "Cash" (Dashboard)** — no Treasury, Payment, or Invoice
   model exists in the schema. There is no financial ledger to read.
3. **"Invoices" (Smart Search)** — no `Invoice` model exists.
4. **"Inventory Alerts" (Dashboard)** — `InventoryItem`/`InventoryUnit`
   exist on `SheetType` but the schema's own comment says `unit` is
   "reserved for future inventory tracking... unused by any calculator."
   No quantity is tracked anywhere; there is nothing to alert on.
5. **"Machines" (Smart Search)** — no `Machine`/equipment model exists.
6. **Barcode / QR / universal Document-Number search** — no field on any
   model stores a barcode or QR value. "Document Numbers" partially
   exists (`Quotation.number`, `Order.number`, `WorkOrder.number` are
   real, human-readable sequence numbers) and is included in Smart
   Search for the entities that have one; a single field that unifies
   *every* document type's number does not exist and isn't invented.
7. **Ink Prices / Finishing Costs (Printing Settings)** — the `Setting`
   model (`apps/api/prisma/schema.prisma:300`) has real fields for
   plate/zinc pricing (`zincPrice`, `envelopeZincPrice`), print-run and
   numbering-run pricing, design pricing, waste (`wasteSheetsDefault`),
   profit margin (`profitPercent`), and board/signage pricing — but no
   field for ink cost or a finishing/lamination/binding cost. There is
   nothing to make editable because nothing is stored.
8. **Per-paper-size Width / Height / Category / Active / Notes / Reorder
   (Printing Settings §"Paper Sizes")** — the closest existing model,
   `SheetType`, stores only `base` (an enum, GAYER/REGULAR), `name`,
   `price`, `unit`. No width, height, active flag, notes, or sort order
   exist on it. `SizeFamilyEntry` (the model that actually represents
   physical cut sizes, e.g. "11×14") has a `sortOrder` field, but it's
   only ever set once at creation (`sizeFamilies.ts` controller appends
   via a row count) — `updateSizeFamilyEntrySchema` doesn't accept it, so
   there is no route that actually reorders entries either. **Correction
   to this document's own first draft**, caught while implementing: the
   field existing on the model is not the same as the capability being
   exposed by the API — Reorder isn't real anywhere in the current
   backend. The request's exact field list (Width/Height/Category/Active/
   Notes) doesn't map onto either existing model.
9. **Toasts / Tooltips (Localization §1)** — no toast library and no
   tooltip component exist anywhere in `apps/web` today (confirmed by
   search — zero hits for `sonner`/`toast`/`Toaster`). There is no output
   to translate. Introducing a toast/tooltip *system* is a UX capability
   addition, not a translation task, and isn't implied by anything else
   in this sprint's stated scope — not built here.
10. **Server-side partner search (Smart Search "Customers"/"Suppliers")**
    — `listBusinessPartners` (`apps/api/src/controllers/
    businessPartners.ts`) returns every non-deleted partner, unfiltered;
    its own comment says search/filtering is explicitly out of scope
    until a later FEATURE-002 milestone. This is not a blocker — the
    existing endpoint already returns the full list, so Smart Search can
    filter it client-side (the same shape `PartnersPage` already fetches)
    — but it means Smart Search's partner results are a client-side
    filter over an unfiltered list, not a server-side search, and won't
    scale past FEATURE-002's own eventual search milestone.

## What Already Exists and Is Directly Reusable (No New API)

- **Cross-department workflow queue, called per department**:
  `GET /api/workflow-instances/queue?departmentId=` requires
  `departmentId` (400 if omitted) — there is no aggregate variant. It
  can be called once per department the signed-in user can access
  (`GET /api/departments` for the list, `canAccessDepartment` already
  scopes which ones apply) and the results merged client-side. This is
  exactly the "pure client-side composition" option `01_ANALYSIS.md`
  (M1's Open Decision #1) already named as viable — chattier than a
  dedicated endpoint, but zero new backend surface, which is the binding
  constraint for this sprint specifically ("unless absolutely
  required" — it isn't, this works). `isDelayed` is already computed
  server-side per item; the Dashboard's Waiting/Active/Delayed cards
  reuse that, they don't recompute it.
- **`GET /api/quotations`** — a real list endpoint (unfiltered by
  status server-side, per FEATURE-003 M1), directly usable for both a
  Dashboard "Quotations" count and Smart Search's Quotations group.
- **`GET /api/ready-products`, `GET /api/services`** — real lists, map
  onto Smart Search's "Products"/"Services" groups directly.
- **Full CRUD already live** for `Setting` (PUT, singleton),
  `SheetType`, `SizeFamily`/`SizeFamilyEntry`, `ReadyProduct`, `Service`
  (`apps/api/src/routes/{settings,sheetTypes,sizeFamilies,readyProducts,
  services}.ts`) — `SettingsPage.tsx` currently only *reads* these
  (Phase 1's own scope: task was explicitly "read-only settings UI").
  Building edit/create/delete forms against these is 100% frontend work
  against endpoints that already exist, enforce `settings.edit`, and
  already soft-delete — no schema or API change needed for Section 3
  wherever the underlying field already exists (see Critical Findings
  #7–8 for the parts that don't).
- **M1's Cleopatra Design System** (`Sidebar`, `Topbar`, `CommandPalette`,
  `NavTree`, `StatusBadge`, design tokens) — Smart Search extends
  `CommandPalette` in place; Dashboard cards are new small Cleopatra
  components following the same wrap-shadcn-in-ERP-props pattern
  `StatusBadge` already established.

## Business Object Architecture Applied

Every new screen in this sprint is a *view* over data that already has a
Business Object and an existing read path — never a new implementation.
Smart Search is one query fan-out over five existing list endpoints, not
a new search index. Dashboard cards are read-only projections of
`Quotation`/`WorkflowInstance`/`StageInstance` state the Workflow Engine
already computes. Printing Settings edits call the same
`Setting`/`SheetType`/`SizeFamily`/`ReadyProduct`/`Service` write
endpoints Phase 1 already built and secured.

## Permission Mapping

No new permission catalog entries.

- Smart Search — each result group only fetches (and only shows) what
  the signed-in user's existing permission already allows
  (`partners.view`, `quotations.view`, `settings.view`,
  `employees.view`); a group is simply omitted if the permission is
  absent, mirroring the Sidebar's own `can()` filtering.
- Printing Settings edit forms — gated on `settings.edit` (already
  required server-side by every write route touched); view-only for
  users with `settings.view` but not `settings.edit`.
- Dashboard's job cards — `work-orders.view` (the same permission the
  underlying queue endpoint already requires) and
  `canAccessDepartment` continues to scope which departments' data is
  even fetched.
