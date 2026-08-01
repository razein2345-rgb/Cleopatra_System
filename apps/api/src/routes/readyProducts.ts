import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createReadyProduct,
  deleteReadyProduct,
  listReadyProducts,
  updateReadyProduct,
} from '../controllers/readyProducts.js';

export const readyProductsRouter = Router();

readyProductsRouter.use(requireAuth);

readyProductsRouter.get('/', requirePermission('settings.view'), listReadyProducts);
readyProductsRouter.post('/', requirePermission('settings.edit'), createReadyProduct);
readyProductsRouter.put('/:id', requirePermission('settings.edit'), updateReadyProduct);
readyProductsRouter.delete('/:id', requirePermission('settings.edit'), deleteReadyProduct);
