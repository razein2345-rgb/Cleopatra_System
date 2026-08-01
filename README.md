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

Project scaffolding only — no business logic has been implemented yet.
