# ADR 0019: Standard API response envelope and centralized error handling

**Status:** Accepted

## Context

A REST API with inconsistent response shapes (sometimes a bare array, sometimes an object, errors shaped differently per endpoint) forces every frontend call site to defensively handle multiple possible shapes. Legacy has no API at all to take a cue from here, so this is a fresh decision rather than a port.

## Decision

Every endpoint returns one of two shapes, defined once in `packages/shared/src/api-response.ts` and never varied per-endpoint:

```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; error: { message: string; code?: string } };
```

A single Express error-handling middleware (`src/middlewares/errorHandler.ts`) is the only place that translates a thrown error into an HTTP status code and this shape — `ZodError` becomes `400` with validation `issues` attached; everything else becomes `500` with no leaked stack trace. Controllers rely on Express 5's automatic forwarding of rejected promises to this middleware rather than each wrapping itself in `try/catch`.

## Consequences

- Frontend code has exactly one pattern for consuming any API call: check `body.success`, then use `body.data` or `body.error` (see `apps/web/src/lib/api.ts`'s `apiGet()`).
- Adding a new endpoint never requires deciding "what should errors look like here" — that's already decided globally.
- Paginated list endpoints (not yet implemented — see API_CONVENTIONS.md) extend `ApiSuccess` with an added `meta` field rather than introducing a differently-shaped envelope for paginated vs. non-paginated responses.
