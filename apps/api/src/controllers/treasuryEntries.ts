import type { Request, Response } from 'express';
import { createTreasuryEntrySchema, hasPermission, treasuryTypeSchema, updateTreasuryEntrySchema } from '@cleopatra/shared';
import {
  createManualTreasuryEntry,
  deleteManualTreasuryEntry,
  getMyTreasurySummary,
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
 * to their own entries here, not at the route layer — same "one DTO,
 * permission-shaped by value" precedent as `orders.ts`'s `canSeeInternal`.
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
    staffId: canSeeAll ? undefined : auth.staffId,
  });
  res.json({ success: true, data: entries });
}

/** Full org-wide balance — `treasury.view` only (see routes file), never reachable by a `treasury.create`-only caller. */
export async function getTreasuryBalanceHandler(_req: Request, res: Response) {
  const balance = await getTreasuryBalance();
  res.json({ success: true, data: balance });
}

/** The reception-safe alternative to the balance endpoint above — a caller's own total only, never the org-wide figure. */
export async function getMyTreasurySummaryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const summary = await getMyTreasurySummary(auth.staffId);
  res.json({ success: true, data: summary });
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
