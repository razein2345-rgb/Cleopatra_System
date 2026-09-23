import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createExpenseHandler,
  deleteExpenseHandler,
  getExpenseHandler,
  listExpensesHandler,
  markExpensePaidHandler,
  updateExpenseHandler,
} from '../controllers/expenses.js';

export const expensesRouter = Router();

expensesRouter.use(requireAuth);

expensesRouter.get('/', requirePermission('expenses.view'), listExpensesHandler);
expensesRouter.get('/:id', requirePermission('expenses.view'), getExpenseHandler);
expensesRouter.post('/', requirePermission('expenses.create'), createExpenseHandler);
expensesRouter.put('/:id', requirePermission('expenses.edit'), updateExpenseHandler);
expensesRouter.post('/:id/mark-paid', requirePermission('expenses.edit'), markExpensePaidHandler);
expensesRouter.delete('/:id', requirePermission('expenses.delete'), deleteExpenseHandler);
