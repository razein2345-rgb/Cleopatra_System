import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createAdvanceHandler,
  createAdvanceRepaymentHandler,
  getEmployeeAdvanceSummariesHandler,
  getEmployeePayrollHandler,
  listAdvancesForStaffHandler,
} from '../controllers/employeeAdvances.js';

export const employeeAdvancesRouter = Router();

employeeAdvancesRouter.use(requireAuth);

// `/summary` before `/staff/:staffId`, mirroring every other
// aggregate-before-detail route in this codebase (e.g. treasury's
// `/balance` before `/:id`).
employeeAdvancesRouter.get('/summary', requirePermission('employees.view'), getEmployeeAdvanceSummariesHandler);
employeeAdvancesRouter.get('/staff/:staffId', requirePermission('employees.view'), listAdvancesForStaffHandler);
employeeAdvancesRouter.get('/staff/:staffId/payroll', requirePermission('employees.view'), getEmployeePayrollHandler);
employeeAdvancesRouter.post('/', requirePermission('employees.edit'), createAdvanceHandler);
employeeAdvancesRouter.post('/:advanceId/repayments', requirePermission('employees.edit'), createAdvanceRepaymentHandler);
