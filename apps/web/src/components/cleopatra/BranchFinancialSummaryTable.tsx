import type { CompanyFinancialSummary } from '@cleopatra/shared';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... عايز انا يظهرلي إجمالي كليوباترا، إجمالي برينتنج، صافي
 * الربح من كل مكان لوحده، وإجمالي الربح العام والإجمالي العام") — the
 * per-branch breakdown + combined totals, extracted out of
 * `BranchProfitWidget` (2026-09-08, "عايزها تظهرلي كمان في الخزينة") so
 * `TreasuryPage` can show the exact same table without re-typing it — one
 * presentation, fed by whatever `CompanyFinancialSummary` the caller
 * already fetched from `/api/reports/branch-summary` (already branch-
 * scoped server-side per the caller's own access, same data shape either
 * way).
 */
export function BranchFinancialSummaryTable({ summary }: { summary: CompanyFinancialSummary }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs *:p-1.5 *:text-start">
              <th>الفرع</th>
              <th>رصيد الخزينة</th>
              <th>إجمالي المبيعات</th>
              <th>صافي الربح</th>
              <th title="مصاريف شهرية ثابتة وأصلها الشهري (إيجار/رواتب...) مقسّمة على 30 يوم">المصاريف الثابتة يوميًا</th>
              <th>الصافي بعد المصاريف اليومية</th>
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
                <td className="text-muted-foreground">{fmt(b.dailyFixedCost)}</td>
                <td className={b.netAfterDailyFixedCost < 0 ? 'text-destructive font-medium' : 'font-medium'}>
                  {fmt(b.netAfterDailyFixedCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.branches.length > 1 && (
        <div className="border-border grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-5">
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
              {summary.hasUnknownProfitItems && <span className="text-warning ms-1 text-xs">⚠ تقديري</span>}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي المصاريف الثابتة يوميًا</p>
            <p className="text-lg font-bold">{fmt(summary.totalDailyFixedCost)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">الصافي العام بعد المصاريف اليومية</p>
            <p className={`text-lg font-bold ${summary.totalNetAfterDailyFixedCost < 0 ? 'text-destructive' : ''}`}>
              {fmt(summary.totalNetAfterDailyFixedCost)}
            </p>
          </div>
        </div>
      )}
      {summary.hasUnknownProfitItems && (
        <p className="text-muted-foreground text-xs">
          ⚠ فيه أصناف (منتجات جاهزة/بضاعة مخزون/لوحات وإعلانات) مالهاش سعر تكلفة مسجّل بعد — صافي الربح المعروض
          أقل من الحقيقي لحد ما يتسجّل سعر التكلفة بتاعها من شاشة المخزون/المنتجات الجاهزة، أو سعر تكلفة المورد
          للوحات من شاشة الإعدادات.
        </p>
      )}
    </div>
  );
}
