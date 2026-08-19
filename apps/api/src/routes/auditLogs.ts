import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { listAuditEntityTypesHandler, listAuditLogsHandler } from '../controllers/auditLogs.js';

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth);

// SUPER_ADMIN check happens inside each handler (same pattern as
// attendance.ts) — no `requirePermission` here since this isn't gated by
// the regular permission catalog, it's an explicit role restriction.
auditLogsRouter.get('/', listAuditLogsHandler);
auditLogsRouter.get('/entity-types', listAuditEntityTypesHandler);
