import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createDigitalPriceTier,
  deleteDigitalPriceTier,
  listDigitalPriceTiers,
  updateDigitalPriceTier,
} from '../controllers/digitalPriceTiers.js';

export const digitalPriceTiersRouter = Router();

digitalPriceTiersRouter.use(requireAuth);

// The order composer gets the same rows via GET /api/pricing-reference
// (its own live-preview reference bundle, gated on orders.create) — this
// router is only for the Settings management screen, so every verb here
// gates on settings.edit uniformly (no separate read-only tier).
digitalPriceTiersRouter.get('/', requirePermission('settings.edit'), listDigitalPriceTiers);
digitalPriceTiersRouter.post('/', requirePermission('settings.edit'), createDigitalPriceTier);
digitalPriceTiersRouter.put('/:id', requirePermission('settings.edit'), updateDigitalPriceTier);
digitalPriceTiersRouter.delete('/:id', requirePermission('settings.edit'), deleteDigitalPriceTier);
