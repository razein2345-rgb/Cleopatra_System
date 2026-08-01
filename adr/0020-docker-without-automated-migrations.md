# ADR 0020: Docker support without automated migrations in the container

**Status:** Accepted

## Context

The project requires Docker support for both apps. A common pattern is to run `prisma migrate deploy` automatically as part of a container's startup command. For a financial/invoicing system, an automatic, unattended schema migration triggered by a container restart is a risk: a bad migration could run against production data with no human in the loop at the moment it happens.

## Decision

Each app has a multi-stage `Dockerfile` (`apps/web` → nginx serving a static build; `apps/api` → a Node runtime image running the compiled server). `docker-compose.yml` builds and runs both, wiring environment variables through. **Database migrations are never run automatically by either container.** Applying a migration to a target database is an explicit, separate, reviewed command (`npm run prisma:migrate --workspace=apps/api`) run against that specific environment before the corresponding application version is deployed to it.

## Consequences

- Deploying a new version is at least two explicit steps (migrate, then deploy/restart the containers) rather than one, by design — this is the trade-off accepted in exchange for never having a schema change happen silently as a side effect of a container restart or scale-up event.
- The Dockerfiles have been written and reviewed but **not yet build-tested end-to-end**, since Docker was not installed in the environment this migration was scaffolded in (a decision made explicitly with the user rather than silently skipped — see the initial scaffolding conversation). Build-testing them is outstanding work, not a gap this ADR resolves.
- `apps/web`'s Vite build bakes `VITE_*` environment variables in at build time (standard Vite behavior), so its Dockerfile accepts them as build `ARG`s — a different mechanism than `apps/api`'s runtime environment variables, and worth remembering when configuring a deployment pipeline for each.
