# Coding Standards

These are the conventions actually enforced in this codebase today (by ESLint/Prettier/TypeScript config where possible, by review where not). When a new pattern is needed that isn't covered here, propose the addition in the same PR that introduces it, rather than inventing a one-off convention silently.

---

## TypeScript

- **Strict mode is on everywhere** (`strict: true` in every `tsconfig.json`). Never weaken it locally with `// @ts-ignore` or `any` to make a type error go away — fix the type.
- **`import type` for type-only imports.** Both `apps/web`'s and `apps/api`'s ESLint configs run under `verbatimModuleSyntax`-adjacent settings; mixing value and type imports from the same module is fine, but a type-only import must use `import type { Foo } from '...'`, not `import { Foo }`.
- **Prefer `type` for data shapes, `interface` only when you need declaration merging or a class to implement it.** This codebase has no hard rule forcing one over the other everywhere, but Zod-inferred shapes (`z.infer<typeof x>`) are always exported as `type`, matching every file in `packages/shared/src/schemas/`.
- **No enums.** Use Prisma's generated enums (which are plain object + union type, not TS `enum`) for anything backed by the database, and `z.enum([...])` for anything validated by Zod. This project has zero TypeScript `enum` declarations — keep it that way; they don't tree-shake and don't match Prisma's own generated shape.
- **Explicit return types on exported functions** are encouraged but not mechanically enforced; they are required wherever inference would produce something misleading (e.g. a controller that might return early with different shapes).
- **Never widen a Zod-validated type back to `unknown`/`any` after parsing.** The whole point of parsing at the boundary is that everything downstream is fully typed — don't undo it.

---

## Naming conventions

