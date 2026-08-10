import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getPricingReference } from '../controllers/pricingReference.js';

export const pricingReferenceRouter = Router();

pricingReferenceRouter.use(requireAuth);

pricingReferenceRouter.get('/', requirePermission('orders.create'), getPricingReference);
