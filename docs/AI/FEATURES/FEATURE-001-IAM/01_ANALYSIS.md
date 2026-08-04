# FEATURE-001 — IAM — Analysis (Engineering Audit)

> This document is analysis only. No code, schema, or API was changed to
> produce it. Every statement below is backed by a specific file, function,
> or model actually read during this audit. Where something could not be
> confirmed from the codebase, it is listed as unknown rather than assumed.
>
> This audit supersedes the placeholder template that previously occupied
> this file.

---

## 1. Executive Summary

IAM is implemented and working: Supabase Auth handles authentication,
a custom Prisma-backed RBAC layer (`Role` / `Permission` / `UserRole` /
`RolePermission` / `UserBranchAccess`) handles authorization, and both are
enforced server-side on every protected route via `requireAuth` and
`requirePermission` (`apps/api/src/middlewares/requireAuth.ts`,
`apps/api/src/middlewares/requirePermission.ts`). Roles and permissions are
fully database-driven — nothing is hardcoded in application code
(`packages/shared/src/permissions.ts` is a seed catalog, not an
authorization decision).

Two things are true at the same time: the design is sound and matches the
project's own rules (`docs/AI/HANDBOOK/02_DATABASE_RULES.md`), and the
implementation has real, confirmed gaps — most notably, there is no
frontend page to complete a Supabase invite or password-recovery flow (see
§8), and the only way to create the first `StaffProfile` in a fresh
environment is a manual, one-off script (confirmed in this audit's own
history: no seed step creates a `StaffProfile` — `apps/api/prisma/seed.ts`
seeds only `Branch`, `Setting`, `SizeFamily`, `SheetType`, `Permission`, and
`Role`/`RolePermission`, never `StaffProfile`).

There are also three uncommitted changes in the working tree right now
(confirmed via `git status --short`): `apps/web/src/lib/supabase.ts`,
`apps/web/src/pages/login/LoginPage.tsx`, and
`apps/web/src/state/AuthContext.tsx`. One of them contains leftover debug
`console.log` statements (see §7).

## 2. Authentication Flow

Provider: Supabase Auth. Two client instances exist:

- `apps/web/src/lib/supabase.ts` — browser client, created with
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Falls back to a
  syntactically valid placeholder URL/key if unset, specifically so
  `createClient()` (which throws synchronously on a malformed URL) doesn't
  crash the whole app at import time (comment at lines 32–35).
