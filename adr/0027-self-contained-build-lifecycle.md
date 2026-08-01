# ADR 0027: Self-contained build lifecycle via `prepare`/`postinstall` (Vercel fix)

**Status:** Accepted

## Context

Vercel deployment failed, unable to resolve `@cleopatra/shared` and `../generated/prisma/client.js`. Root-caused by reproducing the failure empirically in a clean environment (all `node_modules`, `dist`, and `apps/api/src/generated` removed, then `npm install` followed by each workspace's own `build` script run in isolation):

- `packages/shared`'s `package.json` points `main`/`types`/`exports` exclusively at `./dist/*`. That directory is only ever produced by manually running `npm run build --workspace=packages/shared` — nothing triggered it automatically. A bare `npm install` left it absent, and any consumer (`apps/api`, `apps/web`) building afterward failed with `TS2307: Cannot find module '@cleopatra/shared'`.
- `apps/api`'s Prisma client is generated into a custom path (`src/generated/prisma`, gitignored) by `prisma generate`, which was likewise never triggered automatically — only ever run manually. A bare `npm install` left it absent, and `apps/api`'s build failed with `TS2307: Cannot find module '../generated/prisma/client.js'`.

Both failures had the same shape: a required code-generation step existed only as a manual, human-run command, correctly sequenced in the root `package.json`'s `build` script (`build:shared && build:api && build:web`) — but nothing guaranteed that sequence actually ran. Vercel (no `vercel.json` exists in this repo) runs `npm install` followed by a single build command scoped to whatever "Root Directory" is configured for a given Vercel project. With no per-package self-sufficiency, a Vercel project scoped to `apps/web` or `apps/api` alone — or even one scoped to the repo root, if the platform's build-command auto-detection didn't land on the exact root script — would hit exactly these two errors, matching what was reported.

This was verified, not assumed: both failures were reproduced with the exact reported error text before any fix was written, and the fix's mechanism (npm lifecycle scripts firing for workspace-linked packages) was independently verified empirically before being relied upon.

## Decision

Two one-line additions, each using npm's own lifecycle-script mechanism so the required generation step fires automatically on `npm install` — regardless of which workspace or subdirectory the platform's build command is scoped to:

- `packages/shared/package.json`: `"prepare": "npm run build"`. npm runs a package's `prepare` script whenever it is installed, including as a workspace-linked local dependency during a root-level `npm install` — confirmed empirically (a clean `npm install` produced `packages/shared/dist` with no other command run).
- `apps/api/package.json`: `"postinstall": "prisma generate"` — Prisma's own documented pattern for serverless/CI deployment. Confirmed empirically the same way (a clean `npm install` produced `apps/api/src/generated/prisma` with no other command run).

## Consequences

- `npm install` alone is now sufficient to make every subsequent build command succeed, whether that's the root-orchestrated `npm run build`, `apps/web`'s own `build` script run in isolation, or `apps/api`'s own `build` script run in isolation — verified for all three in a fully clean environment (no `node_modules`, no `dist`, no generated Prisma client) before this fix was committed.
- This works for Vercel with **zero Vercel-specific configuration** (no `vercel.json` needed) because it fixes the underlying assumption every platform makes — that `npm install` leaves a package in a runnable/buildable state — rather than special-casing Vercel's specific invocation pattern.
- No business logic, pricing calculation, workflow, or database schema was touched — this is exclusively a build-configuration fix, confirmed by the diff touching only two `package.json` scripts (plus the resulting `package-lock.json` metadata update).
- `prisma generate`'s existing standalone script (`npm run prisma:generate`) is unchanged and still useful for explicit local invocation after a schema edit — `postinstall` is a safety net for fresh installs, not a replacement for running it after changing `schema.prisma` mid-session (the generated client is stale until `npm install` or an explicit `prisma generate` runs again).
