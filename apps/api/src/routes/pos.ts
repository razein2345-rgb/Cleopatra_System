import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getWalkInPartnerHandler } from '../controllers/pos.js';

export const posRouter = Router();

posRouter.use(requireAuth);

// Same permission the POS checkout itself needs (`POST /api/orders`) —
// this endpoint only ever feeds that same flow, never a standalone action.
posRouter.post('/walk-in-partner', requirePermission('orders.create'), getWalkInPartnerHandler);
