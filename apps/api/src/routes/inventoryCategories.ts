import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createInventoryCategory,
  deleteInventoryCategory,
  listInventoryCategories,
  updateInventoryCategory,
} from '../controllers/inventoryCategories.js';

export const inventoryCategoriesRouter = Router();

inventoryCategoriesRouter.use(requireAuth);

// Read is open to any authenticated user — same precedent as
// partnerCategories.ts: low-sensitivity reference data needed to populate
// the category picker/filter for anyone with inventory access, not just
// settings.edit holders. Mutations remain settings.edit-gated.
inventoryCategoriesRouter.get('/', listInventoryCategories);
inventoryCategoriesRouter.post('/', requirePermission('settings.edit'), createInventoryCategory);
inventoryCategoriesRouter.put('/:id', requirePermission('settings.edit'), updateInventoryCategory);
inventoryCategoriesRouter.delete('/:id', requirePermission('settings.edit'), deleteInventoryCategory);
