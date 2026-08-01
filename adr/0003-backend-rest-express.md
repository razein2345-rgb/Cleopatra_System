# ADR 0003: Express + TypeScript REST API

**Status:** Accepted

## Context

The system needs a server-side API that: authenticates requests, runs the (eventually ported) pricing calculation engine server-side, enforces validation independent of the client, and talks to Postgres via Prisma. Viable alternatives considered: GraphQL (Apollo/Yoga), tRPC (attractive for a TS monorepo's end-to-end type safety), or folding the API into Next.js API routes (which would also mean adopting Next.js for the frontend, superseding ADR 0002's plain Vite choice).

## Decision

Plain **Express 5** with a REST API, following the conventions in [API_CONVENTIONS.md](../API_CONVENTIONS.md).

Reasons this over the alternatives:

- **Over GraphQL:** this system's access patterns are simple CRUD-plus-a-few-domain-actions (finalize an order, convert a quotation), not the kind of deeply nested, client-driven querying GraphQL is designed for. GraphQL's schema/resolver machinery would be net overhead here.
- **Over tRPC:** tRPC's type-safety benefit is real, but it couples the frontend tightly to the backend's TypeScript types in a way that makes it harder to later expose the API to something else (a mobile client, a third-party integration) without a translation layer. A plain REST contract, validated by shared Zod schemas (ADR 0015), gets most of the type-safety benefit tRPC offers while staying a normal, toolable HTTP API.
- **Over Next.js API routes:** would force the frontend framework decision (ADR 0002) to be Next.js specifically, which isn't otherwise motivated — this project has no server-rendering requirement.
- **Express specifically (not Fastify/Koa/Hono):** it's the most widely known Node HTTP framework, minimizing onboarding friction, and Express 5's automatic async-error forwarding (relied on throughout `apps/api` — see [CODING_STANDARDS.md](../CODING_STANDARDS.md#express-appsapi)) removes what used to be Express's biggest ergonomic gap versus the alternatives.

## Consequences

- Every endpoint is a REST resource under `/api`, following [API_CONVENTIONS.md](../API_CONVENTIONS.md) — no ad hoc RPC-style endpoints.
- Controllers can be plain `async` functions with no `try/catch` boilerplate, because Express 5 forwards rejected promises to `errorHandler` automatically — this is Express-5-specific behavior and would need to be re-added manually if the framework were ever swapped.
- If a future consumer (mobile app, partner integration) needs the API, it can consume the same REST contract without any tRPC-style coupling to this repo's TypeScript.
