import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import type { CompanyFinancialSummary } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import type { DashboardWidgetDefinition } from '../types';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... عايز انا يظهرلي إجمالي كليوباترا، إجمالي برينتنج،
 * صافي الربح من كل مكان لوحده، وإجمالي الربح العام والإجمالي العام") —
 * جزء 2 من مبادرة "فصل الخزينة/الربح بالفرع" (docs/AI/PROJECT_STATUS.md
 * § 6). Distinct from `FinancialOverviewWidget` (company-wide today/week
 * rolling figures) — this is the all-time, per-branch breakdown, gated on
 * the dedicated `reports.view` permission rather than piggybacking on
 * `treasury.view`.
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
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs *:p-1.5 *:text-start">
                  <th>الفرع</th>
                  <th>رصيد الخزينة</th>
                  <th>إجمالي المبيعات</th>
                  <th>صافي الربح</th>
                </tr>
              </thead>
              <tbody>
                {summary.branches.map((b) => (
                  <tr key={b.branchId} className="border-border border-t *:p-1.5">
                    <td className="font-medium">{b.branchName}</td>
                    <td className={b.treasuryBalance < 0 ? 'text-destructive' : ''}>{fmt(b.treasuryBalance)}</td>
                    <td>
                      {fmt(b.salesTotal)} <span className="text-muted-foreground text-xs">({b.salesCount} فاتورة)</span>
                    </td>
                    <td>
                      {fmt(b.netProfit)}
                      {b.hasUnknownProfitItems && (
                        <span className="text-warning ms-1 text-xs" title="فيه أصناف مالهاش سعر تكلفة مسجّل — الرقم ده تقديري ناقص">
                          ⚠
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-border grid grid-cols-3 gap-3 border-t pt-3">
            <div>
              <p className="text-muted-foreground text-xs">إجمالي رصيد الخزينة (كل الفروع)</p>
              <p className={`text-lg font-bold ${summary.totalTreasuryBalance < 0 ? 'text-destructive' : ''}`}>
                {fmt(summary.totalTreasuryBalance)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">إجمالي المبيعات العام</p>
              <p className="text-lg font-bold">{fmt(summary.totalSales)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">إجمالي صافي الربح العام</p>
              <p className="text-lg font-bold">
                {fmt(summary.totalNetProfit)}
                {summary.hasUnknownProfitItems && (
                  <span className="text-warning ms-1 text-xs">⚠ تقديري</span>
                )}
              </p>
            </div>
          </div>
          {summary.hasUnknownProfitItems && (
            <p className="text-muted-foreground text-xs">
              ⚠ فيه أصناف (منتجات جاهزة/بضاعة مخزون/لوحات وإعلانات) مالهاش سعر تكلفة مسجّل بعد — صافي الربح المعروض
              أقل من الحقيقي لحد ما يتسجّل سعر التكلفة بتاعها من شاشة المخزون/المنتجات الجاهزة، أو سعر تكلفة المورد
              للوحات من شاشة الإعدادات.
            </p>
          )}
        </div>
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
