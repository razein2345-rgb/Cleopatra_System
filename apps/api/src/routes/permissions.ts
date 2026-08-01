import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createPermission, deletePermission, listPermissions } from '../controllers/permissions.js';

export const permissionsRouter = Router();

permissionsRouter.use(requireAuth);

permissionsRouter.get('/', requirePermission('permissions.view'), listPermissions);
permissionsRouter.post('/', requirePermission('permissions.create'), createPermission);
permissionsRouter.delete('/:id', requirePermission('permissions.delete'), deletePermission);
