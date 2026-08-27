import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import {
  createBoardsCatalogItem,
  deleteBoardsCatalogItem,
  listBoardsCatalogItems,
  updateBoardsCatalogItem,
} from '../controllers/boardsCatalogItems.js';

export const boardsCatalogItemsRouter = Router();

boardsCatalogItemsRouter.use(requireAuth);

// Same "Settings AND order composer both need it" reasoning as
// readyProducts.ts's own route — `orders.create` covers a CASHIER/SALES
// role composing a BOARDS item with no reason to also hold `settings.view`.
boardsCatalogItemsRouter.get('/', requireAnyPermission(['settings.view', 'orders.create']), listBoardsCatalogItems);
boardsCatalogItemsRouter.post('/', requirePermission('settings.edit'), createBoardsCatalogItem);
boardsCatalogItemsRouter.put('/:id', requirePermission('settings.edit'), updateBoardsCatalogItem);
boardsCatalogItemsRouter.delete('/:id', requirePermission('settings.edit'), deleteBoardsCatalogItem);
