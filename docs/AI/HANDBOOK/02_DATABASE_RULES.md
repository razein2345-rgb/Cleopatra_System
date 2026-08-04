# Database & Business Rules

## Golden Rule

The database is the only source of truth.

Claude must NEVER invent data structures.

Claude must NEVER duplicate existing tables.

Claude must NEVER replace existing logic without permission.

---

# Existing Database

Before modifying anything:

Claude MUST inspect:

- Prisma Schema
- Existing Models
- Existing Relations
- Existing Enums
- Existing APIs

If something already exists:

Reuse it.

Never recreate it.

---

# Adding Features

Every new feature must answer:

1. Does a table already exist?

2. Does a relation already exist?

3. Can an existing table be extended?

Only if the answer is NO may a new table be created.

---

# Migrations

Never delete columns.

Never rename columns silently.

Never remove tables.

Always create forward-compatible migrations.

Protect production data.

---

# IDs

Never change primary keys.

Never regenerate IDs.

Never change relation names without migration.

---

# Business Logic

Business logic belongs to the backend.

Never move calculations to React.

Never duplicate calculations in multiple places.

Only one Calculation Engine exists.

---

# Printing Calculations

Printing prices must always come from:

Calculation Engine

NOT React.

NOT Components.

NOT Pages.

---

# Services

Every service must contain:

Validation

Authorization

Business Logic

Audit Log

Error Handling

---

# Validation

Every API must validate:

Input

Output

Permissions

Ownership

---

# Audit

Every Create

Every Update

Every Delete

must create an Audit Log.

Nothing changes silently.

---

# Transactions

If multiple database operations belong together,

use Prisma Transaction.

Never leave the database in a partial state.

---

# Performance

Prefer joins.

Avoid duplicate queries.

Avoid N+1 problems.

Paginate large tables.

---

# Soft Delete

Prefer soft delete where possible.

Never permanently delete important business data unless explicitly requested.

---

# Settings

Settings are stored in the database.

Never hardcode configurable values.

---

# Roles

Roles come from the database.

Permissions come from the database.

Never hardcode role names.

Never hardcode permissions.

---

# Future Compatibility

Every schema change must be backward compatible whenever possible.

Never break previous data.

---

# Rule Before Coding

Before writing any Prisma code Claude must inspect the current schema.

If the schema already supports the feature,

reuse it.

Do not rebuild it.