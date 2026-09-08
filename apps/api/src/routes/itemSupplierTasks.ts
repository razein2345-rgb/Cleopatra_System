import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  deleteItemSupplierTaskHandler,
  listOpenItemSupplierTasksHandler,
  updateItemSupplierTaskHandler,
} from '../controllers/itemSupplierTasks.js';

export const itemSupplierTasksRouter = Router();

itemSupplierTasksRouter.use(requireAuth, requirePermission('work-orders.edit'));
itemSupplierTasksRouter.get('/', listOpenItemSupplierTasksHandler);
itemSupplierTasksRouter.put('/:id', updateItemSupplierTaskHandler);
itemSupplierTasksRouter.delete('/:id', deleteItemSupplierTaskHandler);
