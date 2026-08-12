import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createOrderHandler,
  deleteOrderHandler,
  getOrder,
  listOrders,
  recordPaymentHandler,
  updateOrderHandler,
} from '../controllers/orders.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

// FEATURE-006 M2 — direct creation (no Quotation required), reusing the
// already-seeded `orders.create` permission.
ordersRouter.get('/', requirePermission('orders.view'), listOrders);
ordersRouter.post('/', requirePermission('orders.create'), createOrderHandler);
ordersRouter.get('/:id', requirePermission('orders.view'), getOrder);
// FEATURE-007 — full item-replacement edit/delete (owner, 2026-08-12) —
// `orders.edit`/`orders.delete` were reserved in the permission catalog
// since Phase 2, unused until now.
ordersRouter.put('/:id', requirePermission('orders.edit'), updateOrderHandler);
ordersRouter.delete('/:id', requirePermission('orders.delete'), deleteOrderHandler);
// FEATURE-006 M3 — deposits/remaining balance, reusing `orders.edit`
// (recording a payment changes the order's collected state, the same
// authority level as editing it).
ordersRouter.post('/:id/payments', requirePermission('orders.edit'), recordPaymentHandler);
