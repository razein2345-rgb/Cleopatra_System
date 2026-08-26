import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getBranchFinancialSummaryHandler } from '../controllers/reports.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get('/branch-summary', requirePermission('reports.view'), getBranchFinancialSummaryHandler);
