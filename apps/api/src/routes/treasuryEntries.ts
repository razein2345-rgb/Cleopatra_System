import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { hasPermission } from '@cleopatra/shared';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  closeTreasuryDayHandler,
  createTreasuryEntryHandler,
  deleteQuickSaleEntryHandler,
  deleteTreasuryEntryHandler,
  getDayClosurePreviewHandler,
  getMyTreasurySummaryHandler,
  getTodayClosureHandler,
  getTreasuryBalanceHandler,
  listTreasuryEntriesHandler,
  reopenTreasuryDayHandler,
  updateQuickSaleEntryHandler,
  updateTreasuryEntryHandler,
} from '../controllers/treasuryEntries.js';

export const treasuryEntriesRouter = Router();

treasuryEntriesRouter.use(requireAuth);

/**
 * FEATURE-007 M3 — a caller with only `treasury.create` (reception) must
 * still reach `GET /` and `GET /my-summary` to see their own history/total
 * — the controller does the actual scoping (see `listTreasuryEntriesHandler`'s
 * doc comment). `GET /balance` stays `treasury.view`-only below; it is
 * never reachable on `treasury.create` alone.
 */
function requireTreasuryReadAccess(req: Request, res: Response, next: NextFunction) {
  const permissions = req.auth?.permissions ?? [];
  if (hasPermission(permissions, 'treasury.view') || hasPermission(permissions, 'treasury.create')) {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    error: { message: 'Missing required permission: treasury.view or treasury.create' },
  });
}

// FEATURE-006 M4 — Treasury as a first-class module, reusing the
// `treasury.*` permissions already seeded since Phase 2 (unused until
// now). `/balance` and `/my-summary` before `/:id` for the same Express
// route-ordering reason every other aggregate-before-detail route in this
// codebase already documents (e.g. workflow-instances' `/queue`/`/dashboard-summary`).
treasuryEntriesRouter.get('/', requireTreasuryReadAccess, listTreasuryEntriesHandler);
treasuryEntriesRouter.get('/balance', requirePermission('treasury.view'), getTreasuryBalanceHandler);
treasuryEntriesRouter.get('/my-summary', requireTreasuryReadAccess, getMyTreasurySummaryHandler);
// FEATURE-016, rebuilt 2026-08-18 — "تقفيل حساب اليوم" is now a real
// cash-drawer reconciliation that locks new entries for the day (see
// treasuryService's own doc comments). Preview/close/today-closure share
// the same access level as recording entries in the first place; reopening
// is stricter (SUPER_ADMIN/ADMIN only, enforced inside the handler itself
// since it isn't a `treasury.*` permission — see the handler's own comment).
treasuryEntriesRouter.get('/day-closure-preview', requireTreasuryReadAccess, getDayClosurePreviewHandler);
treasuryEntriesRouter.get('/today-closure', requireTreasuryReadAccess, getTodayClosureHandler);
treasuryEntriesRouter.post('/close-day', requirePermission('treasury.create'), closeTreasuryDayHandler);
treasuryEntriesRouter.post('/reopen-day', requirePermission('treasury.create'), reopenTreasuryDayHandler);
treasuryEntriesRouter.post('/', requirePermission('treasury.create'), createTreasuryEntryHandler);
treasuryEntriesRouter.put('/:id', requirePermission('treasury.edit'), updateTreasuryEntryHandler);
treasuryEntriesRouter.delete('/:id', requirePermission('treasury.delete'), deleteTreasuryEntryHandler);
// Owner (2026-08-23, "البيع السريع المفروض اقدر اعدله من الخزينة") — a
// QUICK_SALE entry's real source of truth is its StockMovement, so this
// is gated on `inventory.*` (the permission that already governs editing
// stock movements directly), not `treasury.*`.
treasuryEntriesRouter.put('/:id/quick-sale-movement', requirePermission('inventory.edit'), updateQuickSaleEntryHandler);
treasuryEntriesRouter.delete('/:id/quick-sale-movement', requirePermission('inventory.delete'), deleteQuickSaleEntryHandler);
