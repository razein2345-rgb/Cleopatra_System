import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createPartnerCategory,
  deletePartnerCategory,
  listPartnerCategories,
  updatePartnerCategory,
} from '../controllers/partnerCategories.js';

export const partnerCategoriesRouter = Router();

partnerCategoriesRouter.use(requireAuth);

// Read is open to any authenticated user (no new permission name, per the
// explicit M4 requirement) — same precedent as GET /api/branches: this is
// low-sensitivity reference data needed to populate the Category dropdown
// for anyone with `partners.edit` (e.g. SALES), not just `settings.edit`
// holders. Mutations remain strictly `settings.edit`, as specified.
partnerCategoriesRouter.get('/', listPartnerCategories);
partnerCategoriesRouter.post('/', requirePermission('settings.edit'), createPartnerCategory);
partnerCategoriesRouter.put('/:id', requirePermission('settings.edit'), updatePartnerCategory);
partnerCategoriesRouter.delete('/:id', requirePermission('settings.edit'), deletePartnerCategory);
