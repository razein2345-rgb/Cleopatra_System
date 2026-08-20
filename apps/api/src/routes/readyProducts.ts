import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import {
  createReadyProduct,
  deleteReadyProduct,
  listReadyProducts,
  updateReadyProduct,
} from '../controllers/readyProducts.js';

export const readyProductsRouter = Router();

readyProductsRouter.use(requireAuth);

// Owner (2026-08-20, "ضيفت منتجات جاهزة من الإعدادات المفروض تظهر عند
// الموظف محمد مظهرتش") — fetched both from Settings (`settings.view`) and
// directly by the order composer to populate what's sellable
// (`orders.create` — a CASHIER/SALES role has no reason to also hold
// `settings.view`).
readyProductsRouter.get('/', requireAnyPermission(['settings.view', 'orders.create']), listReadyProducts);
readyProductsRouter.post('/', requirePermission('settings.edit'), createReadyProduct);
readyProductsRouter.put('/:id', requirePermission('settings.edit'), updateReadyProduct);
readyProductsRouter.delete('/:id', requirePermission('settings.edit'), deleteReadyProduct);
