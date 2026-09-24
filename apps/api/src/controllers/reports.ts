import type { Request, Response } from 'express';
import { getCompanyFinancialSummary, getProfitabilityReport } from '../services/branchFinancialsService.js';
import { getReportsOverview } from '../services/reportsOverviewService.js';
import { businessDayRangeUtc, todayInBusinessTimezone } from '../lib/businessTimezone.js';

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
  // Accounting audit fix (2026-09-17, Decision 4) — `from`/`to` are
  // date-only strings from a plain `<input type="date">`; parsing them
  // with `new Date(...)` treats them as UTC midnight, not Cairo midnight,
  // which shifts a single-day report window ~2-3 hours earlier than the
  // Cairo calendar day the user actually picked. `businessDayRangeUtc`
  // resolves each to the real UTC instant range that Cairo day spans.
  const from = typeof req.query.from === 'string' ? businessDayRangeUtc(req.query.from).start : undefined;
  const to = typeof req.query.to === 'string' ? businessDayRangeUtc(req.query.to).end : undefined;
  const overview = await getReportsOverview(from, to);
  res.json({ success: true, data: overview });
}

/**
 * Accounting audit fix (2026-09-17, Phase 3 C/D) — the Gross → Operating
 * Profit + Revenue/Cash Received/AR report, requested with an explicit
 * date range (defaults to today, Cairo business day, if omitted — the
 * only unambiguous default; every OTHER date-range use in this endpoint
 * requires the caller to actually pick one). Branch-scoped the same way
 * as `getBranchFinancialSummaryHandler` above — a plain SALES/branch-
 * scoped caller never sees another branch's figures through this report.
 */
export async function getProfitabilityReportHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;

  const todayRange = businessDayRangeUtc(todayInBusinessTimezone().toISOString().slice(0, 10));
  const from = typeof req.query.from === 'string' ? businessDayRangeUtc(req.query.from).start : todayRange.start;
  const to = typeof req.query.to === 'string' ? businessDayRangeUtc(req.query.to).end : todayRange.end;

  const report = await getProfitabilityReport(from, to, branchIds);
  res.json({ success: true, data: report });
}
