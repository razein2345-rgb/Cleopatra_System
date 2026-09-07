import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { canAccessBranch, forbidBranch, type AuthenticatedUser } from '../services/authContext.js';
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
  getEmployeeCashCustody,
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
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;

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
    branchId: resolveBranchScope(auth, canSeeAll, requestedBranchId),
    partnerId,
  });
  res.json({ success: true, data: entries });
}

/**
 * `treasury.view` only (see routes file), never reachable by a
 * `treasury.create`-only caller. `?branchId=` narrows to one branch — the
 * admin's "رؤية كليوباترا بس / برينتنج بس" toggle (2026-08-26); omitted
 * means both branches combined, the pre-existing default.
 *
 * Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
 * برينتنج فا ميظهرش ده هنا ولا ده هنا") — 🔴 this used to trust
 * `?branchId=` outright the moment a caller held `treasury.view` at all,
 * with zero check on whether they could actually access that branch.
 * `CASHIER` is seeded with the wildcard `treasury.*` (both create AND
 * view), so any cashier — meant to be scoped to their own branch, same as
 * every other branch-scoped role in this codebase — could simply request
 * `?branchId=<the other branch>` (or an omitted `branchId`, silently
 * combining both) and see it in full. Only a true Super Admin now bypasses
 * branch scoping here; everyone else — "sees totals" or not — is clamped
 * to `accessibleBranchIds` via the same `resolveBranchScope` helper the
 * entries list above already used this pattern for.
 */
export async function getTreasuryBalanceHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const balance = await getTreasuryBalance(resolveBranchScope(auth, true, requestedBranchId));
  res.json({ success: true, data: balance });
}

/**
 * Shared by `listTreasuryEntriesHandler`/`getTreasuryBalanceHandler` —
 * `canSeeTotals=false` (reception, `treasury.create` only) is always
 * clamped to the caller's own home branch regardless of what's requested
 * (unchanged pre-existing behavior). Otherwise: Super Admin gets whatever
 * was requested (undefined = every branch, unrestricted — the org-wide
 * view an actual admin needs); everyone else gets the requested branch
 * ONLY if it's genuinely in their own `accessibleBranchIds`, and their
 * full accessible set otherwise (an omitted or a not-allowed branchId
 * both fall back to "every branch THIS caller may see" — never silently
 * widening to branches outside that set, never a hard 403 for the
 * omitted/combined case since that's the normal default view).
 */
function resolveBranchScope(auth: AuthenticatedUser, canSeeTotals: boolean, requestedBranchId: string | undefined): string | string[] | undefined {
  if (!canSeeTotals) return auth.branchId;
  if (auth.roleNames.includes('SUPER_ADMIN')) return requestedBranchId;
  if (requestedBranchId && auth.accessibleBranchIds.includes(requestedBranchId)) return requestedBranchId;
  return auth.accessibleBranchIds;
}

/** The reception-safe alternative to the balance endpoint above — the caller's own branch total only, never the org-wide figure. */
export async function getMyTreasurySummaryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const summary = await getMyTreasurySummary(auth.branchId);
  res.json({ success: true, data: summary });
}

/** Owner (2026-08-26, "عهدة نقدية فعلية") — the caller's own real cash custody, always their own (never another staff member's). */
export async function getMyCashCustodyHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const custody = await getEmployeeCashCustody(auth.staffId);
  res.json({ success: true, data: custody });
}

/**
 * A `treasury.view` holder may target any branch via `?branchId=`/body
 * `branchId` ONLY if they can actually access it (Super Admin, or an
 * explicit `UserBranchAccess` grant); everyone else — reception
 * (`treasury.create`-only), or a branch-scoped cashier requesting a
 * branch outside their own — is always locked to their own assigned
 * branch regardless of what they send.
 *
 * 🔴 Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
 * برينتنج فا ميظهرش ده هنا ولا ده هنا") — this used to grant the
 * requested branch to ANY `treasury.view` holder outright, no access
 * check at all. `CASHIER` is seeded with the `treasury.*` wildcard
 * (create + view together), so a cashier meant to be scoped to their own
 * branch could pass the other branch's id here and actually close (or
 * reopen) ITS day, not just view its balance. Same fix shape as
 * `resolveBranchScope` above.
 */
function resolveTargetBranchId(req: Request, requested: string | undefined): string {
  const auth = req.auth!;
  if (!hasPermission(auth.permissions, 'treasury.view') || !requested) return auth.branchId;
  if (auth.roleNames.includes('SUPER_ADMIN') || auth.accessibleBranchIds.includes(requested)) return requested;
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

/**
 * 🔴 Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
 * برينتنج") — this used to trust `input.branchId` outright, unlike
 * `createAdvanceHandler`/`createSalaryPaymentHandler` which already
 * checked `canAccessBranch` for the exact same reason. A cashier scoped
 * to one branch could record a manual income/expense/transfer entry
 * against the OTHER branch's ledger entirely.
 */
export async function createTreasuryEntryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createTreasuryEntrySchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

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

/**
 * 🔴 Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
 * برينتنج") — checks the entry's CURRENT branch (a cashier editing an
 * entry that isn't even theirs) and, since `branchId` is itself editable
 * here ("عايز اقدر اغير الفرع اللي اتباع منه في الخزينه"), the NEW branch
 * too (moving an entry INTO a branch they can't access).
 */
export async function updateTreasuryEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateTreasuryEntrySchema.parse(req.body);

  const existing = await prisma.treasuryEntry.findUnique({ where: { id: req.params.id }, select: { branchId: true, isDeleted: true } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Treasury entry not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId) || (input.branchId && !canAccessBranch(auth, input.branchId))) {
    forbidBranch(res);
    return;
  }

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
/** 🔴 Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة برينتنج") — same missing branch-access check as the manual-entry handlers above. */
async function loadQuickSaleMovementId(entryId: string, auth: AuthenticatedUser, res: Response): Promise<string | null> {
  const entry = await prisma.treasuryEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Treasury entry not found' } });
    return null;
  }
  if (!canAccessBranch(auth, entry.branchId)) {
    forbidBranch(res);
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
  const movementId = await loadQuickSaleMovementId(req.params.id, auth, res);
  if (!movementId) return;

  const input = updateStockMovementSchema.parse(req.body);
  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }
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
  const movementId = await loadQuickSaleMovementId(req.params.id, auth, res);
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

/** 🔴 Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة برينتنج") — same missing check as create/update above. */
export async function deleteTreasuryEntryHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  const existing = await prisma.treasuryEntry.findUnique({ where: { id: req.params.id }, select: { branchId: true, isDeleted: true } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Treasury entry not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }

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
