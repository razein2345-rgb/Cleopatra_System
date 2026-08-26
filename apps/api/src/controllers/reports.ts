import type { Request, Response } from 'express';
import { getCompanyFinancialSummary } from '../services/branchFinancialsService.js';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس") — first real endpoint under the `reports` module (the
 * `reports.view` permission existed in the catalog already, unused —
 * see permissions.ts). More reports land here as the rest of the "فصل
 * الخزينة/الربح بالفرع" initiative ships (docs/AI/PROJECT_STATUS.md § 6).
 */
export async function getBranchFinancialSummaryHandler(_req: Request, res: Response) {
  const summary = await getCompanyFinancialSummary();
  res.json({ success: true, data: summary });
}
