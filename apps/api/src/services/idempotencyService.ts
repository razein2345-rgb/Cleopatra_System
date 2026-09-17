import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Accounting audit fix (2026-09-17, Phase 3 E) — generic, reusable
 * idempotency-key support for financial mutations that are safe to retry
 * exactly once (order creation, payment recording, POS quick sale,
 * SupplierPayment). Opt-in only: a caller with no key sent behaves EXACTLY
 * as before this file existed (no schema/API contract change for existing
 * clients).
 *
 * How it works: the key row is reserved (created) BEFORE the real work
 * runs. A second request racing on the SAME key hits the table's own
 * primary-key uniqueness and is told to wait/replay rather than re-running
 * the real work — this is what makes the guarantee real (a plain
 * check-then-act read-then-write would still race). Once the real work
 * finishes, the reservation is updated with the real response so a later
 * retry of the same key replays the ORIGINAL result instead of doing the
 * work again. If the real work throws, the reservation is deleted so a
 * genuine retry after a real failure is not permanently blocked.
 *
 * Deliberately NOT a distributed idempotency platform — one Postgres
 * table, one unique constraint, no external queue/cache. The key itself
 * is never invented/guessed server-side — it must be supplied by the
 * caller (a client-generated UUID, one per logical submission attempt),
 * exactly the "existing request identifier" pattern this task's own rules
 * prefer; a request with no key is simply not deduplicated.
 *
 * Payload fingerprint (owner's own Phase 3 continuation, §3D) — the same
 * key reused with a materially different payload is never silently
 * treated as a retry of the same request (that would let one client bug —
 * or a key collision — return someone else's order as if it were this
 * one). `fingerprint` must be a stable hash of exactly the fields that
 * define "the same logical request" for that endpoint (the caller decides
 * which fields matter, via `computeFingerprint`) — compared byte-for-byte
 * against what the ORIGINAL reservation stored; a mismatch is a clear,
 * typed conflict error, never a guess.
 *
 * Transactional consistency (owner's own Phase 3 continuation, §3C) — the
 * reservation and the real work are NOT literally inside one Prisma
 * `$transaction` (each protected service function already owns its own
 * transaction boundary; forcing every one of them to accept and thread an
 * externally-supplied `tx` client would be the kind of broad refactor this
 * task's own rules ask to avoid/flag). Documented, safe alternative
 * actually implemented instead: a reservation stuck at `statusCode: 0`
 * (the real work crashed between the reservation succeeding and the
 * update/delete step — e.g. the process was killed) is only ever a
 * problem if it blocks a genuine retry forever. `STALE_RESERVATION_MS`
 * bounds exactly how long that can happen: once a reservation is older
 * than that with no result recorded, a retry is allowed to reclaim it
 * (delete + re-reserve) instead of being refused indefinitely. This keeps
 * the real guarantee ("two concurrent requests can't both do the work")
 * for the timeframe that actually matters (concurrent requests arrive
 * within milliseconds of each other, not minutes apart), while bounding
 * the blast radius of a crash to `STALE_RESERVATION_MS` instead of "stuck
 * forever."
 */

/** How long a `statusCode: 0` reservation is trusted as "genuinely still running" before a retry may reclaim it. */
const STALE_RESERVATION_MS = 30_000;

export class IdempotencyKeyInProgressError extends Error {
  constructor() {
    super('A request with this idempotency key is already being processed');
    this.name = 'IdempotencyKeyInProgressError';
  }
}

export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super('This idempotency key was already used for a different request');
    this.name = 'IdempotencyKeyConflictError';
  }
}

export interface IdempotentResult<T> {
  body: T;
  statusCode: number;
  replayed: boolean;
}

/** Stable hash of exactly the fields the caller says define "the same logical request" — order-of-keys-independent via JSON.stringify on a pre-sorted object is NOT assumed; callers must pass a plain object/array with a deterministic shape (e.g. destructure only the meaningful fields in a fixed order). */
export function computeFingerprint(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Runs `fn` at most once per `key`. `fn` must return the exact
 * `{statusCode, body}` shape the caller intends to send back — this is
 * what gets replayed verbatim on a duplicate submission of the same key.
 */
export async function runIdempotent<T>(
  key: string | undefined,
  staffId: string,
  endpoint: string,
  fingerprintPayload: unknown,
  fn: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (!key) {
    const result = await fn();
    return { ...result, replayed: false };
  }

  const requestFingerprint = computeFingerprint(fingerprintPayload);

  const reserve = () => prisma.idempotencyKey.create({ data: { key, staffId, endpoint, requestFingerprint, statusCode: 0, responseBody: {} } });

  try {
    await reserve();
  } catch {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) {
      // Reclaimed/deleted between our failed create and this read (a
      // legitimate retry racing another one) — safe to just try again once.
      await reserve();
      return runWork();
    }
    if (existing.statusCode !== 0) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyKeyConflictError();
      }
      return { statusCode: existing.statusCode, body: existing.responseBody as T, replayed: true };
    }
    // statusCode === 0: another attempt is (or was) in flight.
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs < STALE_RESERVATION_MS) {
      // Genuinely concurrent — never re-run the work ourselves; that is
      // exactly the merge risk this mechanism exists to prevent.
      throw new IdempotencyKeyInProgressError();
    }
    // Stale — the original attempt almost certainly crashed before
    // recording a result. Reclaim the key (delete + re-reserve) rather
    // than blocking this identity forever.
    await prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
    await reserve();
  }

  return runWork();

  async function runWork(): Promise<IdempotentResult<T>> {
    try {
      const result = await fn();
      await prisma.idempotencyKey.update({
        where: { key },
        data: { statusCode: result.statusCode, responseBody: result.body as object },
      });
      return { ...result, replayed: false };
    } catch (err) {
      await prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw err;
    }
  }
}

/** Reads the optional `Idempotency-Key` request header — a caller that never sends it is completely unaffected by anything in this file. */
export function idempotencyKeyFromHeader(headerValue: unknown): string | undefined {
  return typeof headerValue === 'string' && headerValue.trim().length > 0 ? headerValue.trim() : undefined;
}

/** Shared HTTP response mapping for the two error types `runIdempotent` can throw — one place instead of repeating this in every controller that uses it. Returns `true` if it handled the error (caller should stop), `false` otherwise. */
export function sendIdempotencyError(err: unknown, res: Response): boolean {
  if (err instanceof IdempotencyKeyInProgressError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'IDEMPOTENCY_KEY_IN_PROGRESS' } });
    return true;
  }
  if (err instanceof IdempotencyKeyConflictError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    return true;
  }
  return false;
}
