import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import type { CompanyFinancialSummary } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { BranchFinancialSummaryTable } from '@/components/cleopatra';
import type { DashboardWidgetDefinition } from '../types';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... عايز انا يظهرلي إجمالي كليوباترا، إجمالي برينتنج،
 * صافي الربح من كل مكان لوحده، وإجمالي الربح العام والإجمالي العام") —
 * جزء 2 من مبادرة "فصل الخزينة/الربح بالفرع" (docs/AI/PROJECT_STATUS.md
 * § 6). Distinct from `FinancialOverviewWidget` (company-wide today/week
 * rolling figures) — this is the all-time, per-branch breakdown, gated on
 * the dedicated `reports.view` permission rather than piggybacking on
 * `treasury.view`. The actual table is `BranchFinancialSummaryTable`
 * (2026-09-08, "عايزها تظهرلي كمان في الخزينة") — shared with
 * `TreasuryPage` rather than re-typed there.
 */
function BranchProfitWidgetComponent() {
  const [summary, setSummary] = useState<CompanyFinancialSummary | null>(null);

  useEffect(() => {
    apiGet<CompanyFinancialSummary>('/api/reports/branch-summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">صافي الربح والخزينة بالفرع</span>
      </div>
      {!summary ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : (
        <BranchFinancialSummaryTable summary={summary} />
      )}
    </Card>
  );
}

export const branchProfitWidget: DashboardWidgetDefinition = {
  id: 'branch-profit',
  permission: 'reports.view',
  Component: BranchProfitWidgetComponent,
  span: 'lg',
};
