# ADR 0026: Legacy employee → StaffProfile migration mapping

**Status:** Accepted

## Context

Explicit requirement: legacy employee records must be migratable into the new User (`StaffProfile`) model. Legacy's employee shape (LEGACY_ANALYSIS §9) is `{id, name, password (plaintext), role: 'admin' | 'staff'}` — no email field, and legacy never actually branches on `role` anywhere in its own code (it's cosmetic). Phase 0 confirmed no real production data exists in the legacy Artifact, so no migration has actually been run — this ADR documents the mapping that would be used if it ever needed to be.

## Decision

A legacy employee maps to a new `StaffProfile` as follows:

- **`name`** → `StaffProfile.name`, unchanged.
- **`password`** → cannot be migrated, under any circumstances. It is plaintext, and even if it weren't, this system never stores a password at all (ADR 0005/0021 — Supabase Auth owns credentials). Each migrated person requires a fresh Supabase Auth invite; there is no way to preserve "the same password" and no attempt is made to.
- **`role`** → legacy's two undifferentiated values map to a starting `Role` assignment: `'admin'` → `ADMIN`, `'staff'` → `VIEWER` (the safest default — read-only until an administrator explicitly grants more). This is a **starting point requiring manual correction per person**, not an authoritative mapping, since legacy's role field carried no real meaning to preserve.
- **email** — legacy has no such field, and Supabase Auth requires one to create an account. An administrator must supply an email address for each migrated employee; this cannot be automated from legacy data alone.
- **branch** — legacy has no multi-branch concept at all (ADR 0009); every migrated employee is assigned to the single seeded default branch.

## Consequences

- No import script has been built or run — there is nothing to import (Phase 0). If real legacy employee data is ever discovered, a one-off script following the mapping above would need an accompanying spreadsheet or admin-provided list of email addresses before it could run; it cannot be a fully automated data migration.
- This mapping is deliberately conservative (`VIEWER` default, not `STAFF`-equivalent broad access) because legacy's `role` field cannot be trusted to reflect what a given person should actually be able to do in the new, much more granular permission system.
