# API Conventions

This defines the contract every endpoint in `apps/api` follows — current endpoints already conform to it; every new endpoint must too. See [ARCHITECTURE.md §3](ARCHITECTURE.md#3-backend-request-flow) for how a request flows through the code, and [CODING_STANDARDS.md](CODING_STANDARDS.md) for implementation-level conventions.

---

## REST naming

- **Resource paths are plural nouns**: `/api/customers`, `/api/sheet-types`, `/api/size-families`. Never a verb in the path (`/api/getCustomers` is wrong).
- **Multi-word resources are kebab-case**: `/api/sheet-types`, `/api/ready-products`, `/api/size-families` — not `/api/sheetTypes` or `/api/sheet_types`.
- **Nested sub-resources use a `/:id/sub-resource` path**, one level deep: `/api/size-families/:id/entries`, `/api/size-families/:id/entries/:entryId`. Don't nest more than two levels — if a resource needs to be reached both standalone and nested, give it its own top-level path too (future example: `/api/suppliers/:id/purchases` alongside no standalone purchases endpoint, since purchases have no independent meaning outside a supplier).
- **HTTP verbs map to actions, not the path**:

  | Verb                   | Meaning                                                                                                                                                                                                        | Example                                 |
  | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
  | `GET /resource`        | List (optionally filtered/paginated/sorted)                                                                                                                                                                    | `GET /api/sheet-types?base=REGULAR`     |
  | `GET /resource/:id`    | Fetch one                                                                                                                                                                                                      | `GET /api/orders/:id` (future)          |
  | `POST /resource`       | Create                                                                                                                                                                                                         | `POST /api/customers`                   |
  | `PUT /resource/:id`    | Full or partial update (this codebase uses `PUT` with a `.partial()` Zod schema rather than distinguishing `PUT`/`PATCH`)                                                                                      | `PUT /api/sheet-types/:id`              |
  | `PATCH /resource/:id`  | Reserved for **status-only transitions** on entities with an explicit lifecycle (`PATCH /api/orders/:id/status`, `PATCH /api/work-orders/:id/status`) — a semantic hint that this isn't a general field update | `PATCH /api/orders/:id/status` (future) |
  | `DELETE /resource/:id` | Soft delete (see below)                                                                                                                                                                                        | `DELETE /api/sheet-types/:id`           |

- **`/health` is the one exception** — unprefixed, no `/api`, because infrastructure health checks (load balancers, container orchestrators) conventionally expect it at the root. Every other endpoint lives under `/api`.
- **Action endpoints that don't fit CRUD** are a `POST` to a sub-path naming the verb, not a new HTTP method: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/users/:id/reset-password`. This is the same pattern legacy's own domain actions (`orders.finalize`, `quotations.convert`) will follow once those phases land — see [LEGACY_MAPPING.md](LEGACY_MAPPING.md).

---

## Status codes

| Code                        | When                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200 OK`                    | Successful `GET`, `PUT`, `PATCH`, or an action that doesn't create a resource                                                                                                                 |
| `201 Created`               | Successful `POST` that creates a resource — response body is the created resource                                                                                                             |
| `204 No Content`            | Successful `DELETE` with genuinely nothing to return (used today for hard-deleting a child record, e.g. a `SizeFamilyEntry`)                                                                  |
| `400 Bad Request`           | Zod validation failure — body always includes `issues` (Zod's `.flatten()` output)                                                                                                            |
| `401 Unauthorized`          | Missing or invalid bearer token                                                                                                                                                               |
| `403 Forbidden`             | Valid token, but the caller lacks the required permission, is inactive, has no StaffProfile, or lacks access to the target branch                                                             |
| `404 Not Found`             | Resource doesn't exist, or (for `Setting`) hasn't been initialized yet; also the catch-all for unmatched routes                                                                               |
| `409 Conflict`              | A uniqueness/state conflict the caller could reasonably resolve (reserved for future use — e.g. attempting to delete a `SizeFamilyEntry` that's protected by the calculation engine, Phase 4) |
| `500 Internal Server Error` | Anything unexpected — the response never includes a stack trace                                                                                                                               |

A soft delete (`DELETE`) that succeeds returns `200` with the updated (now-`isDeleted: true`) resource in most cases in this codebase today, **except** for plain child records with no independent lifecycle (e.g. `SizeFamilyEntry`), which are hard-deleted and return `204`. See [CODING_STANDARDS.md](CODING_STANDARDS.md#prisma) for which entities get soft vs. hard delete.

---

## Error format

Every error response, regardless of status code, uses the same envelope (`ApiError` from `packages/shared`):

```json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "code": "OPTIONAL_MACHINE_READABLE_CODE"
  }
}
```

Zod validation errors add a top-level `issues` field alongside `error` (see `errorHandler.ts`):

```json
{
  "success": false,
  "error": { "message": "Validation failed", "code": "VALIDATION_ERROR" },
  "issues": { "fieldErrors": { "price": ["Expected number, received string"] } }
}
```

Never return a bare string, a bare array of error messages, or a differently-shaped error body from any endpoint — frontend error handling assumes this exact envelope everywhere (see `apps/web/src/lib/api.ts`).

---

## Success format

```json
{
  "success": true,
  "data": { "...": "the resource or list" }
}
```

## Pagination

Not yet implemented by any current endpoint (all current lists are small reference-data catalogs). The first endpoint that needs it is `GET /api/orders` (Phase 9 — legacy renders every row unconditionally, a deliberate improvement per LEGACY_ANALYSIS §9). The convention to follow when that lands:

**Request** — offset-based query params:

```
GET /api/orders?page=1&pageSize=25
```

- `page` is 1-indexed. `pageSize` defaults to a sane value (25) and is capped (e.g. 100) server-side — never trust a client-supplied page size unbounded.

**Response** — the same `ApiSuccess` envelope, `data` is the array, plus a `meta` field:

```json
{
  "success": true,
  "data": [/* page of results */],
  "meta": { "page": 1, "pageSize": 25, "total": 143, "totalPages": 6 }
}
```

Cursor-based pagination is deliberately not used — offset pagination matches the kind of UI these lists feed (a page-numbered table with filters/date-ranges, not an infinite feed), and is simpler to reason about for an internal ERP tool. If a future list genuinely needs cursor pagination (very high volume, real-time insertion), that's a decision to make explicitly via an ADR, not a silent per-endpoint choice.

## Filtering

Query params match the field name being filtered, using the same casing as the Prisma field:

```
GET /api/sheet-types?base=REGULAR
GET /api/services?category=DESIGN
GET /api/orders?customerId=<uuid>&status=CONFIRMED
```

- Enum-valued filters are validated against the enum (invalid value → either ignored, falling back to unfiltered, or a `400`, decided per-endpoint and documented in that endpoint's controller — today's implementations ignore an invalid `base`/`category` value rather than erroring, since it's a `GET` and failing open to "unfiltered" is friendlier than a hard error for a list view).
- Free-text search uses a `search` param (`GET /api/customers?search=ahmed`), matching against the field(s) that make sense for that resource (documented per-endpoint).
- Date-range filters use `from`/`to` (`GET /api/treasury?from=2026-01-01&to=2026-01-31`), inclusive on both ends, matching the legacy behavior being ported (LEGACY_ANALYSIS §2).

## Sorting

Not yet needed by any current endpoint (all current lists have a fixed, sensible default order — e.g. sheet types by base then name). When an endpoint needs client-controlled sorting, the convention is:

```
GET /api/orders?sortBy=date&sortDir=desc
```

- `sortBy` must be an allow-listed field name for that resource (never pass a raw client string into a Prisma `orderBy` key) — validate it against a small enum in that endpoint's Zod query schema.
- `sortDir` is `asc` or `desc`, defaulting to whichever direction makes sense for that field (newest-first for dates, alphabetical for names).

---

## Authentication

Every endpoint except `/health` requires a valid Supabase-issued JWT:

```
Authorization: Bearer <supabase-access-token>
```

- `requireAuth` middleware (`src/middlewares/requireAuth.ts`) verifies the token via `supabase.auth.getUser(token)`, then loads the caller's application-level identity via `loadAuthContext()` (`src/services/authContext.ts`) and attaches it to `req.auth`:

  ```ts
  type AuthenticatedUser = {
    staffId: string;
    supabaseUserId: string;
    name: string;
    email: string;
    branchId: string;
    isActive: boolean;
    roleNames: string[];
    permissions: string[]; // flattened, deduped, from every role the user holds
    accessibleBranchIds: string[]; // home branch + explicit grants
  };
  ```

- A missing/invalid token returns `401`. A valid token with **no matching StaffProfile**, or a StaffProfile with `isActive: false`, returns `403` — a real Supabase session alone is not sufficient to use this API. Never a redirect, never an HTML error page (this is a JSON API).
- The frontend never constructs or validates a token itself — it holds whatever Supabase's client SDK gives it (`apps/web/src/lib/api.ts` reads the current session and attaches it automatically to every request).
- `POST /api/auth/login` (called right after a successful Supabase sign-in) and `GET /api/auth/me` (called on page load to rehydrate) both return the same shape: `{ user: User, permissions: string[] }`. Login additionally updates `lastLoginAt` and writes an audit log entry; `/me` has no side effects. `POST /api/auth/logout` must be called — and must complete — **before** the frontend calls Supabase's own `signOut()`, since that invalidates the token this endpoint needs.

## Authorization

True database-driven RBAC — see [ARCHITECTURE.md §6](ARCHITECTURE.md#6-identity--access-management) for the full model.

- Permission checks are a **second middleware**, composed after `requireAuth`, never inline `if` statements duplicated in controllers:

  ```ts
  router.post('/', requireAuth, requirePermission('employees.create'), createUser);
  ```

- Permission keys are `<module>.<action>` (e.g. `customers.view`), with wildcard forms `<module>.*` and the global `*` (Super Admin only). `requirePermission(key)` checks `req.auth.permissions` — populated by `requireAuth` from the database on this request — against the required key via `hasPermission()` (`packages/shared/src/permissions.ts`).
- **The client's own claims about its permissions are never trusted for anything.** The frontend's `can(permissionKey)` check (`apps/web/src/state/AuthContext.tsx`) exists purely to hide UI it would be pointless to show (a button whose click would just 403) — it is not a security boundary, and every endpoint re-derives authorization from the database independent of what the client believes.
- An authenticated user without the required permission gets `403`, not `404` (don't hide the resource's existence from an authenticated-but-unauthorized user — that's only appropriate for genuinely secret resources, which nothing in this system currently is).
- **Branch scoping** is a separate, explicit check (`canAccessBranch()`, same service) applied inside a controller when the resource is branch-scoped — not a generic middleware, since the branch to check usually comes from the resource itself (e.g. "which branch does this user belong to") rather than a simple route param. `SUPER_ADMIN` bypasses this check entirely.
- Permissions themselves are seed data (`apps/api/prisma/seed.ts`), editable afterward through the Role/Permission management screens — nothing about who has what is fixed in application code.