- `apps/api/src/lib/supabase.ts` — service-role admin client
  (`supabaseAdmin`), created with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`,
  `persistSession: false`. Used for trusted server-side operations that
  bypass RLS: token verification, inviting users, generating recovery
  links.

Sign-in flow, step by step:

1. `apps/web/src/pages/login/LoginPage.tsx` collects a single `identifier`
   field (email or phone) and a password, and calls `signIn(identifier,
   password, rememberMe)` from `useAuth()`.
2. `AuthProvider.signIn` (`apps/web/src/state/AuthContext.tsx:60-70`)
   trims the identifier; if it contains `@` it calls
   `supabase.auth.signInWithPassword({ email, password })`, otherwise it
   normalizes the value via `normalizePhone()` (lines 17-26 — converts a
   bare `0XXXXXXXXX` Egyptian mobile number to `+20XXXXXXXXX`) and calls
   `supabase.auth.signInWithPassword({ phone, password })`.
3. On success, the Supabase JS SDK holds a session (access + refresh
   token) client-side, persisted via `rememberAwareStorage`
   (`apps/web/src/lib/supabase.ts:26-30`), which reads/writes
   `localStorage` or `sessionStorage` depending on a flag set by
   `setRememberMe()` before sign-in.
4. `AuthProvider.signIn` then calls `apiPost('/api/auth/login')` with no
   body — `apps/web/src/lib/api.ts:6-10`'s `authHeaders()` attaches the
   current Supabase access token as `Authorization: Bearer <token>` by
   calling `supabase.auth.getSession()`.
5. On the backend, `apps/api/src/routes/auth.ts:7` registers
   `POST /login` behind `requireAuth` (not behind
   `requirePermission` — there is no permission check for logging in,
   only a valid-session + valid-StaffProfile check).
   `requireAuth` (`apps/api/src/middlewares/requireAuth.ts:22-56`) reads
   the bearer token, calls `supabaseAdmin.auth.getUser(token)` to verify it
   against Supabase, then calls `loadAuthContext(data.user.id)`
   (`apps/api/src/services/authContext.ts:22-60`) to load the matching
   `StaffProfile`. If verification or profile lookup fails, it returns
   401/403 (see §3 for exact conditions).
6. `apps/api/src/controllers/auth.ts:13-31`'s `login()` controller then
   updates `StaffProfile.lastLoginAt`, calls `recordAudit()`
   (`apps/api/src/services/auditService.ts:15-28`) with action `LOGIN`,
   and returns `{ user, permissions }` built by
   `getUserDto()`/`mapStaffToUser()` (`apps/api/src/services/userService.ts`).
7. The frontend stores this in `authContext` state
   (`apps/web/src/state/AuthContext.tsx:9,69`).

Session bootstrap on page load: `AuthProvider`'s `useEffect`
(`apps/web/src/state/AuthContext.tsx:32-58`) calls
`supabase.auth.getSession()`; if a session exists it calls
`GET /api/auth/me` (`apps/api/src/controllers/auth.ts:54-58`) to rehydrate
`authContext` without writing an audit entry. It also subscribes to
`supabase.auth.onAuthStateChange` to clear `authContext` if the session
disappears (line 50-52).

Sign-out: `AuthProvider.signOut` (lines 72-81) calls
`POST /api/auth/logout` (audit-logs the `LOGOUT` action) **before**
calling `supabase.auth.signOut()` — the comment on lines 74-75 explains
this ordering is required because signing out client-side invalidates the
token the logout request needs to authenticate itself.

Password reset: self-service reset
(`LoginPage.tsx`'s `handleForgotPassword`) calls
`supabase.auth.resetPasswordForEmail()` directly — the backend is not
involved. Admin-triggered reset
(`apps/api/src/controllers/users.ts:276-308`'s `resetUserPassword`) calls
`supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })` and
audit-logs a `PASSWORD_RESET` action. **Neither path passes a
`redirectTo` option, and no frontend route exists to handle the resulting
recovery link** — confirmed by grepping `apps/web/src` for `redirectTo`
and by the full route list in `apps/web/src/App.tsx` (only `/login`, `/`,
`/settings`, `/users`, `/roles`, `/permissions` exist). See §8.

## 3. Authorization Flow

Two middlewares, always used together in that order:

1. **`requireAuth`** (`apps/api/src/middlewares/requireAuth.ts`):
   - No `Authorization: Bearer` header → `401 "Missing bearer token"`
     (line 26-29).
   - Token fails `supabaseAdmin.auth.getUser(token)` → `401 "Invalid or
     expired token"` (line 33-36).
   - No matching `StaffProfile` for that Supabase user id → `403 "No
     staff profile exists for this account"` (line 40-44). Lookup is by
     `StaffProfile.supabaseUserId` (unique) via `loadAuthContext()`.
   - `StaffProfile.isActive === false` → `403 "This account has been
     deactivated"` (line 47-51).
   - Otherwise, attaches the full `AuthenticatedUser` object
     (`apps/api/src/services/authContext.ts:3-13`) to `req.auth` and
     calls `next()`.

2. **`requirePermission(key)`** (`apps/api/src/middlewares/requirePermission.ts`):
   - Requires `req.auth` to already be set (i.e. must run after
     `requireAuth`) — otherwise `401`.
   - Calls `hasPermission(req.auth.permissions, key)` from
     `packages/shared/src/permissions.ts:156-158`, which checks the
     caller's server-loaded, database-derived permission list — never
     anything supplied by the client. Missing permission → `403 "Missing
     required permission: <key>"`.

Every business route module (`users.ts`, `roles.ts`, `permissions.ts`)
calls `router.use(requireAuth)` once at the top of the file, then applies
`requirePermission('<module>.<action>')` per route
(`apps/api/src/routes/users.ts`, `routes/roles.ts`, `routes/permissions.ts`).
The one exception: `apps/api/src/routes/branches.ts:7-8` only requires
`requireAuth`, no specific permission — the controller's own comment
(`apps/api/src/controllers/branches.ts:4-10`) states this is deliberate:
branch name/code is treated as low-sensitivity reference data needed by
several screens regardless of what else a user can do.

Client-side, `apps/web/src/components/ProtectedRoute.tsx` gates routes by
`authContext` presence and, optionally, a `permission` prop checked via
`can()` (`AuthContext.tsx:83-86`, itself calling the same
`hasPermission()` from the shared package against the permissions the
server already returned). The component's own comment (lines 4-9) states
explicitly this is UX only, not a trust boundary — every route in
`apps/web/src/App.tsx` that has a permission requirement is paired with a
matching `requirePermission()` call on the corresponding backend route
(verified by cross-referencing `App.tsx`'s `permission="employees.view"` /
`"roles.view"` / `"permissions.view"` / `"settings.view"` against
`routes/users.ts`, `routes/roles.ts`, `routes/permissions.ts`,
`routes/settings.ts`).