| What                                                                   | Convention                                                                            | Example                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variables, functions                                                   | `camelCase`                                                                           | `getSettings`, `sheetTypeCount`                                                                                                                                           |
| React components, classes, types, Zod-inferred types                   | `PascalCase`                                                                          | `SettingsPage`, `CreateSheetTypeInput`                                                                                                                                    |
| Constants that are truly fixed (module-level, never reassigned config) | `UPPER_SNAKE_CASE`                                                                    | none yet in this codebase — reserved for things like `PAYMENT_METHODS` once ported                                                                                        |
| Prisma models                                                          | `PascalCase`, singular                                                                | `Customer`, `SheetType` (never `Customers`)                                                                                                                               |
| REST resource paths                                                    | plural, kebab-case for multi-word                                                     | `/api/sheet-types`, `/api/size-families`                                                                                                                                  |
| Non-component `.ts` files                                              | `camelCase.ts`                                                                        | `serialize.ts`, `sheetTypes.ts`                                                                                                                                           |
| React component files                                                  | `PascalCase.tsx`                                                                      | `SettingsPage.tsx`, `CartBar.tsx` (matches the exported component name)                                                                                                   |
| Database columns                                                       | `camelCase` (Prisma maps to the same casing in Postgres — no `@map` overrides in use) | `invoiceNumber`, `isDeleted`                                                                                                                                              |
| Boolean fields/variables                                               | `is`/`has`/`should` prefix                                                            | `isDeleted`, `isDefault`, `vatOn` (legacy-inherited exception — ported field names from the legacy `breakdown` shape are not renamed, see [Validation](#validation--zod)) |

Route files and controller files are named after the **resource**, plural, matching the mount path (`routes/sheetTypes.ts` → mounted at `/api/sheet-types`). Keep the route file, controller file, and Zod schema file for one resource discoverable by name alone — don't split one resource's logic across differently-named files.

---

## Folder structure

See [ARCHITECTURE.md §2](ARCHITECTURE.md#2-monorepo-layout) for the full tree. The rule that matters most:

- **`routes/` contains no logic.** A route file is a list of `router.verb(path, controllerFn)` lines and nothing else — no validation, no Prisma calls, no business rules.
- **`controllers/` handle one HTTP request/response cycle.** Validate input, call Prisma or a service, shape the response. A controller function should read top-to-bottom as "parse → do the thing → respond."
- **`services/` hold logic that spans multiple steps/tables/transactions**, introduced only when a controller would otherwise become a multi-step orchestration (the first real example will be Phase 6's order finalization: create `Order` + `OrderItem`s + `Payment`s + a linked `TreasuryEntry` + a `WorkOrder`, atomically). Don't create a service file for a single Prisma call — that belongs directly in the controller.
- **`apps/web/src/components/ui/`** is vendor territory (shadcn/ui). Treat it like `node_modules` you happen to be able to edit — style/variant tweaks are fine, but don't bolt app-specific business logic onto a `ui/` component. App-specific composition goes in `components/` (one level up) or in the relevant `pages/` folder.
- **`apps/api/src/generated/prisma/`** is Prisma's generated client output. Never hand-edit it, never import business logic into it — it's regenerated by `prisma generate` and is gitignored.

---

## React (`apps/web`)

- **Function components only.** No class components anywhere in this codebase.
- **Hooks over HOCs/render-props.** `useState`/`useEffect` for local state and data fetching today; a proper data-fetching layer (React Query or equivalent) is a decision to make explicitly (via an ADR) if/when manual `useEffect` fetching becomes unwieldy — don't introduce one silently in a single component.
- **Tailwind utility classes, not hand-written CSS files**, for all layout/spacing/color. The only non-Tailwind CSS is `src/index.css`'s `@theme`/CSS-variable block that defines the shadcn/ui design tokens — extend that file when a new design token is genuinely needed, don't add a parallel `.css` file per component.
- **RTL is a first-class requirement, not an afterthought.** The legacy system is Arabic-first RTL throughout (see LEGACY_ANALYSIS.md §7); as screens are ported, verify `dir="rtl"` behavior explicitly for that component rather than assuming Tailwind/shadcn handle it automatically.
- **Props are typed inline or via a co-located `type Props = {...}`** for anything non-trivial; don't reach for `React.FC<Props>` (it's an unnecessary extra layer — plain `function Component(props: Props)` is the pattern used throughout).
- **State that's genuinely cross-component** (the future order-building cart, Phase 5) gets a dedicated store — decide the mechanism (Context vs. a small external store) once, in that phase's PR, and use it consistently; don't let two competing state patterns coexist.

---

## Express (`apps/api`)

- **Express 5's automatic promise-rejection forwarding is relied upon deliberately.** Controllers are `async` functions that `throw`/let rejections propagate; there is no `try/catch` boilerplate wrapping every handler, and no `next(err)` calls. If you add a controller and it doesn't forward errors to `errorHandler`, you've broken this convention — check that you're not accidentally swallowing a rejected promise (e.g. calling an async function without `await`ing or returning it).
- **Route params are typed via Express's generic**, not read as untyped strings: `Request<{ id: string }>` — because `@types/express`'s default `ParamsDictionary` types every param as `string | string[]`, and that's the wrong type for a route with only named segments.
- **One router per resource file**, mounted in `routes/index.ts`. `/health` stays unprefixed (infra convention — load balancers and container healthchecks expect it there); every business resource is mounted under `/api`.
- **Middleware order matters and is centralized in `app.ts`**: `helmet()` → `cors()` → `express.json()` → `morgan()` (logging) → routes → `notFoundHandler` → `errorHandler`. Don't add per-route middleware for concerns that belong at this app-wide level.

---

## Prisma

- **The schema is the single source of truth for the data model.** Don't describe a field's shape in a comment somewhere else that can drift — point to `schema.prisma`.
- **Every model follows the Phase 1 conventions** (see [ARCHITECTURE.md §4](ARCHITECTURE.md#4-data-model-shape) and the [ADRs](adr/)): UUID PK, soft delete on business entities, `Decimal` for money, required `branchId` where branch-scoped. Adding a new model? Follow the existing pattern rather than reinventing it — copy the shape of the nearest similar model.
- **Migrations are named descriptively** (`prisma migrate dev --name add_x`), never left as Prisma's auto-generated timestamp-only name when run interactively.
- **Never edit a generated/applied migration file after the fact.** If a migration is wrong, write a new migration that corrects it — the migration history is an append-only log, treated the same way as git history.
- **The seed script (`prisma/seed.ts`) is idempotent** (`upsert`, or a count-check before `createMany`) — running it twice against the same database must not duplicate data or error. Keep it that way as it grows.
- **Decimal fields never reach the frontend as `Prisma.Decimal` instances.** Always pass query results through `serializeDecimals()` (`src/utils/serialize.ts`) before sending a JSON response.

---

## Validation — Zod

- **All input validation lives in `packages/shared/src/schemas/`**, not duplicated ad hoc in a controller. If a controller needs a shape Zod doesn't already define, add it to `packages/shared` first — that's what makes the same shape reusable from `apps/web`'s forms later.
- **One schema file per domain concept** (`setting.ts`, `sheetType.ts`, …), exporting: the full entity schema, a `createXSchema` (what a `POST` body must look like), and an `updateXSchema` (usually `createXSchema.partial()`). Follow this three-schema pattern for every new resource rather than improvising a different shape per resource.
- **Controllers call `.parse()`, never `.safeParse()` followed by manual error handling.** Let `ZodError` throw and let `errorHandler` turn it into a `400` — that's the entire point of Express 5's automatic rejection forwarding (see [Express](#express-appsapi) above).
- **Field names in a `breakdown` JSON blob that originate from the legacy calculation engine are never renamed** during the port (Phase 4) for "consistency" — they are copied verbatim, because `OrderItem.breakdown`/`QuotationItem.breakdown` are permanent historical snapshots and their shape must exactly match what the legacy calculators produced. This is why you'll see a `vatOn` boolean rather than an `isVatEnabled` boolean once that lands — it's an intentional exception to the naming table above, not an inconsistency to "fix."

---

## Error handling

- **One error-handling middleware, `src/middlewares/errorHandler.ts`, is the only place that decides HTTP status codes for errors.** Controllers throw (or let something throw); they don't call `res.status(500)` themselves except for a specific, expected, non-exceptional business state (e.g. "settings haven't been initialized yet" → `404`, which is a normal response the controller constructs directly, not an error).
- **`ZodError` → `400`** with `{ success: false, error: { message: 'Validation failed', code: 'VALIDATION_ERROR' }, issues: <zod flatten> }`.
- **Everything else → `500`** with `{ success: false, error: { message } }`, and the full error is `console.error`'d server-side. Never leak a stack trace to the client.
- **`notFoundHandler`** catches any route that didn't match, returning a `404` in the same `ApiResponse` shape — there's no bare Express default HTML 404 page in this API.
- See [API_CONVENTIONS.md](API_CONVENTIONS.md) for the full status-code and error-shape contract expected of every endpoint, current and future.

---

## API responses

Every endpoint returns the shared `ApiResponse<T>` discriminated union (`packages/shared/src/api-response.ts`):

```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; error: { message: string; code?: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

- **Never return a bare array or object without the envelope.** Frontend code always checks `body.success` before touching `body.data` — see `apps/web/src/lib/api.ts`'s `apiGet()` for the canonical consumption pattern.
- **List endpoints that grow pagination** wrap the array in the same envelope with an added `meta` field — see [API_CONVENTIONS.md](API_CONVENTIONS.md#pagination) for the exact shape. Don't invent a different envelope for paginated vs. non-paginated lists.
