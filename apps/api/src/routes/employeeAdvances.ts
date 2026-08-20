import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createAdvanceHandler,
  createAdvanceRepaymentHandler,
  createSalaryPaymentHandler,
  getEmployeeAdvanceSummariesHandler,
  getEmployeePayrollHandler,
  listAdvancesForStaffHandler,
  listSalaryPaymentsForStaffHandler,
} from '../controllers/employeeAdvances.js';

export const employeeAdvancesRouter = Router();

employeeAdvancesRouter.use(requireAuth);

// `/summary` before `/staff/:staffId`, mirroring every other
// aggregate-before-detail route in this codebase (e.g. treasury's
// `/balance` before `/:id`).
employeeAdvancesRouter.get('/summary', requirePermission('employees.view'), getEmployeeAdvanceSummariesHandler);
employeeAdvancesRouter.get('/staff/:staffId', requirePermission('employees.view'), listAdvancesForStaffHandler);
employeeAdvancesRouter.get('/staff/:staffId/payroll', requirePermission('employees.view'), getEmployeePayrollHandler);
employeeAdvancesRouter.get('/staff/:staffId/salary-payments', requirePermission('employees.view'), listSalaryPaymentsForStaffHandler);
employeeAdvancesRouter.post('/', requirePermission('employees.edit'), createAdvanceHandler);
employeeAdvancesRouter.post('/:advanceId/repayments', requirePermission('employees.edit'), createAdvanceRepaymentHandler);
// Owner (2026-08-20, "لو لا طب هنعمل ده ازاي") — the manual "صرف مرتب" action.
employeeAdvancesRouter.post('/salary-payments', requirePermission('employees.edit'), createSalaryPaymentHandler);
