import type { Request, Response } from 'express';
import { createCallLogSchema, listCallLogsQuerySchema, updateCallLogSchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import { CallLogNotFoundError, createCallLog, deleteCallLog, listCallLogs, updateCallLog } from '../services/callLogService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CallLogNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
}

export async function listCallLogsHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const query = listCallLogsQuerySchema.parse(req.query);
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;
  const logs = await listCallLogs({ ...query, branchIds });
  res.json({ success: true, data: logs });
}

export async function createCallLogHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createCallLogSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const log = await createCallLog(input, auth.staffId);
  await recordAudit({
    entityType: 'CallLog',
    entityId: log.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: log.branchId,
    partnerId: log.partnerId,
    newValue: { direction: log.direction, purpose: log.purpose, outcome: log.outcome },
  });
  res.status(201).json({ success: true, data: log });
}

export async function updateCallLogHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateCallLogSchema.parse(req.body);

  try {
    const log = await updateCallLog(req.params.id, input);
    await recordAudit({
      entityType: 'CallLog',
      entityId: log.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: log.branchId,
      partnerId: log.partnerId,
      newValue: input,
    });
    res.json({ success: true, data: log });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function deleteCallLogHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteCallLog(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'CallLog', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId });
  res.json({ success: true, data: { id: req.params.id } });
}
