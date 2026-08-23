import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createOrderHandler,
  createReturnHandler,
  deleteOrderHandler,
  deletePaymentHandler,
  getOrder,
  getSalesSummaryHandler,
  listOrders,
  recordPaymentHandler,
  setOrderPartnerHandler,
  updateOrderHandler,
  updatePaymentHandler,
} from '../controllers/orders.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

// FEATURE-006 M2 — direct creation (no Quotation required), reusing the
// already-seeded `orders.create` permission.
ordersRouter.get('/', requirePermission('orders.view'), listOrders);
ordersRouter.post('/', requirePermission('orders.create'), createOrderHandler);
// UX_PRODUCT_AUDIT.md § مشكلة 2.1 — before `/:id` for the same Express
// route-ordering reason every other aggregate-before-detail route in this
// codebase already documents.
ordersRouter.get('/sales-summary', requirePermission('treasury.view'), getSalesSummaryHandler);
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
// Owner (2026-08-20, "تعديل/حذف مقيد بصلاحية خاصة") — deliberately
// `payments.edit`, not `orders.edit` — see permissions.ts's own comment on
// that module for why this must stay a separate, explicit grant.
ordersRouter.put('/:id/payments/:paymentId', requirePermission('payments.edit'), updatePaymentHandler);
ordersRouter.delete('/:id/payments/:paymentId', requirePermission('payments.edit'), deletePaymentHandler);
// Owner (2026-08-20, "فاتورة كانت معمولة عند نادي المهندسين... محتاج اعدلها
// واخليها بدون عميل") — assign/remove the customer on an existing invoice.
ordersRouter.put('/:id/partner', requirePermission('orders.edit'), setOrderPartnerHandler);
// Owner (2026-08-23, "مرتجعات") — deliberately `returns.create`, not
// `orders.edit` — see permissions.ts's own comment on that module.
ordersRouter.post('/:id/items/:itemId/return', requirePermission('returns.create'), createReturnHandler);
