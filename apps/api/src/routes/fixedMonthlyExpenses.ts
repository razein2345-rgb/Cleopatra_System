import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createFixedMonthlyExpenseHandler,
  deleteFixedMonthlyExpenseHandler,
  listFixedMonthlyExpensesHandler,
  updateFixedMonthlyExpenseHandler,
} from '../controllers/fixedMonthlyExpenses.js';

/**
 * `treasury.view` at the route level is a first, narrow filter (SALES has
 * neither it nor `treasury.*`); the real enforcement is each handler's own
 * inline Super-Admin check (`requireSuperAdmin` in the controller) — same
 * two-layer shape `attendance.ts`'s routes already use.
 */
export const fixedMonthlyExpensesRouter = Router();

fixedMonthlyExpensesRouter.use(requireAuth, requirePermission('treasury.view'));
fixedMonthlyExpensesRouter.get('/', listFixedMonthlyExpensesHandler);
fixedMonthlyExpensesRouter.post('/', createFixedMonthlyExpenseHandler);
fixedMonthlyExpensesRouter.put('/:id', updateFixedMonthlyExpenseHandler);
fixedMonthlyExpensesRouter.delete('/:id', deleteFixedMonthlyExpenseHandler);
