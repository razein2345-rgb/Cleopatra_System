-- Accounting audit continuation (2026-09-17, Phase 3 §3D) — reusing the
-- same key with a materially different payload must be a clear conflict,
-- never a silent replay of an unrelated cached result. `IdempotencyKey`
-- was created earlier in this same session with zero rows in production
-- (nothing has used it yet), so this required column needs no backfill.

ALTER TABLE "IdempotencyKey" ADD COLUMN "requestFingerprint" TEXT NOT NULL;
