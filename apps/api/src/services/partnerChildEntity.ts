import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Standard toolkit for a child entity scoped to a BusinessPartner. The
 * `setExclusiveDefault`/`canBeDefault` pair is specifically for entities
 * that also carry an "exactly one default/primary per group" flag — the
 * shape shared by `ContactPerson.isPrimary` (M2) and
 * `PartnerAddress.isDefault` (M3). See PROJECT_MEMORY.md's "Exactly one
 * flagged row per group" decision for the full rationale. Every future
 * default-flag entity should build on these rather than reimplementing
 * the lookup/lock/transaction/conflict/inactive-check shape.
 */

export async function loadPartnerOr404(
  partnerId: string,
  res: Response,
): Promise<{ id: string; branchId: string } | null> {
  const partner = await prisma.businessPartner.findUnique({
    where: { id: partnerId },
    select: { id: true, branchId: true, isDeleted: true },
  });
  if (!partner || partner.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return null;
  }
  return partner;
}

/**
 * Thrown when a `setExclusiveDefault` write loses a race to the target
 * model's DB partial unique index despite the row lock — callers
 * translate this into their own domain-specific 409 response (the code
 * and message differ per entity, e.g. `PRIMARY_CONTACT_CONFLICT` vs.
 * `DEFAULT_ADDRESS_CONFLICT`).
 */
export class ExclusiveDefaultConflictError extends Error {
  constructor() {
    super('Another request already changed the default/primary record');
    this.name = 'ExclusiveDefaultConflictError';
  }
}

/**
 * Standard write for "exactly one default/primary row per group". Locks
 * the owning BusinessPartner row inside an interactive transaction —
 * serializing every concurrent default/primary-setting request for that
 * partner — then runs `unsetOthers` followed by `setTarget`. The caller
 * must additionally define a DB partial unique index on the target model
 * as the independent backstop (see `ContactPerson.isPrimary` /
 * `PartnerAddress.isDefault` in schema.prisma for examples);
 * `ExclusiveDefaultConflictError` is thrown if that index is ever hit
 * despite the lock (e.g. a future code path that writes without going
 * through this helper).
 */
export async function setExclusiveDefault<T>(params: {
  partnerId: string;
  unsetOthers: (tx: Prisma.TransactionClient) => Promise<unknown>;
  setTarget: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessPartner" WHERE id = ${params.partnerId} FOR UPDATE`;
      await params.unsetOthers(tx);
      return params.setTarget(tx);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ExclusiveDefaultConflictError();
    }
    throw err;
  }
}

/** Shared invariant: an inactive row can never hold a default/primary flag. */
export function canBeDefault(entity: { isActive: boolean }): boolean {
  return entity.isActive;
}

/**
 * FEATURE-006 M5 — the same "exactly one default per group" write,
 * generalized for a group with no natural parent row to lock (unlike
 * `BusinessPartner` for `ContactPerson`/`PartnerAddress`). Uses a
 * transaction-scoped Postgres advisory lock keyed by `lockKey` instead of
 * `SELECT ... FOR UPDATE` on a specific row — serializes every concurrent
 * default-setting request for the same key, released automatically at
 * transaction end, and works even when zero rows of the group exist yet
 * (a real row lock can't be taken on nothing). The DB partial unique
 * index remains the required independent backstop, exactly as
 * `setExclusiveDefault`'s own doc comment already establishes — this
 * function does not replace that requirement, only the lock mechanism.
 */
export async function setExclusiveDefaultByKey<T>(params: {
  lockKey: string;
  unsetOthers: (tx: Prisma.TransactionClient) => Promise<unknown>;
  setTarget: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock returns void — $executeRaw (no result-set
      // deserialization) is required here; $queryRaw fails trying to
      // deserialize a `void` column.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.lockKey}))`;
      await params.unsetOthers(tx);
      return params.setTarget(tx);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ExclusiveDefaultConflictError();
    }
    throw err;
  }
}
