# Cleopatra System

Commercial Printing ERP.

## Stack

- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Node.js + Express + TypeScript, REST API
- **Database**: Supabase PostgreSQL, accessed via Prisma ORM
- **Auth**: Supabase Auth
- **Validation**: Zod
- **Tooling**: ESLint, Prettier, Docker

## Repository layout

```
apps/
  web/      React + Vite frontend
  api/      Express backend (REST API)
packages/
  shared/   Types and Zod schemas shared between web and api
```

This is an npm workspaces monorepo.

## Prerequisites

- Node.js >= 20
- npm >= 10
- A Supabase project (URL + anon key + service role key)
- Docker (optional, for containerized run)

## Getting started

1. Install dependencies from the repo root:

   ```bash
   npm install
   ```

2. Copy environment files and fill in your Supabase credentials:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/api/.env.example apps/api/.env
   ```

3. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

4. Run both apps in development:

   ```bash
   npm run dev:api
   npm run dev:web
   ```

   - API: http://localhost:4000
   - Web: http://localhost:5173

## Scripts

| Script              | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev:web`   | Start the Vite dev server                 |
| `npm run dev:api`   | Start the Express dev server (watch mode) |
| `npm run build`     | Build shared, api, and web packages       |
| `npm run lint`      | Lint web and api                          |
| `npm run typecheck` | Type-check web and api                    |
| `npm run format`    | Format the repo with Prettier             |

## Docker

```bash
docker compose up --build
```

See [docker-compose.yml](docker-compose.yml) and each app's `Dockerfile`.

## Status

- **Phase 1** — database foundations, Settings/reference-data CRUD. Done.
- **Phase 2** — Identity & Access Management (Supabase Auth, database-driven
  RBAC, branch access, audit logging, Users/Roles/Permissions UI). Done.
- **FEATURE-002 — Business Partners** (customer/supplier/etc. management),
  **paused after Milestone 6** (priority shifted to FEATURE-003; M7–M14
  remain on the roadmap, not abandoned):
  - M1 Core Partner Record — done
  - M2 Contact Persons — done
  - M3 Addresses — done
  - M4 Categories & Tags — done
  - M5 Notes — done
  - M6 Commercial & Credit Profile — done
  - M7–M14 (Tax, Documents, Search, Duplicate Detection, Merge,
    Import/Export, Integration Enablement) — not started
- **FEATURE-003 — Quotation Engine**, paused after Milestone 2 (priority
  shifted to FEATURE-004; the Pricing Engine remains deprioritized):
  - M1 Quotation Foundation — done (extends the Phase 1 `Quotation`/
    `QuotationItem` schema; no pricing/production yet)
  - M2 Order Conversion — done (`POST /api/quotations/:id/convert`,
    frozen-snapshot Order creation; first-ever Order read endpoint,
    `GET /api/orders/:id` only, no full Order module yet)
- **Security Foundation** — last-active-administrator protection
  (`AdminSafetyService`, ADR 0028) and Row Level Security as
  Defense-in-Depth (explicit deny policies on every table, ADR 0029).
  Done; see `docs/AI/PROJECT_MEMORY.md`.
- **FEATURE-004 — Workflow Engine**, in progress:
  - M1 Workflow Engine Foundation — done. Generic engine only (Templates,
    versioned; Stages with full routing/variables/visibility; Instances/
    StageInstances; department queues with priority/due date/computed
    delay; an independent `WorkflowEvent` feed). `WorkOrder` is the first
    real consumer; its old `productionStatus` is deprecated, not
    removed. No production-specific template, no frontend yet.
- **FEATURE-005 — ERP User Experience & Production Dashboard**, in
  progress, **highest priority** (UX/application-structure, not a
  business feature — no schema/API/business-rule changes):
  - M1 Foundation — done. Design tokens; a two-layer component library
    (`components/ui` shadcn foundation + `components/cleopatra` design
    system); a responsive, collapsible-sidebar App Shell with a
    keyboard-reachable command palette; global, structural Arabic RTL
    (`<html dir="rtl">`, Cairo font). No existing page's content or
    business logic changed.
  - Sprint 1 (UX Foundation) — done, live-verified, closed.
    Full Arabic localization of every screen it touches; a provider-based
    Smart Search (Partners/Quotations/Products/Services today, built to
    add more without touching the component); a widget-registry Dashboard
    (Open Quotations, Active Work Orders, Waiting/Delayed Jobs); a
    category-based Settings (`/settings/:categoryId`) on top of Phase 1's
    already-existing CRUD API; an RTL-first pass converting
    physical-direction CSS to logical properties app-wide. Zero
    `apps/api`/`packages/shared` diff. See
    `docs/AI/FEATURES/FEATURE-005-UX-PRODUCTION-DASHBOARD/
    SPRINT-1-UX-FOUNDATION/` (see `REFINEMENTS.md` for the architecture
    decisions).
  - Sprint 2 (Production Dashboard & Production Board) — done,
    live-verified, closed. One new read-only aggregate endpoint,
    `GET /api/workflow-instances/dashboard-summary` (no schema change);
    `/production-board`, the first real UI over FEATURE-004's Workflow
    Engine, with a department switcher and working Complete/Fail/Skip/
    Edit actions; the Dashboard's widget provider now calls the one
    aggregate endpoint instead of fanning out per department (12 → 1
    network calls), completing all seven of VISION.md's Production
    Dashboard representative views. Zero `VISION.md` changes. See
    `docs/AI/FEATURES/FEATURE-005-UX-PRODUCTION-DASHBOARD/
    SPRINT-2-PRODUCTION-DASHBOARD-BOARD/`.
  - Sprint 2.5 (Production Readiness) — done, live-verified, closed.
    Implements a business-owner-perspective readiness review's highest-value
    findings: customer name / due date / time-in-stage on Production Board
    rows, delayed/urgent row highlighting, a priority/delayed/search filter
    bar, a real mobile card layout (no horizontal scroll), a confirmation
    step before Fail/Skip, manual refresh on both screens, a sidebar
    delayed-job count badge, Dashboard-to-Production-Board click-through
    (Jobs by Department only — see `03_IMPLEMENT.md` for why the other two
    widgets were left non-clickable), and a new read-only, cross-department
    Work Order timeline. Two small additive backend fields, no migration,
    zero `VISION.md` changes. See
    `docs/AI/FEATURES/FEATURE-005-UX-PRODUCTION-DASHBOARD/
    SPRINT-2.5-PRODUCTION-READINESS/`.

See `docs/AI/PROJECT_MEMORY.md` for the authoritative, up-to-date project
state, and `docs/AI/FEATURES/FEATURE-002-CUSTOMERS/` for this feature's
full analysis/plan/implementation/verification trail.
