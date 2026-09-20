import type { Prisma } from '../generated/prisma/client.js';

/**
 * Opening State / Cutover (Phase 3C.2) — generic transaction-scoped
 * Postgres advisory lock, extracted as its own primitive specifically so
 * the new Opening Credit consumption logic (orderService.ts::
 * applyOpeningCreditPayment) has a real shared home to call, rather than
 * writing a 4th independent inline copy of the same raw-SQL idiom already
 * duplicated three times in this codebase (treasuryService.ts's private
 * `withBranchDayLock`, posService.ts's `getOrCreateWalkInPartner`,
 * partnerChildEntity.ts's `setExclusiveDefaultByKey`).
 *
 * Deliberately NOT a retrofit of those three — each already works, and
 * touching proven treasury/POS/partner code purely for this feature would
 * be exactly the kind of unrelated-code churn this project's rules ask to
 * avoid. `setExclusiveDefaultByKey` was evaluated for direct reuse and
 * rejected (Phase 3C.1 audit): its fixed `unsetOthers`/`setTarget`
 * contract and its `P2002` → `ExclusiveDefaultConflictError` translation
 * are shaped for "exactly one default/primary flag per group," not for a
 * business-rule balance check that must throw *before* any write is
 * attempted.
 *
 * `pg_advisory_xact_lock` (not the session-scoped `pg_advisory_lock`) is
 * transaction-scoped — Postgres releases it automatically at commit or
 * rollback, so every read-then-write critical section this protects must
 * run inside the SAME `tx` this lock was acquired on, never against the
 * bare `prisma` client (mixing bare-`prisma` calls into a supposedly-
 * locked section defeats the guarantee). `hashtext()` converts the
 * arbitrary string key (a partner UUID, here) into the 32-bit int
 * `pg_advisory_xact_lock` requires — same conversion the three existing
 * copies already rely on.
 */
export async function acquireAdvisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
