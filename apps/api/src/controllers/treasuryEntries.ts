import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  closeTreasuryDaySchema,
  createTreasuryEntrySchema,
  hasPermission,
  reopenTreasuryDaySchema,
  treasuryTypeSchema,
  updateStockMovementSchema,
  updateTreasuryEntrySchema,
} from '@cleopatra/shared';
import {
  closeTreasuryDay,
  createManualTreasuryEntry,
  DayAlreadyClosedError,
  DayNotClosedError,
  deleteManualTreasuryEntry,
  getDayClosurePreview,
  getMyTreasurySummary,
  getTodayClosure,
  getTreasuryBalance,
  listTreasuryEntries,
  ManualEntryOnlyError,
  reopenTreasuryDay,
  TreasuryEntryNotFoundError,
  updateManualTreasuryEntry,
} from '../services/treasuryService.js';
import { deleteStockMovement, StockMovementNotFoundError, updateStockMovement } from '../services/inventoryService.js';
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
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;

  const entries = await listTreasuryEntries({
    type: typeResult?.success ? typeResult.data : undefined,
    dateFrom,
    dateTo,
    search,
    branchId: canSeeAll ? undefined : auth.branchId,
    partnerId,
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

/**
 * A `treasury.view` holder (admin overseeing multiple branches) may target
 * any branch via `?branchId=`/body `branchId`; everyone else — reception,
 * `treasury.create`-only — is always locked to their own assigned branch
 * regardless of what they send, same "one endpoint, permission-shaped by
 * value" precedent as `listTreasuryEntriesHandler`'s `canSeeAll`.
 */
function resolveTargetBranchId(req: Request, requested: string | undefined): string {
  const auth = req.auth!;
  if (requested && hasPermission(auth.permissions, 'treasury.view')) return requested;
  return auth.branchId;
}

/** FEATURE-016 — whether the target branch has already closed today (and its full reconciliation, if so); null if not. Same access level as `/my-summary` (`treasury.create` is enough) — branch override for admins, see `resolveTargetBranchId`. */
export async function getTodayClosureHandler(req: Request, res: Response) {
  const branchId = resolveTargetBranchId(req, typeof req.query.branchId === 'string' ? req.query.branchId : undefined);
  const closure = await getTodayClosure(branchId);
  res.json({ success: true, data: closure });
}

/** FEATURE-016, rebuilt 2026-08-18 — the live opening/inflows/outflows/expected numbers for today, before the employee commits a close. Same access level as recording entries in the first place — branch override for admins, see `resolveTargetBranchId`. */
export async function getDayClosurePreviewHandler(req: Request, res: Response) {
  const branchId = resolveTargetBranchId(req, typeof req.query.branchId === 'string' ? req.query.branchId : undefined);
  const preview = await getDayClosurePreview(branchId);
  res.json({ success: true, data: preview });
}

/**
 * FEATURE-016, rebuilt 2026-08-18 per the owner's spec — a real cash-drawer
 * reconciliation now, and it DOES lock new entries for the day
 * (`assertBranchDayNotClosed`, enforced at every treasury-entry write path
 * — see each one's own comment), unlike the old review-marker version.
 */
export async function closeTreasuryDayHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = closeTreasuryDaySchema.parse(req.body);
  const branchId = resolveTargetBranchId(req, input.branchId);

  let closure;
  try {
    closure = await closeTreasuryDay(branchId, auth.staffId, input.actualCountedCash, input.notes);
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
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    branchId: closure.branchId,
    newValue: {
      date: closure.date,
      openingBalance: closure.openingBalance,
      totalInflows: closure.totalInflows,
      totalOutflows: closure.totalOutflows,
      expectedClosingBalance: closure.expectedClosingBalance,
      actualCountedCash: closure.actualCountedCash,
      difference: closure.difference,
    },
  });

  res.status(201).json({ success: true, data: closure });
}

/**
 * FEATURE-016 — reopening a closed day is a stricter action than closing
 * one (owner: "Reopening should require the appropriate authorized
 * permission"). Gated to SUPER_ADMIN/ADMIN role names directly, the same
 * "stricter than the module's own permission" precedent already used for
 * the attendance-admin screen (`attendance.ts`'s
 * `listAttendanceForStaffHandler`) — not a `treasury.*` permission key,
 * since CASHIER already holds the `treasury.*` wildcard for day-to-day
 * work and would otherwise inherit reopen access too.
 */
export async function reopenTreasuryDayHandler(req: Request, res: Response) {
  const auth = req.auth!;
  if (!auth.roleNames.includes('SUPER_ADMIN') && !auth.roleNames.includes('ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Reopening a closed day is restricted to admins' } });
    return;
  }

  const input = reopenTreasuryDaySchema.parse(req.body);
  const branchId = resolveTargetBranchId(req, input.branchId);

  let closure;
  try {
    closure = await reopenTreasuryDay(branchId, input.date, auth.staffId, input.reason);
  } catch (err) {
    if (err instanceof DayNotClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_NOT_CLOSED' } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'TreasuryDayClosure',
    entityId: closure.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    branchId: closure.branchId,
    newValue: { date: closure.date, reopenReason: closure.reopenReason },
  });

  res.json({ success: true, data: closure });
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

/**
 * Owner (2026-08-23, "البيع السريع المفروض اقدر اعدله من الخزينة احذفه
 * مثلا وهكذا") — a QUICK_SALE-sourced entry couldn't be corrected from
 * here at all (`updateManualTreasuryEntry`/`deleteManualTreasuryEntry`
 * are deliberately MANUAL-only, so they never applied to it — see
 * `ManualEntryOnlyError`). Rather than loosen those to cover every
 * automatic sourceType (which would let an INVOICE_PAYMENT/RETURN/
 * SALARY_PAYMENT entry drift out of sync with the Payment/OrderItemReturn/
 * SalaryPayment row it's paired with), this reuses the existing, already-
 * correct `updateStockMovement`/`deleteStockMovement` — a quick sale's
 * real source of truth is its StockMovement, and those two already
 * cascade the linked TreasuryEntry correctly. This handler is just a
 * treasury-entry-id-shaped door into that same logic, so the Treasury
 * screen doesn't need to know the underlying inventory item id.
 */
async function loadQuickSaleMovementId(entryId: string, res: Response): Promise<string | null> {
  const entry = await prisma.treasuryEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Treasury entry not found' } });
    return null;
  }
  if (entry.sourceType !== 'QUICK_SALE' || !entry.stockMovementId) {
    res.status(400).json({ success: false, error: { message: 'This entry has no linked quick-sale movement', code: 'NOT_QUICK_SALE' } });
    return null;
  }
  return entry.stockMovementId;
}

export async function updateQuickSaleEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const movementId = await loadQuickSaleMovementId(req.params.id, res);
  if (!movementId) return;

  const input = updateStockMovementSchema.parse(req.body);
  let result;
  try {
    result = await updateStockMovement(movementId, input);
  } catch (err) {
    if (err instanceof StockMovementNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'StockMovement',
    entityId: movementId,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: result.previous.branchId,
    previousValue: result.previous,
    newValue: input,
  });

  res.json({ success: true, data: result.updatedTreasuryEntry });
}

export async function deleteQuickSaleEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const movementId = await loadQuickSaleMovementId(req.params.id, res);
  if (!movementId) return;

  let result;
  try {
    result = await deleteStockMovement(movementId, auth.staffId);
  } catch (err) {
    if (err instanceof StockMovementNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'StockMovement',
    entityId: movementId,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: result.previous.branchId,
    previousValue: result.previous,
  });

  res.json({ success: true, data: result.reversedTreasuryEntry });
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
