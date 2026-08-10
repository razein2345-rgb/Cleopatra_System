import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getBusinessIdentity, getSettings, updateSettings } from '../controllers/settings.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

// FEATURE-007 — before `/`, letterhead-only, gated on `orders.view` (not
// `settings.view`) so reception/sales can print a document's letterhead.
settingsRouter.get('/business-identity', requirePermission('orders.view'), getBusinessIdentity);
settingsRouter.get('/', requirePermission('settings.view'), getSettings);
settingsRouter.put('/', requirePermission('settings.edit'), updateSettings);
