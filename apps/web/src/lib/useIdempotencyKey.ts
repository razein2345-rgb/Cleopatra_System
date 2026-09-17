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
 * `useRef` (not `useState`) is deliberate: the key must survive re-renders
 * without ever triggering one, and reading/writing it must never be
 * "stale" the way a state value can be inside a closure — this is
 * lifecycle-scoped identity, not render-affecting data.
 *
 * `getKey()` is idempotent itself — call it every time right before
 * sending the request; it only mints a new UUID the first time (or after
 * `resetKey()`), so calling it again on a retry hands back the exact same
 * string. `resetKey()` must be called after a *definitive success* — never
 * after a failure (a failed attempt should be retried with the SAME key,
 * which is safe: the backend deletes its own reservation whenever the
 * protected work throws, so retrying with the same key after a real
 * failure simply reprocesses fresh, no stale-conflict risk).
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  function getKey(): string {
    if (!keyRef.current) {
      keyRef.current = crypto.randomUUID();
    }
    return keyRef.current;
  }

  function resetKey(): void {
    keyRef.current = null;
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
