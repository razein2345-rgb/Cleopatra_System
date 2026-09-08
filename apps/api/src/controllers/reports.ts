import type { Request, Response } from 'express';
import { getCompanyFinancialSummary } from '../services/branchFinancialsService.js';
import { getReportsOverview } from '../services/reportsOverviewService.js';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس") — first real endpoint under the `reports` module (the
 * `reports.view` permission existed in the catalog already, unused —
 * see permissions.ts). More reports land here as the rest of the "فصل
 * الخزينة/الربح بالفرع" initiative ships (docs/AI/PROJECT_STATUS.md § 6).
 *
 * 🔴 Owner (2026-09-08, same complaint resurfacing: "ليه معملش دورين...
 * افصلي الإتنين عن بعض وانا بس اللي اقدر اشوف") — this ignored the request
 * entirely (`_req`) and always returned every branch, because `reports.view`
 * is also granted to the plain SALES role for its own unrelated reports —
 * so a branch-scoped cashier who also carries SALES saw the other branch's
 * treasury/profit in full here. Same fix shape as `resolveBranchScope` in
 * `treasuryEntries.ts`: only a true Super Admin gets the unscoped, every-
 * branch view; everyone else is clamped to `accessibleBranchIds`.
 */
export async function getBranchFinancialSummaryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;
  const summary = await getCompanyFinancialSummary(branchIds);
  res.json({ success: true, data: summary });
}

/**
 * جزء 6 (الأخير عمدًا) — صفحة التقارير الشاملة. owner أكّد صراحة: مجمّعة
 * لكل الشركة، مش مقسّمة لكل فرع (بعكس getBranchFinancialSummaryHandler
 * فوق) — فمفيش `branchId` هنا خالص.
 */
export async function getReportsOverviewHandler(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
  const overview = await getReportsOverview(from, to);
  res.json({ success: true, data: overview });
}
