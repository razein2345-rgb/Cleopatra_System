import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ADMIN_ROLE_NAMES, hasAdminRole } from '@cleopatra/shared';
import { recordAudit } from './auditService.js';

export { ADMIN_ROLE_NAMES, hasAdminRole };

export class LastActiveAdminError extends Error {
  constructor() {
    super('You cannot deactivate the last active administrator.');
    this.name = 'LastActiveAdminError';
  }
}

/**
 * Pure decision at the core of the safety rule: would this change leave the
 * system with zero active Administrators? Kept side-effect free so it can be
 * unit-tested without a database.
 */
export function wouldOrphanAdministrators(
  isCurrentlyActiveAdmin: boolean,
  willRemainActiveAdmin: boolean,
  otherActiveAdminCount: number,
): boolean {
  if (!isCurrentlyActiveAdmin || willRemainActiveAdmin) return false;
  return otherActiveAdminCount === 0;
}

/**
 * The scope within which "other active administrators" are counted.
 * Today there is only one scope — the whole system (single-tenant). A
 * future multi-company system (VISION.md's Scalability axis: "Single
 * Company → Multiple Companies") reads `current.companyId` here and
 * returns `{ companyId: current.companyId }` instead — this is the one
 * place that behavior changes. `assertNotLastActiveAdmin` and every
 * controller that calls it stay exactly as they are; nobody else computes
 * or passes a scope.
 */
function otherActiveAdminScopeWhere(
  current: Pick<Prisma.StaffProfileGetPayload<object>, 'id'>,
): Prisma.StaffProfileWhereInput {
  void current; // Global today — see doc comment above.
  return {};
}

type AdminSafetyOperation =
  | 'DEACTIVATE'
  | 'DELETE'
  | 'REMOVE_ADMIN_ROLE'
  | 'BLOCK'
  | 'ARCHIVE';

/**
 * The single, mandatory guard for every operation that can leave the
 * system with zero active Administrators — deactivating, deleting,
 * blocking, archiving, or stripping the last Administrator/Super Admin
 * role from a staff member. **Every current and future such operation
 * must call this — never re-implement the check.**
 *
 * On rejection, records its own `SECURITY_REJECTION` audit entry (reason
 * `LAST_ACTIVE_ADMIN`) before throwing `LastActiveAdminError` — callers
 * map that to `409 { code: 'LAST_ACTIVE_ADMIN' }` and never audit the
 * rejection themselves, so this stays the single place both the decision
 * and its audit trail live. See ADR 0028.
 */
async function assertNotLastActiveAdmin(params: {
  staffId: string;
  willRemainActiveAdmin: boolean;
  performedById: string;
  operation: AdminSafetyOperation;
}): Promise<void> {
  const { staffId, willRemainActiveAdmin, performedById, operation } = params;

  const current = await prisma.staffProfile.findUnique({
    where: { id: staffId },
    include: { roles: { include: { role: true } } },
  });
  if (!current) return;

  const isCurrentlyActiveAdmin =
    current.isActive && !current.isDeleted && hasAdminRole(current.roles.map((r) => r.role.name));

  if (!isCurrentlyActiveAdmin || willRemainActiveAdmin) return;

  const otherActiveAdminCount = await prisma.staffProfile.count({
    where: {
      id: { not: staffId },
      isActive: true,
      isDeleted: false,
      roles: { some: { role: { name: { in: [...ADMIN_ROLE_NAMES] } } } },
      ...otherActiveAdminScopeWhere(current),
    },
  });

  if (!wouldOrphanAdministrators(isCurrentlyActiveAdmin, willRemainActiveAdmin, otherActiveAdminCount)) {
    return;
  }

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: staffId,
    action: 'SECURITY_REJECTION',
    performedById,
    branchId: current.branchId,
    newValue: { reason: 'LAST_ACTIVE_ADMIN', operation },
  });

  throw new LastActiveAdminError();
}

/**
 * The mandatory single entry point for the last-active-administrator
 * safety rule (ADR 0028). Import and call `AdminSafetyService.
 * assertNotLastActiveAdmin(...)` — never re-implement the admin-headcount
 * check, and never bypass this service, for this operation or any future
 * one that can orphan the system (Block, Archive, ...).
 */
export const AdminSafetyService = {
  assertNotLastActiveAdmin,
};
