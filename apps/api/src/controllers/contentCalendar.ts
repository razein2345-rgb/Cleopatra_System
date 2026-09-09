import type { Request, Response } from 'express';
import { createContentCalendarEntrySchema, updateContentCalendarEntrySchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import {
  ContentCalendarEntryNotFoundError,
  createContentCalendarEntry,
  deleteContentCalendarEntry,
  listContentCalendarEntries,
  updateContentCalendarEntry,
} from '../services/contentCalendarService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof ContentCalendarEntryNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
}

export async function listContentCalendarEntriesHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;
  const entries = await listContentCalendarEntries({ branchIds });
  res.json({ success: true, data: entries });
}

export async function createContentCalendarEntryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createContentCalendarEntrySchema.parse(req.body);

  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const entry = await createContentCalendarEntry(input, auth.staffId);
  await recordAudit({
    entityType: 'ContentCalendarEntry',
    entityId: entry.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: entry.branchId,
    newValue: { title: entry.title, platform: entry.platform, scheduledDate: entry.scheduledDate },
  });
  res.status(201).json({ success: true, data: entry });
}

export async function updateContentCalendarEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateContentCalendarEntrySchema.parse(req.body);

  try {
    const entry = await updateContentCalendarEntry(req.params.id, input);
    await recordAudit({
      entityType: 'ContentCalendarEntry',
      entityId: entry.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: entry.branchId,
      newValue: input,
    });
    res.json({ success: true, data: entry });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function deleteContentCalendarEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteContentCalendarEntry(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'ContentCalendarEntry', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId });
  res.json({ success: true, data: { id: req.params.id } });
}
