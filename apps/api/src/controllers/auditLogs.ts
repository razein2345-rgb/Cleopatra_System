import type { Request, Response } from 'express';
import { listAuditEntityTypes, listAuditLogs } from '../services/auditService.js';

/**
 * Owner ("مفيش شاشة لعرض الـAudit Log نفسه", UX_PRODUCT_AUDIT.md § مشكلة
 * 7.2) — read-only. Explicit SUPER_ADMIN check here (same
 * `roleNames.includes('SUPER_ADMIN')` pattern `listAttendanceForStaffHandler`
 * already uses) — this reveals every sensitive change across every module,
 * not just one, so it gets the same restriction attendance records do.
 */
export async function listAuditLogsHandler(req: Request, res: Response) {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Audit log is restricted to Super Admin' } });
    return;
  }
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
  const performedById = typeof req.query.performedById === 'string' ? req.query.performedById : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const logs = await listAuditLogs({ entityType, performedById, limit });
  res.json({ success: true, data: logs });
}

export async function listAuditEntityTypesHandler(req: Request, res: Response) {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Audit log is restricted to Super Admin' } });
    return;
  }
  const types = await listAuditEntityTypes();
  res.json({ success: true, data: types });
}
