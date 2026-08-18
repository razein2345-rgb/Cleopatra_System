import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createExtraServiceOption,
  deleteExtraServiceOption,
  listExtraServiceOptions,
  updateExtraServiceOption,
} from '../controllers/extraServiceOptions.js';

export const extraServiceOptionsRouter = Router();

extraServiceOptionsRouter.use(requireAuth);

// Same read/write split as partnerTags.ts — every authenticated caller can
// read the catalog (needed to render the order composer's checklist),
// only settings.edit can manage it.
extraServiceOptionsRouter.get('/', listExtraServiceOptions);
extraServiceOptionsRouter.post('/', requirePermission('settings.edit'), createExtraServiceOption);
extraServiceOptionsRouter.put('/:id', requirePermission('settings.edit'), updateExtraServiceOption);
extraServiceOptionsRouter.delete('/:id', requirePermission('settings.edit'), deleteExtraServiceOption);
