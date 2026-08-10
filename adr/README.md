# Architecture Decision Records

This folder records the significant architectural decisions made on Cleopatra System, in the standard lightweight ADR format: **Status**, **Context**, **Decision**, **Consequences**.

## Why

Code and even [ARCHITECTURE.md](../ARCHITECTURE.md) show _what_ the system looks like today. They don't reliably show _why_ it looks that way, or what alternatives were considered and rejected. An ADR captures that reasoning at the moment the decision was made, so a future contributor doesn't have to reverse-engineer intent from a git blame — or worse, accidentally undo a deliberate decision because its rationale wasn't written down anywhere.

## When to write one

See [CONTRIBUTING.md § When to write an ADR](../CONTRIBUTING.md#when-to-write-an-adr).

## Format

Copy this template into a new file:

```markdown
# ADR NNNN: Title

**Status:** Accepted | Proposed | Superseded by ADR NNNN | Deprecated

## Context

What problem or question forced this decision? What constraints applied?

## Decision

What was decided, stated plainly.

## Consequences

What this makes easier, what it makes harder, and what it explicitly rules out.
```

## Numbering

Sequential, zero-padded to 4 digits, never reused: `0001-title-in-kebab-case.md`. Once a number is assigned, it's permanent — a superseded decision gets a new ADR that says "Supersedes ADR 0003," rather than editing or renumbering the old one.

## Index

| #                                                   | Title                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| [0001](0001-monorepo-npm-workspaces.md)             | Monorepo via npm workspaces                                              |
| [0002](0002-frontend-stack.md)                      | React + Vite + TypeScript + Tailwind + shadcn/ui                         |
| [0003](0003-backend-rest-express.md)                | Express + TypeScript REST API                                            |
| [0004](0004-prisma-orm.md)                          | Prisma ORM with driver adapter against Supabase Postgres                 |
| [0005](0005-supabase-auth.md)                       | Supabase Auth for authentication                                         |
| [0006](0006-uuid-primary-keys.md)                   | UUID primary keys for every entity                                       |
| [0007](0007-soft-delete.md)                         | Soft delete for business entities                                        |
| [0008](0008-document-numbering.md)                  | Sequential, per-branch, human-readable document numbering                |
| [0009](0009-multi-branch-ready-schema.md)           | Multi-branch-ready schema from day one                                   |
| [0010](0010-independent-quotation-workorder.md)     | Independent Quotation and Work Order entities                            |
| [0011](0011-treasury-auto-posting.md)               | Automatic Treasury posting from invoice payments                         |
| [0012](0012-inventory-schema-reserved.md)           | Inventory schema reserved ahead of implementation                        |
| [0013](0013-audit-log-schema-reserved.md)           | Audit log schema reserved ahead of implementation                        |
| [0014](0014-attachments-schema-reserved.md)         | Attachments schema reserved ahead of implementation                      |
| [0015](0015-shared-zod-validation.md)               | Shared Zod validation schemas in `packages/shared`                       |
| [0016](0016-calc-engine-verbatim-port.md)           | Calculation engine ported verbatim, no redesign                          |
| [0017](0017-legacy-source-of-truth.md)              | Legacy file treated as immutable source of truth during migration        |
| [0018](0018-phased-gated-migration.md)              | Phased, gated, strangler-fig migration strategy                          |
| [0019](0019-api-response-envelope.md)               | Standard API response envelope and centralized error handling            |
| [0020](0020-docker-without-automated-migrations.md) | Docker support without automated migrations in the container             |
| [0021](0021-authn-authz-layering.md)                | Supabase Auth (authentication) layered under custom RBAC (authorization) |
| [0022](0022-database-driven-rbac.md)                | True database-driven RBAC — roles and permissions, nothing hardcoded     |
| [0023](0023-branch-access-model.md)                 | Branch access model — home branch + explicit grants + Super Admin bypass |
| [0024](0024-routing-introduced-phase-2.md)          | React Router introduced in Phase 2, ahead of its original plan           |
| [0025](0025-audit-log-write-path-begins-phase-2.md) | Audit log write-path begins with Phase 2's auth events                   |
| [0026](0026-legacy-employee-migration-mapping.md)   | Legacy employee → StaffProfile migration mapping                         |
| [0027](0027-self-contained-build-lifecycle.md)      | Self-contained build lifecycle via `prepare`/`postinstall` (Vercel fix)  |
| [0028](0028-last-active-admin-safety-rule.md)        | Last-active-administrator safety rule                                   |
| [0029](0029-rls-defense-in-depth.md)                 | Row Level Security as Defense-in-Depth, never the authorization source  |
| [0030](0030-backend-only-database-access.md)         | Backend-only database access                                            |
