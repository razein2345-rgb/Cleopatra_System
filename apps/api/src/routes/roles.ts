import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  setRolePermissions,
  updateRole,
} from '../controllers/roles.js';

export const rolesRouter = Router();

rolesRouter.use(requireAuth);

rolesRouter.get('/', requirePermission('roles.view'), listRoles);
rolesRouter.get('/:id', requirePermission('roles.view'), getRole);
rolesRouter.post('/', requirePermission('roles.create'), createRole);
rolesRouter.put('/:id', requirePermission('roles.edit'), updateRole);
rolesRouter.delete('/:id', requirePermission('roles.delete'), deleteRole);
rolesRouter.put('/:id/permissions', requirePermission('roles.edit'), setRolePermissions);
