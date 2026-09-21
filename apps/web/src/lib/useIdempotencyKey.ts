import { useRef } from 'react';

/**
 * Accounting audit fix (2026-09-17, frontend idempotency wiring) — key
 * lifecycle for a single in-flight financial mutation (order creation,
 * payment recording, supplier payment, expense mark-paid).
 *
 * The whole point of an idempotency key is that a RETRY of the same
 * logical submission attempt (the response was lost to a network blip, the
 * user clicked again after a timeout) reuses the SAME key, while a
 * genuinely NEW operation (a different order, a second payment made after
 * the first one already succeeded) gets a fresh one. Getting this backwards
 * — a new key per retry — defeats the entire mechanism (the backend would
 * see every retry as a brand-new request); a key that never resets risks
 * an unrelated later submission colliding with a stale one.
 *
 * `getKey()` is idempotent itself — call it every time right before
 * sending the request; it only mints a new UUID the first time (or after
 * `resetKey()`), so calling it again on a retry hands back the exact same
 * string. `resetKey()` must be called after a *definitive success* — never
 * after a failure (a failed attempt should be retried with the SAME key,
 * which is safe: the backend deletes its own reservation whenever the
 * protected work throws, so retrying with the same key after a real
 * failure simply reprocesses fresh, no stale-conflict risk).
 *
 * 2026-09-22 fix (see `docs/AI/BUGS/KNOWN_ISSUES.md`'s "Connection
 * terminated unexpectedly" entry) — the key now lives in `sessionStorage`,
 * scoped by a caller-supplied `scopeKey`, not a bare `useRef`. A `useRef`
 * is wiped the instant the component remounts — including the one moment
 * this matters most: an uncaught render crash forces a full page reload,
 * and the very next attempt would silently mint a brand-new key, with no
 * way to know it might be retrying an operation that had ALREADY
 * SUCCEEDED server-side moments earlier (confirmed live: a real Opening
 * Credit payment succeeded, then an unrelated crash blanked the page — a
 * reload right then would have lost the one thing proving it was the same
 * request). `sessionStorage` survives a reload but clears when the tab
 * closes — exactly the lifetime a "retry after this page broke" key needs.
 *
 * `scopeKey` must identify the logical operation the key protects (an
 * existing order's id for a payment on it; a fixed string like
 * `'order-create'` for "composing a new order," since only one such
 * composition is active per tab at a time). Reusing a stale key for a
 * genuinely different payload is still safe: the backend's fingerprint
 * check (`runIdempotent` in `idempotencyService.ts`) rejects a mismatched
 * payload under the same key with a 409 conflict rather than silently
 * returning someone else's result — a stale leftover key is, at worst, a
 * confusing-but-harmless rejection, never silent duplication or corrupted
 * data.
 *
 * `sessionStorage` access is wrapped in try/catch and falls back to a
 * `useRef`-backed map (this hook's pre-fix behavior — survives re-renders,
 * not reloads) for the rare case it's unavailable (private browsing,
 * storage disabled) — `getKey`/`resetKey` never throw either way.
 *
 * Deliberately NOT applied to `useIdempotencyKeyMap` below — its callers
 * (batch quick-sale line items) are shorter-lived, per-line operations;
 * tracked separately as a narrower-scope, not-yet-fixed gap in
 * `docs/AI/BUGS/KNOWN_ISSUES.md`.
 */
export function useIdempotencyKey() {
  const fallbackRef = useRef<Map<string, string>>(new Map());

  function storageKey(scopeKey: string): string {
    return `idempotencyKey:${scopeKey}`;
  }

  function getKey(scopeKey: string): string {
    try {
      const existing = sessionStorage.getItem(storageKey(scopeKey));
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(storageKey(scopeKey), fresh);
      return fresh;
    } catch {
      let key = fallbackRef.current.get(scopeKey);
      if (!key) {
        key = crypto.randomUUID();
        fallbackRef.current.set(scopeKey, key);
      }
      return key;
    }
  }

  function resetKey(scopeKey: string): void {
    fallbackRef.current.delete(scopeKey);
    try {
      sessionStorage.removeItem(storageKey(scopeKey));
    } catch {
      // Nothing to clean up if storage was never available.
    }
  }

  return { getKey, resetKey };
}

/**
 * Same lifecycle as `useIdempotencyKey`, but keyed per line-item id — for
 * the two multi-line quick-sale flows (`PosPage.tsx`'s "بيع مباشر",
 * `NewOrderPage.tsx`'s embedded quick-sale dialog), where each cart line is
 * its own independent atomic request against `POST
 * /api/inventory-items/:id/quick-sale`. A single shared key for the whole
 * batch would be wrong — retrying "the rest" after line 2 fails must not
 * touch line 1's (already-succeeded, already `done`) key, and line 3's
 * retry must reuse line 3's own key, not line 2's.
 */
export function useIdempotencyKeyMap<K = string>() {
  const mapRef = useRef(new Map<K, string>());

  function getKey(id: K): string {
    let key = mapRef.current.get(id);
    if (!key) {
      key = crypto.randomUUID();
      mapRef.current.set(id, key);
    }
    return key;
  }

  function resetKey(id: K): void {
    mapRef.current.delete(id);
  }

  return { getKey, resetKey };
}
