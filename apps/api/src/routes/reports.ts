import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { getBranchFinancialSummaryHandler, getProfitabilityReportHandler, getReportsOverviewHandler } from '../controllers/reports.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get('/branch-summary', requirePermission('reports.view'), getBranchFinancialSummaryHandler);
reportsRouter.get('/overview', requirePermission('reports.view'), getReportsOverviewHandler);
// Accounting audit fix (2026-09-17, Phase 3 C/D) — Gross→Operating Profit
// + Revenue/Cash Received/AR, branch-scoped (unlike /overview above).
reportsRouter.get('/profitability', requirePermission('reports.view'), getProfitabilityReportHandler);
