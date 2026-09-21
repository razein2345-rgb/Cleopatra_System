import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17, Phase 3 E) — regression coverage for
 * the generic idempotency-key helper, covering the exact 6 scenarios the
 * owner's own Phase 3 continuation asked for:
 * 1. first request succeeds normally
 * 2. exact retry (same key + same payload) replays the cached result
 * 3. same key + different payload is a clear conflict, never a silent replay
 * 4. a failed attempt releases the key so a genuine retry is not blocked
 * 5. two concurrent requests on the same key — exactly one does the work
 * 6. two different keys never collide with each other
 */

const idempotencyKeyCreate = vi.fn();
const idempotencyKeyFindUnique = vi.fn();
const idempotencyKeyUpdate = vi.fn();
const idempotencyKeyDelete = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    idempotencyKey: {
      create: (...args: unknown[]) => idempotencyKeyCreate(...args),
      findUnique: (...args: unknown[]) => idempotencyKeyFindUnique(...args),
      update: (...args: unknown[]) => idempotencyKeyUpdate(...args),
      delete: (...args: unknown[]) => idempotencyKeyDelete(...args),
    },
  },
}));

const { runIdempotent, computeFingerprint, IdempotencyKeyInProgressError, IdempotencyKeyConflictError } = await import(
  './idempotencyService.js'
);

describe('runIdempotent', () => {
  beforeEach(() => {
    idempotencyKeyCreate.mockReset();
    idempotencyKeyFindUnique.mockReset();
    idempotencyKeyUpdate.mockReset();
    idempotencyKeyDelete.mockReset();
  });

  it('with no key, runs the work directly and never touches the idempotency table at all', async () => {
    const fn = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'order-1' } });

    const result = await runIdempotent(undefined, 'staff-1', 'POST /api/orders', { amount: 100 }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ statusCode: 201, body: { id: 'order-1' }, replayed: false });
    expect(idempotencyKeyCreate).not.toHaveBeenCalled();
  });

  it('Test 1 — first request: reserves the key, runs the work once, and stores the real result with its fingerprint', async () => {
    idempotencyKeyCreate.mockResolvedValue({});
    idempotencyKeyUpdate.mockResolvedValue({});
    const fn = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'order-1' } });

    const result = await runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 100 }, fn);

    expect(idempotencyKeyCreate).toHaveBeenCalledWith({
      data: {
        key: 'key-abc',
        staffId: 'staff-1',
        endpoint: 'POST /api/orders',
        requestFingerprint: computeFingerprint({ amount: 100 }),
        statusCode: 0,
        responseBody: {},
      },
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(idempotencyKeyUpdate).toHaveBeenCalledWith({
      where: { key: 'key-abc' },
      data: { statusCode: 201, responseBody: { id: 'order-1' } },
    });
    expect(result).toEqual({ statusCode: 201, body: { id: 'order-1' }, replayed: false });
  });

  it('Test 2 — exact retry (same key, same payload) replays the cached result and never re-runs the work', async () => {
    idempotencyKeyCreate.mockRejectedValue(new Error('unique constraint violation'));
    idempotencyKeyFindUnique.mockResolvedValue({
      key: 'key-abc',
      statusCode: 201,
      responseBody: { id: 'order-1' },
      requestFingerprint: computeFingerprint({ amount: 100 }),
      createdAt: new Date(),
    });
    const fn = vi.fn();

    const result = await runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 100 }, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result).toEqual({ statusCode: 201, body: { id: 'order-1' }, replayed: true });
  });

  it('Test 3 — same key, different payload: a clear conflict error, never a silent replay of the old result', async () => {
    idempotencyKeyCreate.mockRejectedValue(new Error('unique constraint violation'));
    idempotencyKeyFindUnique.mockResolvedValue({
      key: 'key-abc',
      statusCode: 201,
      responseBody: { id: 'order-1' },
      requestFingerprint: computeFingerprint({ amount: 100 }), // original request was amount:100
      createdAt: new Date(),
    });
    const fn = vi.fn();

    // This retry claims the SAME key but for a DIFFERENT amount.
    await expect(runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 999 }, fn)).rejects.toThrow(
      IdempotencyKeyConflictError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('Test 4 — a failed attempt releases the key (deletes the reservation) so a genuine retry is not permanently blocked', async () => {
    idempotencyKeyCreate.mockResolvedValue({});
    idempotencyKeyDelete.mockResolvedValue({});
    const fn = vi.fn().mockRejectedValue(new Error('db exploded'));

    await expect(runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 100 }, fn)).rejects.toThrow('db exploded');

    expect(idempotencyKeyDelete).toHaveBeenCalledWith({ where: { key: 'key-abc' } });
    expect(idempotencyKeyUpdate).not.toHaveBeenCalled();
  });

  it('Test 5 — a concurrent duplicate (same key, still in flight) is refused, never silently re-run', async () => {
    idempotencyKeyCreate.mockRejectedValue(new Error('unique constraint violation'));
    idempotencyKeyFindUnique.mockResolvedValue({
      key: 'key-abc',
      statusCode: 0, // still running right now
      responseBody: {},
      requestFingerprint: computeFingerprint({ amount: 100 }),
      createdAt: new Date(), // fresh — well within the "genuinely concurrent" window
    });
    const fn = vi.fn();

    await expect(runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 100 }, fn)).rejects.toThrow(
      IdempotencyKeyInProgressError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('a STALE in-flight reservation (crashed before recording a result) is reclaimed instead of blocking forever', async () => {
    idempotencyKeyCreate
      .mockRejectedValueOnce(new Error('unique constraint violation')) // first attempt: row already exists
      .mockResolvedValueOnce({}); // second attempt, after reclaim: succeeds
    idempotencyKeyFindUnique.mockResolvedValue({
      key: 'key-abc',
      statusCode: 0,
      responseBody: {},
      requestFingerprint: computeFingerprint({ amount: 100 }),
      createdAt: new Date(Date.now() - 60_000), // 60s old — well past the staleness threshold
    });
    idempotencyKeyDelete.mockResolvedValue({});
    idempotencyKeyUpdate.mockResolvedValue({});
    const fn = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'order-recovered' } });

    const result = await runIdempotent('key-abc', 'staff-1', 'POST /api/orders', { amount: 100 }, fn);

    expect(idempotencyKeyDelete).toHaveBeenCalledWith({ where: { key: 'key-abc' } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.body).toEqual({ id: 'order-recovered' });
  });

  it('Test 6 — two different keys never collide with each other, each runs its own work independently', async () => {
    idempotencyKeyCreate.mockResolvedValue({});
    idempotencyKeyUpdate.mockResolvedValue({});
    const fnA = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'order-A' } });
    const fnB = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'order-B' } });

    const resultA = await runIdempotent('key-A', 'staff-1', 'POST /api/orders', { amount: 100 }, fnA);
    const resultB = await runIdempotent('key-B', 'staff-1', 'POST /api/orders', { amount: 200 }, fnB);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(resultA.body).toEqual({ id: 'order-A' });
    expect(resultB.body).toEqual({ id: 'order-B' });
  });
});

describe('computeFingerprint', () => {
  it('the same payload always produces the same fingerprint', () => {
    expect(computeFingerprint({ amount: 100, note: 'x' })).toBe(computeFingerprint({ amount: 100, note: 'x' }));
  });

  it('a different payload produces a different fingerprint', () => {
    expect(computeFingerprint({ amount: 100 })).not.toBe(computeFingerprint({ amount: 200 }));
  });
});
