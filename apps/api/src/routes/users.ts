import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  resetUserPassword,
  setAttendancePinHandler,
  setUserBranchAccess,
  setUserPassword,
  setUserRoles,
  updateUser,
} from '../controllers/users.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', requirePermission('employees.view'), listUsers);
usersRouter.get('/:id', requirePermission('employees.view'), getUser);
usersRouter.post('/', requirePermission('employees.create'), createUser);
usersRouter.put('/:id', requirePermission('employees.edit'), updateUser);
usersRouter.delete('/:id', requirePermission('employees.delete'), deleteUser);
usersRouter.put('/:id/roles', requirePermission('employees.edit'), setUserRoles);
usersRouter.put('/:id/branch-access', requirePermission('employees.edit'), setUserBranchAccess);
usersRouter.post('/:id/reset-password', requirePermission('employees.edit'), resetUserPassword);
usersRouter.put('/:id/password', requirePermission('employees.edit'), setUserPassword);
usersRouter.put('/:id/attendance-pin', requirePermission('employees.edit'), setAttendancePinHandler);
