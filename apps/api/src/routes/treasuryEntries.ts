import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { hasPermission } from '@cleopatra/shared';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createTreasuryEntryHandler,
  deleteTreasuryEntryHandler,
  getMyTreasurySummaryHandler,
  getTreasuryBalanceHandler,
  listTreasuryEntriesHandler,
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
treasuryEntriesRouter.post('/', requirePermission('treasury.create'), createTreasuryEntryHandler);
treasuryEntriesRouter.put('/:id', requirePermission('treasury.edit'), updateTreasuryEntryHandler);
treasuryEntriesRouter.delete('/:id', requirePermission('treasury.delete'), deleteTreasuryEntryHandler);
