import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { listAllItemReorderOverrides } from '../controllers/itemReorderOverrides.js';

/**
 * Cross-partner read of ItemReorderOverride — the per-partner CRUD lives
 * nested under `/partners/:partnerId/reorder-overrides` (businessPartners.ts);
 * this top-level, read-only route exists solely so the dashboard's
 * cross-customer widget can fetch every override in one call instead of
 * one request per partner.
 */
export const reorderOverridesRouter = Router();

reorderOverridesRouter.use(requireAuth);
reorderOverridesRouter.get('/', requirePermission('orders.view'), listAllItemReorderOverrides);
