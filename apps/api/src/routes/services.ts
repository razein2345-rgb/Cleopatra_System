import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from '../controllers/services.js';

export const servicesRouter = Router();

servicesRouter.use(requireAuth);

servicesRouter.get('/', requirePermission('settings.view'), listServices);
servicesRouter.post('/', requirePermission('settings.edit'), createService);
servicesRouter.put('/:id', requirePermission('settings.edit'), updateService);
servicesRouter.delete('/:id', requirePermission('settings.edit'), deleteService);
