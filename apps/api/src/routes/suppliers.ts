import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createPaymentHandler,
  createPurchaseHandler,
  deletePaymentHandler,
  deletePurchaseHandler,
  getSupplierDebtOverviewHandler,
  getSupplierStatementHandler,
  listSuppliersHandler,
  updatePaymentHandler,
  updatePurchaseHandler,
} from '../controllers/suppliers.js';

export const suppliersRouter = Router();

suppliersRouter.use(requireAuth);

suppliersRouter.get('/', requirePermission('suppliers.view'), listSuppliersHandler);
suppliersRouter.get('/debt-overview', requirePermission('suppliers.view'), getSupplierDebtOverviewHandler);
suppliersRouter.get('/:id/statement', requirePermission('suppliers.view'), getSupplierStatementHandler);

suppliersRouter.post('/:id/purchases', requirePermission('suppliers.create'), createPurchaseHandler);
suppliersRouter.put('/purchases/:purchaseId', requirePermission('suppliers.edit'), updatePurchaseHandler);
suppliersRouter.delete('/purchases/:purchaseId', requirePermission('suppliers.delete'), deletePurchaseHandler);

suppliersRouter.post('/:id/payments', requirePermission('suppliers.create'), createPaymentHandler);
suppliersRouter.put('/payments/:paymentId', requirePermission('suppliers.edit'), updatePaymentHandler);
suppliersRouter.delete('/payments/:paymentId', requirePermission('suppliers.delete'), deletePaymentHandler);
