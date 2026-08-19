import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createTreasuryCategory,
  deleteTreasuryCategory,
  getTreasuryCategoryTotalsHandler,
  listTreasuryCategories,
  updateTreasuryCategory,
} from '../controllers/treasuryCategories.js';

export const treasuryCategoriesRouter = Router();

treasuryCategoriesRouter.use(requireAuth);

// Same read/write split rationale as partnerCategories.ts — anyone recording
// a treasury entry needs the list to populate the picker; only settings.edit
// can manage the catalog itself. `/totals` is financial data though, so it
// gates stricter (treasury.view) than the plain picker list above it —
// before `/:id` for the same route-ordering reason every other aggregate-
// before-detail route in this codebase already documents.
treasuryCategoriesRouter.get('/', listTreasuryCategories);
treasuryCategoriesRouter.get('/totals', requirePermission('treasury.view'), getTreasuryCategoryTotalsHandler);
treasuryCategoriesRouter.post('/', requirePermission('settings.edit'), createTreasuryCategory);
treasuryCategoriesRouter.put('/:id', requirePermission('settings.edit'), updateTreasuryCategory);
treasuryCategoriesRouter.delete('/:id', requirePermission('settings.edit'), deleteTreasuryCategory);
