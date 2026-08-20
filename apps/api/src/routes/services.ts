import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from '../controllers/services.js';

export const servicesRouter = Router();

servicesRouter.use(requireAuth);

// Owner (2026-08-20, "ضيفت منتجات جاهزة من الإعدادات المفروض تظهر عند
// الموظف محمد مظهرتش") — same fix as readyProducts.ts's own comment; same
// two consumer groups (Settings management vs. the order composer).
servicesRouter.get('/', requireAnyPermission(['settings.view', 'orders.create']), listServices);
servicesRouter.post('/', requirePermission('settings.edit'), createService);
servicesRouter.put('/:id', requirePermission('settings.edit'), updateService);
servicesRouter.delete('/:id', requirePermission('settings.edit'), deleteService);
