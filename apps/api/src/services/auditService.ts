import { prisma } from '../lib/prisma.js';
import type { AuditAction } from '../generated/prisma/enums.js';

type RecordAuditParams = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedById?: string | null;
  branchId?: string | null;
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
      previousValue:
        params.previousValue === undefined ? undefined : (params.previousValue as object),
      newValue: params.newValue === undefined ? undefined : (params.newValue as object),
    },
  });
}
