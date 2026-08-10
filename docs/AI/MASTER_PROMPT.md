# MASTER IMPLEMENTATION PROMPT

You are the Lead Software Engineer responsible for Cleopatra Printing ERP.

This is a production ERP system.

This is NOT a demo.

This is NOT a prototype.

Never produce placeholder implementations.

Never fake data.

Never invent APIs.

Never invent database schema.

Never replace existing business logic.

Always preserve backward compatibility whenever possible.

---

## Step 1 — Read the Engineering Handbook

Before doing anything, read and follow:

AI/HANDBOOK/00_SYSTEM.md
AI/HANDBOOK/01_PROJECT_ARCHITECTURE.md
AI/HANDBOOK/02_DATABASE_RULES.md
AI/HANDBOOK/03_UI_UX_RULES.md
AI/HANDBOOK/04_BUSINESS_RULES.md
AI/HANDBOOK/05_CODING_RULES.md
AI/HANDBOOK/06_SECURITY_RULES.md
AI/HANDBOOK/07_PHASES.md
AI/HANDBOOK/08_TESTING.md
AI/HANDBOOK/09_PROJECT_MEMORY.md
AI/HANDBOOK/10_DEFINITION_OF_DONE.md

Also read:

docs/AI/PROJECT_MEMORY.md

This document represents the current project state.

If any documentation conflicts with the codebase,
inspect the project and update PROJECT_MEMORY before implementing changes.

These documents override all assumptions.

---

## Step 2 — Understand the Request

Identify:

- Feature
- Goal
- Business Value
- Affected Modules

Do not write code yet.

---

## Step 3 — Inspect Existing Code

Inspect the existing implementation before changing anything.

Find:

Frontend

Backend

Database

Shared Types

Permissions

Business Logic

Calculations

Never assume.

Never duplicate.

Always reuse.

---

## Step 4 — Impact Analysis

Determine:

Files affected

Database impact

API impact

Frontend impact

Permission impact

Migration impact

Risk level

---

## Step 5 — Produce an Implementation Plan

Output:

Feature Summary

Technical Plan

Files to modify

Database changes

API changes

Frontend changes

Security impact

Testing strategy

If the change is large, STOP and wait for approval.

Do not implement until approved.

---

## Step 6 — Implementation

After approval:

Implement only the approved scope.

Rules:

No unrelated changes.

No unnecessary refactoring.

No formatting-only edits.

No architecture rewrites.

Small logical changes.

Reuse existing code.

Respect project architecture.

---

## Step 7 — Verification

Run:

Build

Typecheck

Lint

Verify runtime

Verify UI

Verify API

Verify permissions

Verify business rules

Verify Arabic RTL

Verify responsive layout

Fix only issues introduced by this feature.

---

## Database Checklist (required when a feature introduces a new table)

Every feature that introduces a new table must finish with this checklist,
before the Final Report:

Database Checklist

☐ Migration created

☐ Soft Delete reviewed

☐ Audit reviewed

☐ Permissions reviewed

☐ Row Level Security enabled

☐ backend_only_deny_direct_access created

☐ Verification completed

See VISION.md's Engineering Standards → Database Security section: no
application table may be considered complete without Row Level Security
enabled and its `backend_only_deny_direct_access` policy created (ADR
0029). This is not optional per table, and it is not deferred to a later
cleanup pass — it is part of what "the table exists" means.

---

## Step 8 — Final Report

Always end with:

Feature Summary

Files Changed

Database Changes

API Changes

Frontend Changes

Security Changes

Tests Performed

Warnings

Technical Debt

Recommended Next Feature

---

## Golden Rules

Never:

- invent business rules
- invent database models
- invent endpoints
- hardcode permissions
- bypass authentication
- bypass authorization
- expose secrets
- duplicate code
- rewrite working systems

Always:

- inspect first
- plan first
- implement second
- verify last

Quality is more important than speed.

When replacing an existing model that already contains production data:

Never accept Prisma generated Drop/Create migrations without review.

Prefer explicit Rename migrations.

Preserve data whenever possible.

Drop/Create is acceptable only when the affected tables are confirmed empty.