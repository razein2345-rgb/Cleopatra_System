import type { Request, Response } from 'express';
import { createContentCalendarEntrySchema, updateContentCalendarEntrySchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import {
  ContentCalendarEntryNotFoundError,
  createContentCalendarEntry,
  deleteContentCalendarEntry,
  getContentCalendarEntryBranchId,
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

/**
 * Branch access on edit/delete (owner decision, 2026-09-25 - found in the CRM review). Checked
 * against the ENTRY's own branch, never the caller's home branch, and against the destination
 * when an edit moves it. A company-wide entry (no branch) stays editable by anyone holding the
 * permission, exactly as before. Returns the entry's branch id (null = company-wide), or
 * `undefined` once a response (404/403) was already sent.
 */
async function authorizeEntryBranch(req: Request<{ id: string }>, res: Response, destinationBranchId?: string | null): Promise<string | null | undefined> {
  const auth = req.auth!;
  let entryBranchId: string | null;
  try {
    entryBranchId = await getContentCalendarEntryBranchId(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return undefined;
    throw err;
  }
  if ((entryBranchId && !canAccessBranch(auth, entryBranchId)) || (destinationBranchId && !canAccessBranch(auth, destinationBranchId))) {
    forbidBranch(res);
    return undefined;
  }
  return entryBranchId;
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
  const originalBranchId = await authorizeEntryBranch(req, res, input.branchId);
  if (originalBranchId === undefined) return;

  try {
    const entry = await updateContentCalendarEntry(req.params.id, input);
    await recordAudit({
      entityType: 'ContentCalendarEntry',
      entityId: entry.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      // the entry's ORIGINAL branch; a branch move is visible in newValue
      branchId: originalBranchId,
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
  const entryBranchId = await authorizeEntryBranch(req, res);
  if (entryBranchId === undefined) return;

  try {
    await deleteContentCalendarEntry(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'ContentCalendarEntry', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId, branchId: entryBranchId });
  res.json({ success: true, data: { id: req.params.id } });
}
