# Architecture

Cleopatra System is a commercial Printing ERP built as an npm-workspaces monorepo. This document describes the system as it exists today (Phase 1 complete). It will be extended, not rewritten, as later migration phases add real business logic — see [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for what's still to come and [LEGACY_ANALYSIS.md](LEGACY_ANALYSIS.md) / [LEGACY_MAPPING.md](LEGACY_MAPPING.md) for where each piece comes from.

For the reasoning behind specific choices below, see the [ADR folder](adr/).

---

## 1. System overview

```mermaid
graph LR
    Web["apps/web<br/>React + Vite + TS<br/>Tailwind + shadcn/ui"]
    Api["apps/api<br/>Express + TS (REST)"]
    Auth["Supabase Auth"]
    Db["Supabase Postgres<br/>(via Prisma + pg adapter)"]

    Web -- "REST/JSON" --> Api
    Web -- "sign-in, holds session" --> Auth
    Api -- "verifies JWT via getUser()" --> Auth
    Api -- "Prisma Client" --> Db
```

- **`apps/web`** is a single-page React app. It talks to `apps/api` over REST/JSON, and talks to **Supabase Auth directly** for sign-in (the browser holds the session; the API never sees a password).
- **`apps/api`** is a REST API. It never talks to Postgres directly with raw SQL — all access goes through Prisma. It verifies incoming requests by validating the Supabase-issued JWT (`requireAuth` middleware, Phase 2).
- **`packages/shared`** holds Zod validation schemas and TypeScript types used by _both_ apps, so a field can't drift between what the frontend sends and what the backend expects. It will also hold the ported calculation engine (Phase 4) — see [§5](#5-the-calculation-engine-phase-4).
- Supabase itself provides both the Postgres database and the Auth service; there is no separate self-hosted auth server.

---

## 2. Monorepo layout

```
Cleopatra_System/
├── apps/
│   ├── web/                 React + Vite + TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── ui/       shadcn/ui vendor components — do not hand-edit business logic in here
│   │   │   ├── pages/        one folder per screen/feature area
│   │   │   ├── lib/          fetch wrapper, Supabase client, cn() helper
│   │   │   └── state/        cross-component client state (cart store, Phase 5+)
│   │   └── Dockerfile         multi-stage build → nginx
│   └── api/                 Express + TypeScript REST API
│       ├── src/
│       │   ├── routes/        thin Express routers, one file per resource
│       │   ├── controllers/   request/response handling + Zod validation
│       │   ├── services/      multi-step business logic (introduced as needed, e.g. Phase 6 order finalization)
│       │   ├── middlewares/    auth, error handling
│       │   ├── lib/           Prisma client, Supabase admin client
│       │   ├── config/        environment loading/validation
│       │   ├── utils/         small pure helpers (e.g. Decimal serialization)
│       │   └── generated/prisma/  Prisma Client output — never hand-edit, never commit business logic here
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── Dockerfile
├── packages/
│   └── shared/               Zod schemas + shared types, consumed by both apps
│       └── src/
│           ├── schemas/       one file per domain concept (setting.ts, customer.ts, …)
│           └── calc/          calculation engine (Phase 4 — not yet populated)
├── legacy/                    the original system (read-only, never modified — see below)
├── adr/                       Architecture Decision Records
├── docker-compose.yml
└── {ARCHITECTURE,CODING_STANDARDS,CONTRIBUTING,API_CONVENTIONS,LEGACY_ANALYSIS,MIGRATION_PLAN,LEGACY_MAPPING}.md
```

Each app/package has its own `package.json`, `tsconfig.json`, and `eslint.config.js`. The root `package.json` only holds workspace-wide scripts (`build`, `lint`, `typecheck`, `format`) that fan out to each workspace — see its `scripts` block for the exact commands.

---

## 3. Backend request flow

A typical mutating request (e.g. `PUT /api/settings`) flows as:

1. **Route** (`src/routes/settings.ts`) maps an HTTP verb + path to a controller function. Routes contain no logic.
2. **Controller** (`src/controllers/settings.ts`) parses/validates `req.body` against a Zod schema imported from `@cleopatra/shared`, calls Prisma (directly for simple CRUD, or through a `service` for multi-step operations), and shapes the response as an `ApiResponse<T>`.
3. **Prisma** executes the query against Supabase Postgres over the pooled connection (`DATABASE_URL`, port 6543) using the `@prisma/adapter-pg` driver adapter — see [ADR 0004](adr/0004-prisma-orm.md) for why a driver adapter is required at all (Prisma 7 no longer reads `DATABASE_URL` from `schema.prisma` directly).
4. Money fields come back from Prisma as `Decimal` instances; `serializeDecimals()` (`src/utils/serialize.ts`) converts them to plain `number`s before the JSON response is sent, so API consumers never have to know Prisma's internal numeric type.
5. If anything throws — a Zod validation failure, a Prisma error, anything — **Express 5 automatically forwards the rejected promise** to `errorHandler` (`src/middlewares/errorHandler.ts`), which maps `ZodError` to `400` and everything else to `500`, always in the `ApiResponse` error shape. No manual `try/catch` is needed in controllers for this to work.

Migrations run against `DIRECT_URL` (port 5432, session mode) rather than the pooled `DATABASE_URL`, because DDL statements need a non-pooled connection — configured in `prisma.config.ts`, not in `schema.prisma` (Prisma 7 moved connection configuration out of the schema file entirely).

---

## 4. Data model shape

The full schema lives in `apps/api/prisma/schema.prisma` (single source of truth — this document does not duplicate field lists). The shape follows a small number of consistent, repo-wide rules, decided once in Phase 1 and applied everywhere rather than re-litigated per table:

- **UUID primary keys** everywhere (`id String @id @default(uuid()) @db.Uuid`) — [ADR 0006](adr/0006-uuid-primary-keys.md).
- **Soft delete** (`isDeleted`, `deletedAt`, `deletedBy`) on every independently-addressable business entity; plain child/line-item records (e.g. `OrderItem`, `Payment`) are hard-deleted with their parent — [ADR 0007](adr/0007-soft-delete.md).
- **`branchId` is required, not nullable**, on every branch-scoped table, even though only one branch exists today — [ADR 0009](adr/0009-multi-branch-ready-schema.md).
- **Human-readable sequential document numbers** (`Order.invoiceNumber`, `Quotation.quotationNumber`, `WorkOrder.workOrderNumber`) generated from a `DocumentSequence` counter table, never computed by reading "the last number" in application code — [ADR 0008](adr/0008-document-numbering.md).
- **Money is `Decimal`, never `Float`** — floating-point rounding errors are unacceptable in an invoicing system.
- Several tables exist with schema only and no attached business logic yet: `Quotation`/`QuotationItem`, `WorkOrder`, `TreasuryEntry`, `InventoryItem`/`StockLevel`/`StockMovement`, `Attachment`, `AuditLog`. Each has its own ADR explaining why it was created ahead of its implementation phase.

---

## 5. The calculation engine (Phase 4)

Not yet implemented, but architecturally decided: the entire pricing/calculation engine from the legacy system (`resolveTieredCalc`, `calculateNumberingSheets`, `computeBoards`, and the five per-product calculators) will be ported **verbatim** as pure, side-effect-free TypeScript functions in `packages/shared/src/calc/`. "Pure" means: no database access, no HTTP, no React — just `(input, settings) => breakdown`. This is what makes it possible to:

- Unit-test it against golden-master output captured from the legacy file, with zero infrastructure.
- Call it from `apps/api` (the planned, authoritative execution path — see [ADR 0016](adr/0016-calc-engine-verbatim-port.md)) without duplicating the formulas in a second language or location.

No calculation code exists yet in this repository. `legacy/cleopatra_press_system.html` remains the only working implementation until Phase 4 lands and passes its regression suite.

---

## 6. Authentication & authorization

- **Authentication** is entirely delegated to **Supabase Auth**. `apps/web` calls Supabase's client SDK directly for sign-in; the resulting JWT is attached to every request to `apps/api` as `Authorization: Bearer <token>`.
- `apps/api` never stores or sees a password. `src/middlewares/requireAuth.ts` verifies the bearer token by calling `supabase.auth.getUser(token)` using a service-role Supabase client (`src/lib/supabase.ts`), and attaches the resulting user to `req.user`.
- **Authorization** (Phase 2) is role-based: a `StaffProfile` row (linked 1:1 to a Supabase Auth user via `supabaseUserId`) carries a `role` (`ADMIN`/`STAFF`). Route-level role checks are middleware, not scattered `if` statements in controllers.
- See [API_CONVENTIONS.md](API_CONVENTIONS.md) for the exact header/error-code contract.

---

## 7. Environment & configuration

Each app owns its own `.env` (never committed — see `.gitignore`), documented by a matching `.env.example`:

- `apps/api/.env` — `DATABASE_URL` (pooled, port 6543), `DIRECT_URL` (session, port 5432), `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `CORS_ORIGIN`, `NODE_ENV`.
- `apps/web/.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
- `apps/api/src/config/env.ts` validates `process.env` against a Zod schema at startup and fails fast on a malformed config, rather than surfacing a confusing error deep inside a request handler later.

---

## 8. Deployment shape

Both apps have a multi-stage `Dockerfile`; `docker-compose.yml` at the repo root builds and runs both together (`api` on port 4000, `web` served by nginx on port 8080), with environment variables passed through from the host. Database migrations are **not** run automatically by the container — they are an explicit, reviewed step (`npm run prisma:migrate --workspace=apps/api`) run against the target Supabase project before a new version goes live. This has not yet been exercised end-to-end with real Docker builds in this environment (Docker was not installed during initial scaffolding); the Dockerfiles are written and reviewed but not yet build-tested.

---

## 9. What's deliberately not here yet

To avoid this document going stale the moment Phase 2 starts, it does **not** describe: routing/navigation structure for the web app (no router is installed yet — Phase 5), the order-builder/cart architecture (Phase 5), the calculation engine's internals (Phase 4, see §5), or any printing/PDF architecture (Phase 14). Each of those gets documented — and this file updated — when its phase is implemented, per the process in [CONTRIBUTING.md](CONTRIBUTING.md).
