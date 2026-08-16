import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createInventoryItemHandler,
  deleteInventoryItemHandler,
  getInventoryItemByBarcodeHandler,
  getInventoryItemHandler,
  listInventoryItemsHandler,
  listItemsNeedingSupplierHandler,
  recordStockMovementHandler,
  updateInventoryItemHandler,
} from '../controllers/inventoryItems.js';

export const inventoryItemsRouter = Router();

inventoryItemsRouter.use(requireAuth);

// `/needs-supplier` and `/by-barcode/:barcode` before `/:id` — same Express
// route-ordering reason as every other aggregate-before-detail route in
// this codebase.
inventoryItemsRouter.get('/', requirePermission('inventory.view'), listInventoryItemsHandler);
inventoryItemsRouter.get('/needs-supplier', requirePermission('inventory.view'), listItemsNeedingSupplierHandler);
inventoryItemsRouter.get('/by-barcode/:barcode', requirePermission('inventory.view'), getInventoryItemByBarcodeHandler);
inventoryItemsRouter.get('/:id', requirePermission('inventory.view'), getInventoryItemHandler);
inventoryItemsRouter.post('/', requirePermission('inventory.create'), createInventoryItemHandler);
inventoryItemsRouter.put('/:id', requirePermission('inventory.edit'), updateInventoryItemHandler);
inventoryItemsRouter.post('/:id/movements', requirePermission('inventory.create'), recordStockMovementHandler);
inventoryItemsRouter.delete('/:id', requirePermission('inventory.delete'), deleteInventoryItemHandler);
