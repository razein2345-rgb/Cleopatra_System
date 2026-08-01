# ADR 0001: Monorepo via npm workspaces

**Status:** Accepted

## Context

The system has three natural pieces that need to evolve together: a REST API, a React frontend, and a set of types/validation schemas both must agree on. Keeping them in separate repositories would force manual version coordination for every shared type change; a single unstructured repo would blur the boundaries between "backend code," "frontend code," and "shared code."

## Decision

Use a single repository with npm workspaces: `apps/web`, `apps/api`, `packages/shared`. No additional monorepo tool (Turborepo, Nx, pnpm workspaces) is introduced — npm's built-in workspace support is sufficient at this project's current size and avoids an extra dependency and its own configuration surface.

## Consequences

- A single `npm install` at the repo root resolves and hoists dependencies for all three packages; a change to `packages/shared` is immediately available to both apps without a publish step.
- Root-level scripts (`build`, `lint`, `typecheck`, `format`) fan out to each workspace explicitly (see root `package.json`), rather than relying on a task-graph tool to infer ordering — acceptable at three packages, worth revisiting (with its own ADR) if the number of packages grows enough that manual ordering becomes error-prone.
- `@cleopatra/shared` is referenced by both apps as `"*"` (workspace-local resolution), never published to a registry.
