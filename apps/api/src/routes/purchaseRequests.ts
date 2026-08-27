import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { listPurchaseRequestsHandler, markPurchaseRequestPurchasedHandler } from '../controllers/purchaseRequests.js';

export const purchaseRequestsRouter = Router();

purchaseRequestsRouter.use(requireAuth);

purchaseRequestsRouter.get('/', requirePermission('inventory.view'), listPurchaseRequestsHandler);
purchaseRequestsRouter.post('/:id/mark-purchased', requirePermission('inventory.edit'), markPurchaseRequestPurchasedHandler);
