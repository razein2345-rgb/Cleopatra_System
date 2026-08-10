import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from '../controllers/departments.js';

export const departmentsRouter = Router();

departmentsRouter.use(requireAuth);

departmentsRouter.get('/', requirePermission('settings.view'), listDepartments);
departmentsRouter.post('/', requirePermission('settings.edit'), createDepartment);
departmentsRouter.put('/:id', requirePermission('settings.edit'), updateDepartment);
departmentsRouter.delete('/:id', requirePermission('settings.edit'), deleteDepartment);
