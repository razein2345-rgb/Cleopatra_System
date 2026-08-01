import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  addSizeFamilyEntry,
  createSizeFamily,
  deleteSizeFamily,
  deleteSizeFamilyEntry,
  listSizeFamilies,
  updateSizeFamily,
  updateSizeFamilyEntry,
} from '../controllers/sizeFamilies.js';

export const sizeFamiliesRouter = Router();

sizeFamiliesRouter.use(requireAuth);

sizeFamiliesRouter.get('/', requirePermission('settings.view'), listSizeFamilies);
sizeFamiliesRouter.post('/', requirePermission('settings.edit'), createSizeFamily);
sizeFamiliesRouter.put('/:id', requirePermission('settings.edit'), updateSizeFamily);
sizeFamiliesRouter.delete('/:id', requirePermission('settings.edit'), deleteSizeFamily);
sizeFamiliesRouter.post('/:id/entries', requirePermission('settings.edit'), addSizeFamilyEntry);
sizeFamiliesRouter.put(
  '/:id/entries/:entryId',
  requirePermission('settings.edit'),
  updateSizeFamilyEntry,
);
sizeFamiliesRouter.delete(
  '/:id/entries/:entryId',
  requirePermission('settings.edit'),
  deleteSizeFamilyEntry,
);
