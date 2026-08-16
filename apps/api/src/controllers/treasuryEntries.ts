import type { Request, Response } from 'express';
import { createTreasuryEntrySchema, hasPermission, treasuryTypeSchema, updateTreasuryEntrySchema } from '@cleopatra/shared';
import {
  closeTreasuryDay,
  createManualTreasuryEntry,
  DayAlreadyClosedError,
  deleteManualTreasuryEntry,
  getMyTreasurySummary,
  getTodayClosure,
  getTreasuryBalance,
  listTreasuryEntries,
  ManualEntryOnlyError,
  TreasuryEntryNotFoundError,
  updateManualTreasuryEntry,
} from '../services/treasuryService.js';
import { recordAudit } from '../services/auditService.js';

/**
 * FEATURE-007 M3 — the route only requires `treasury.create` (see routes
 * file), so any caller lacking `treasury.view` (e.g. reception) is scoped
 * here, not at the route layer — same "one DTO, permission-shaped by
 * value" precedent as `orders.ts`'s `canSeeInternal`. Scoped by branch
 * (2026-08-13 owner decision — see `listTreasuryEntries`'s own doc
 * comment), not by staff — everyone assigned to a branch sees that
 * branch's whole ledger.
 */
export async function listTreasuryEntriesHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const canSeeAll = hasPermission(auth.permissions, 'treasury.view');

  const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;
  const typeResult = typeParam ? treasuryTypeSchema.safeParse(typeParam) : undefined;
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const entries = await listTreasuryEntries({
    type: typeResult?.success ? typeResult.data : undefined,
    dateFrom,
    dateTo,
    search,
    branchId: canSeeAll ? undefined : auth.branchId,
  });
  res.json({ success: true, data: entries });
}

/** Full org-wide balance — `treasury.view` only (see routes file), never reachable by a `treasury.create`-only caller. */
export async function getTreasuryBalanceHandler(_req: Request, res: Response) {
  const balance = await getTreasuryBalance();
  res.json({ success: true, data: balance });
}

/** The reception-safe alternative to the balance endpoint above — the caller's own branch total only, never the org-wide figure. */
export async function getMyTreasurySummaryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const summary = await getMyTreasurySummary(auth.branchId);
  res.json({ success: true, data: summary });
}

/** FEATURE-016 — whether the caller's own branch has already closed today; null if not. Same access level as `/my-summary` (`treasury.create` is enough). */
export async function getTodayClosureHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const closure = await getTodayClosure(auth.branchId);
  res.json({ success: true, data: closure });
}

/** FEATURE-016 — closes the caller's own branch's day (review/summary marker only, never a lock — see `closeTreasuryDay`'s own doc comment). */
export async function closeTreasuryDayHandler(req: Request, res: Response) {
  const auth = req.auth!;
  let closure;
  try {
    closure = await closeTreasuryDay(auth.branchId, auth.staffId);
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_ALREADY_CLOSED' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'TreasuryDayClosure',
    entityId: closure.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: closure.branchId,
    newValue: { date: closure.date, totalAtClose: closure.totalAtClose, entryCountAtClose: closure.entryCountAtClose },
  });

  res.status(201).json({ success: true, data: closure });
}

export async function createTreasuryEntryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createTreasuryEntrySchema.parse(req.body);
  const created = await createManualTreasuryEntry(input, auth.staffId);

  await recordAudit({
    entityType: 'TreasuryEntry',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    partnerId: created.partnerId ?? undefined,
    newValue: { type: created.type, amount: created.amount, category: created.category },
  });

  res.status(201).json({ success: true, data: created });
}

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof TreasuryEntryNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof ManualEntryOnlyError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'MANUAL_ENTRY_ONLY' } });
    return true;
  }
  return false;
}

export async function updateTreasuryEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateTreasuryEntrySchema.parse(req.body);

  let updated;
  try {
    updated = await updateManualTreasuryEntry(req.params.id, input);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'TreasuryEntry',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.partnerId ?? undefined,
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

export async function deleteTreasuryEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteManualTreasuryEntry(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'TreasuryEntry',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