## 4. RBAC Flow

Effective permissions are computed once per request, server-side only, in
`loadAuthContext()` (`apps/api/src/services/authContext.ts:22-59`):

1. Load `StaffProfile` by `supabaseUserId`, including
   `roles.role.permissions.permission` and `branchAccess`.
2. `roleNames` = the `name` of every `Role` the staff member holds
   (line 35).
3. `permissions` = the deduplicated union (a `Set`) of every
   `Permission.key` across every `RolePermission` of every held `Role`
   (lines 37-42) — a user with two roles gets the union of both roles'
   grants.
4. `accessibleBranchIds` = the staff member's own `branchId` plus every
   `UserBranchAccess.branchId` grant (lines 44-47).

Permission matching (`packages/shared/src/permissions.ts:144-153`,
`permissionMatches()`): an exact key match, the global wildcard `*`, or a
module wildcard `<module>.*` all satisfy a required key. `hasPermission()`
(lines 156-158) checks a required key against the full granted-key array.

The permission catalog itself (`PERMISSION_CATALOG`,
`packages/shared/src/permissions.ts:17-141`) defines 12 modules
(`customers`, `orders`, `quotations`, `work-orders`, `treasury`,
`suppliers`, `tenders`, `reports`, `settings`, `employees`, `roles`,
`permissions`), each with a fixed action set plus an auto-generated
`<module>.*` wildcard, and is consumed by `apps/api/prisma/seed.ts:292-298`
to populate the `Permission` table — it is seed data, not a runtime
authorization source (stated explicitly in the file's own header comment,
lines 1-9).

Eight system roles are seeded (`apps/api/prisma/seed.ts:8-37`,
`DEFAULT_ROLES`): `SUPER_ADMIN`, `ADMIN`, `SALES`, `CASHIER`,
`PRODUCTION_MANAGER`, `DESIGNER`, `PRINTING_OPERATOR`, `VIEWER`, each with
a starting grant set in `DEFAULT_ROLE_PERMISSIONS` (lines 43-76). All are
created with `isSystem: true`, which
`apps/api/src/controllers/roles.ts:95-107`'s `deleteRole()` uses to block
deletion (`409 SYSTEM_ROLE`) — a system role can still be renamed or have
its permissions changed via `setRolePermissions()`
(`controllers/roles.ts:125-153`). The same `isSystem` protection exists for
permissions (`controllers/permissions.ts:39-64`'s `deletePermission()`,
`409 SYSTEM_PERMISSION`).

Role/permission management UI: `apps/web/src/pages/roles/RolesPage.tsx`
and `apps/web/src/pages/permissions/PermissionsPage.tsx` (contents not
fully enumerated line-by-line in this audit, but both are registered in
`App.tsx` behind `permission="roles.view"` / `"permissions.view"`
respectively, and both routes exist per §3).

## 5. Entity Relationships

From `apps/api/prisma/schema.prisma`:

