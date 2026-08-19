import { prisma } from '../lib/prisma.js';
import type { AuditAction as PrismaAuditAction } from '../generated/prisma/enums.js';
import type { AuditLog } from '@cleopatra/shared';

type RecordAuditParams = {
  entityType: string;
  entityId: string;
  action: PrismaAuditAction;
  performedById?: string | null;
  branchId?: string | null;
  /**
   * Owning BusinessPartner id, for partner-scoped entities (see
   * `AuditLog.partnerId`'s schema doc comment — Timeline Preparation /
   * Activity Feed Ready). Omit for non-partner-scoped audit entries (IAM,
   * auth, settings/catalog CRUD).
   */
  partnerId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
};

/** Schema exists since Phase 1 (ADR 0013); this is the first write-path — auth-related actions per Phase 2. */
export async function recordAudit(params: RecordAuditParams) {
  await prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      performedById: params.performedById ?? null,
      branchId: params.branchId ?? null,
      partnerId: params.partnerId ?? null,
      previousValue:
        params.previousValue === undefined ? undefined : (params.previousValue as object),
      newValue: params.newValue === undefined ? undefined : (params.newValue as object),
    },
  });
}

export interface ListAuditLogsFilters {
  entityType?: string;
  performedById?: string;
  limit?: number;
}

/**
 * Owner ("مفيش شاشة لعرض الـAudit Log نفسه") — UX_PRODUCT_AUDIT.md § مشكلة
 * 7.2: `recordAudit` has been the write path since Phase 1, this is the
 * first read path. Read-only, no new write behavior. Newest first, capped
 * at `limit` (default 200) — this table has no delete/retention policy of
 * its own, so an unbounded query would only get slower as the system ages.
 */
export async function listAuditLogs(filters: ListAuditLogsFilters): Promise<AuditLog[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.performedById ? { performedById: filters.performedById } : {}),
    },
    include: { performedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 200,
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    performedById: row.performedById,
    performedByName: row.performedBy?.name ?? null,
    branchId: row.branchId,
    partnerId: row.partnerId,
    previousValue: row.previousValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Distinct `entityType` values actually present — populates the viewer's filter dropdown without hardcoding a list that would drift from `recordAudit`'s real callers. */
export async function listAuditEntityTypes(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ['entityType'],
    select: { entityType: true },
    orderBy: { entityType: 'asc' },
  });
  return rows.map((r) => r.entityType);
}
