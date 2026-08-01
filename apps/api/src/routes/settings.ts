import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getSettings, updateSettings } from '../controllers/settings.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get('/', requirePermission('settings.view'), getSettings);
settingsRouter.put('/', requirePermission('settings.edit'), updateSettings);
