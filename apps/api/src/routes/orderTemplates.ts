import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createOrderTemplate, deleteOrderTemplate, listOrderTemplates } from '../controllers/orderTemplates.js';

export const orderTemplatesRouter = Router();

orderTemplatesRouter.use(requireAuth);

// Anyone who can see orders needs the picker list; only someone who can
// start an order (orders.create) may save/remove a template — same
// authority level as composing the order it came from.
orderTemplatesRouter.get('/', requirePermission('orders.view'), listOrderTemplates);
orderTemplatesRouter.post('/', requirePermission('orders.create'), createOrderTemplate);
orderTemplatesRouter.delete('/:id', requirePermission('orders.create'), deleteOrderTemplate);
