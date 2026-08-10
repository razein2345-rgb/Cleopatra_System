import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createPartnerTag,
  deletePartnerTag,
  listPartnerTags,
  updatePartnerTag,
} from '../controllers/partnerTags.js';

export const partnerTagsRouter = Router();

partnerTagsRouter.use(requireAuth);

// Same read/write split rationale as partnerCategories.ts.
partnerTagsRouter.get('/', listPartnerTags);
partnerTagsRouter.post('/', requirePermission('settings.edit'), createPartnerTag);
partnerTagsRouter.put('/:id', requirePermission('settings.edit'), updatePartnerTag);
partnerTagsRouter.delete('/:id', requirePermission('settings.edit'), deletePartnerTag);
