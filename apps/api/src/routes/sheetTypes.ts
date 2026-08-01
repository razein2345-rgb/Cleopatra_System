import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createSheetType,
  deleteSheetType,
  listSheetTypes,
  updateSheetType,
} from '../controllers/sheetTypes.js';

export const sheetTypesRouter = Router();

sheetTypesRouter.use(requireAuth);

sheetTypesRouter.get('/', requirePermission('settings.view'), listSheetTypes);
sheetTypesRouter.post('/', requirePermission('settings.edit'), createSheetType);
sheetTypesRouter.put('/:id', requirePermission('settings.edit'), updateSheetType);
sheetTypesRouter.delete('/:id', requirePermission('settings.edit'), deleteSheetType);
