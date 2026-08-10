import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createOrderHandler, getOrder, listOrders, recordPaymentHandler } from '../controllers/orders.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

// FEATURE-006 M2 — direct creation (no Quotation required), reusing the
// already-seeded `orders.create` permission. Still no edit/delete; a full
// Order module remains future work (FEATURE-003 00_REQUIREMENTS.md §14)
// — this is the minimum the Invoice document (M9) and Treasury
// integration (M3) need.
ordersRouter.get('/', requirePermission('orders.view'), listOrders);
ordersRouter.post('/', requirePermission('orders.create'), createOrderHandler);
ordersRouter.get('/:id', requirePermission('orders.view'), getOrder);
// FEATURE-006 M3 — deposits/remaining balance, reusing `orders.edit`
// (recording a payment changes the order's collected state, the same
// authority level as editing it).
ordersRouter.post('/:id/payments', requirePermission('orders.edit'), recordPaymentHandler);