- **`StaffProfile`** (lines 329-359) — `id`, `supabaseUserId` (unique),
  `name`, `email` (unique), `phone?`, `isActive`, `lastLoginAt?`,
  `branchId` → `Branch`, soft-delete fields (`isDeleted`/`deletedAt`/
  `deletedBy`). Has-many `UserRole`, `UserBranchAccess`, plus (out of
  IAM's scope but declared on the same model) `Order`, `Quotation`,
  `TreasuryEntry`, `Attachment`, `AuditLog`.
- **`Branch`** (lines 143-169) — `id`, `name`, `code` (unique),
  `isDefault`, soft-delete fields. Has-many `StaffProfile`,
  `UserBranchAccess`, plus other business-module relations not part of
  IAM.
- **`Role`** (lines 364-382) — `id`, `name` (unique, e.g.
  `"SUPER_ADMIN"`), `label`, `description?`, `isSystem`, soft-delete
  fields. Has-many `UserRole`, `RolePermission`.
- **`Permission`** (lines 390-404) — `id`, `key` (unique, e.g.
  `"customers.view"`, `"orders.*"`, `"*"`), `module`, `label`,
  `description?`, `isSystem`. Has-many `RolePermission`. No soft-delete
  fields — permissions are hard-deleted (blocked entirely if `isSystem`).
- **`UserRole`** (lines 406-415) — join table, `staffId` → `StaffProfile`
  (`onDelete: Cascade`), `roleId` → `Role` (`onDelete: Cascade`), unique
  on `(staffId, roleId)`.
- **`RolePermission`** (lines 417-425) — join table, `roleId` → `Role`,
  `permissionId` → `Permission`, both `onDelete: Cascade`, unique on
  `(roleId, permissionId)`.
- **`UserBranchAccess`** (lines 432+) — `staffId` → `StaffProfile`,
  grants access to a `Branch` beyond the staff member's home branch. The
  model's own doc comment (lines 427-431) states Super Admins bypass this
  table entirely via `canAccessBranch()` — but that comment says the
  function lives in `src/lib/permissions.ts`; it actually lives in
  `apps/api/src/services/authContext.ts:63-66`. This is a stale comment,
  not a functional issue (see §7).
- **`AuditLog`** (lines 849-865) — `entityType`, `entityId`, `action`
  (`AuditAction` enum), `performedById?` → `StaffProfile`, `branchId?` →
  `Branch`, `previousValue?`/`newValue?` (`Json?`). No soft-delete fields
  — audit logs are never deleted through application code (no delete
  path exists in `auditService.ts`).

No `Employee` model exists anywhere in `schema.prisma` (confirmed by an
exact grep for `model Employee` — zero matches). `StaffProfile` is the
only staff/employee entity. The permission module for this entity is
named `employees` (`packages/shared/src/permissions.ts:102-111`), the API
route prefix is `/api/users` (`apps/api/src/routes/users.ts`), and the
frontend nav label is `"Users"` (`apps/web/src/components/AppShell.tsx:8`)
— three different names for the same concept across three layers (see
§7).

## 6. Strengths

- **No hardcoded authorization anywhere in application code.** Roles and
  permissions are 100% database rows; `packages/shared/src/permissions.ts`
  is explicitly documented as seed data only (lines 1-9), and every
  authorization check (`requirePermission`, `hasPermission`,
  `canAccessBranch`) reads from `req.auth`, which is populated exclusively
  from a fresh database query per request
  (`authContext.ts:loadAuthContext`).
- **Server-side re-verification of everything the client claims.**
  `ProtectedRoute.tsx`'s own comment and the matching
  `requirePermission()` call on every corresponding backend route
  (cross-checked in §3) show the client-side permission check is
  consistently backed by an equivalent server check — not found to be
  missing anywhere in the routes audited.
- **Consistent audit trail on every mutating IAM action.** Every
  create/update/delete/login/logout/password-reset path in
  `controllers/auth.ts`, `controllers/users.ts`, `controllers/roles.ts`,
  and `controllers/permissions.ts` calls `recordAudit()` — verified by
  reading all four controller files in full; no mutating function was
  found that skips it.
- **System-role/system-permission protection.** `isSystem` blocks
  deletion of the 8 seeded roles and the seeded permission catalog
  (`controllers/roles.ts:101-107`, `controllers/permissions.ts:46-52`),
  preventing an admin from accidentally locking everyone out of a
  `requirePermission()` check that real code depends on.
- **Soft delete used consistently for `StaffProfile`, `Role`, and
  `Branch`** (`isDeleted`/`deletedAt`/`deletedBy` fields present on all
  three, and checked in every relevant query — e.g.
  `controllers/users.ts:133`, `controllers/roles.ts:71`).
- **Branch scoping is enforced, not just modeled.** `canAccessBranch()`
  is actually called in every user-management mutation
  (`controllers/users.ts` — `getUser`, `createUser`, `updateUser`,
  `deleteUser`, `setUserRoles`, `setUserBranchAccess`,
  `resetUserPassword` all call it), not just declared in the schema.

## 7. Weaknesses

- **Uncommitted debug logging in shipped-looking code.**
  `apps/web/src/lib/supabase.ts:5-6` contains
  `console.log(import.meta.env)` and
  `console.log("URL =", import.meta.env.VITE_SUPABASE_URL)`. Confirmed via
  `git diff --staged` that these two lines are currently staged,
  uncommitted changes — not part of any commit. They log the entire Vite
  env object (including `VITE_SUPABASE_ANON_KEY`) to the browser console
  on every load.
- **Stale code comment.** `apps/api/prisma/schema.prisma`'s
  `UserBranchAccess` doc comment (line ~430) says `canAccessBranch()`
  lives in `src/lib/permissions.ts`; it actually lives in
  `apps/api/src/services/authContext.ts`. Cosmetic, but it will actively
  mislead the next person who searches for it there.
- **Naming inconsistency across layers for the same entity**: DB model
  `StaffProfile`, permission module/keys `employees.*`
  (`packages/shared/src/permissions.ts:102-111`), API route prefix
  `/api/users` (`routes/users.ts`), frontend nav label `"Users"`
  (`AppShell.tsx:8`). Functionally harmless (each layer is internally
  consistent), but a genuine readability/onboarding cost.
- **Three files are currently modified but uncommitted**
  (`git status --short`): `apps/web/src/lib/supabase.ts`,
  `apps/web/src/pages/login/LoginPage.tsx`,
  `apps/web/src/state/AuthContext.tsx`. The phone-or-email login feature
  and its supporting `AuthContext` change are real, working code sitting
  in the working tree, not yet part of project history.
- **Phone-number normalization is a single hardcoded assumption.**
  `normalizePhone()` (`AuthContext.tsx:17-26`) only recognizes Egyptian
  11-digit local numbers (`0` + 10 digits → `+20…`). Any other country
  code, or a number already missing its leading `0`, is passed through
  unnormalized to Supabase, which will simply fail to match.
- **No verification in this audit that Supabase phone-based sign-in is
  actually enabled on the project.** `signInWithPassword({ phone, password })`
  is called unconditionally when the identifier isn't email-shaped
  (`AuthContext.tsx:65`), but whether the Supabase project has phone auth
  configured is a dashboard setting this audit could not inspect from the
  codebase.

## 8. Missing Pieces

- **No frontend route exists to complete a Supabase invite or
  password-recovery flow.** `createUser()`
  (`apps/api/src/controllers/users.ts:80-126`) calls
  `supabaseAdmin.auth.admin.inviteUserByEmail(input.email)`;
  `resetUserPassword()` (lines 276-308) calls
  `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', ... })`; and
  self-service reset calls `supabase.auth.resetPasswordForEmail()`
  (`LoginPage.tsx`). None of these pass a `redirectTo`, and grepping
  `apps/web/src` confirms no page handles an invite/recovery callback or
  calls `supabase.auth.updateUser({ password })`. The full route list in
  `App.tsx` has no such route. **A newly invited user, or anyone who
  requests a password reset, currently has no page in this app to land on
  and set a password.**
- **No seed-time or self-service path creates the first `StaffProfile`.**
  `apps/api/prisma/seed.ts` seeds `Branch`, `Setting`, `SizeFamily`,
  `SheetType`, `Permission`, `Role`, and `RolePermission` — never
  `StaffProfile` (confirmed by an exact grep for `staffProfile`/
  `StaffProfile` in `seed.ts`: zero matches). The only way to create the
  first account is a manual, ad hoc script run directly against the
  database — not a documented or repeatable part of environment setup.
- **No UI or endpoint to create a `Branch`.**
  `apps/api/src/routes/branches.ts` only exposes `GET /`; the controller's
  own comment (`controllers/branches.ts:4-10`) states branch
  create/rename is explicitly out of scope for Phase 2.
- **No automated tests found for any IAM path.** No `.test.ts`/`.spec.ts`
  files were found under `apps/api/src` or `apps/web/src` during this
  audit's file listing. All verification so far has been manual.

## 9. Risks

- Inviting a user today produces an account that cannot complete sign-up
  (see §8) — this is a functional gap that will surface the first time
  someone other than the already-bootstrapped Super Admin account is
  invited through the Users screen.
- Any future change to a permission key's string value or a role's `name`
  breaks every `requirePermission('<key>')` call and every seed grant
  that references it by string — there is no compile-time check linking
  `PERMISSION_CATALOG` entries to their usages in route files.
- `canAccessBranch()`'s Super Admin bypass
  (`authContext.ts:64`: `if (user.roleNames.includes('SUPER_ADMIN')) return true;`)
  is a string comparison against `Role.name`. Renaming the `SUPER_ADMIN`
  role (permitted — only `isSystem` blocks *deletion*, not renaming; see
  `controllers/roles.ts:68-92`) would silently break branch-scoping
  bypass for every Super Admin, with no error surfaced anywhere.
- The debug `console.log(import.meta.env)` (§7) would ship real
  environment values (including the anon key) to every browser's console
  in whatever build picks it up, if committed and deployed as-is.

## 10. Recommended Next Feature

Build the **invite-acceptance / password-set page** described as missing
in §8, before building any new business module on top of IAM. This is not
a new feature so much as the completion of the one already declared
finished: `createUser()` already sends a real Supabase invite email today,
and there is currently no page for that email's link to lead to. This
should be scoped and run through `02_PLAN.md` before implementation, per
`docs/AI/MASTER_PROMPT.md`'s Step 4/5 (impact analysis and plan before
code).
