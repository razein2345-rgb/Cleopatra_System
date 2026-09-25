import type { CompanyFinancialSummary } from '@cleopatra/shared';

// max 2 decimals too: the daily fixed cost is monthly/30, so without the cap
// the default (3) shows e.g. 1,753.571 in a money column.
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NO_SALES_TODAY_HINT = 'لسه مفيش مبيعات النهارده — الرقم = المصاريف الثابتة بس، هيتحسّن مع أول أوردر';

/**
 * Early in the day (or on a quiet one) today's profit is legitimately zero
 * while today's fixed cost is still charged, so "الصافي بعد المصاريف" reads
 * as a red negative equal to the fixed cost — correct, but it looks like a
 * loss. Detected from the fields already in the summary (no API change): a
 * branch with no real, estimated, or unknown-cost revenue today has no
 * sales activity to explain the number with. (A same-day sale with exactly
 * zero profit and zero unknown revenue would also trip this — a rare edge
 * that only makes the hint slightly less precise, never the figure wrong.)
 */
function hasNoActivityToday(b: CompanyFinancialSummary['branches'][number]): boolean {
  return b.realProfit === 0 && b.estimatedProfit === 0 && b.unknownCostRevenue === 0;
}

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
  const idleBranchIds = new Set(summary.branches.filter(hasNoActivityToday).map((b) => b.branchId));
  const allBranchesIdle = summary.branches.length > 0 && idleBranchIds.size === summary.branches.length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs *:p-1.5 *:text-start">
              <th>الفرع</th>
              <th>رصيد الخزينة</th>
              <th>إجمالي المبيعات (كل الوقت)</th>
              <th title="تكلفة مؤكدة من مورد/مخزون حقيقي — مش تقدير">ربح مؤكد (اليوم)</th>
              <th title="تكلفة مقدّرة (هامش السعر الافتراضي أو تكلفة لسه متأكدتش) — مش مؤكدة">ربح تقديري (اليوم)</th>
              <th title="مصاريف شهرية ثابتة وأصلها الشهري (إيجار/رواتب...) مقسّمة على 30 يوم">المصاريف الثابتة يوميًا</th>
              <th title="(ربح مؤكد + ربح تقديري لليوم) − المصاريف الثابتة يوميًا">الصافي بعد المصاريف اليومية (اليوم)</th>
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
                <td className="text-success">{fmt(b.realProfit)}</td>
                <td>
                  {fmt(b.estimatedProfit)}
                  {b.hasUnknownProfitItems && (
                    <span className="text-warning ms-1 text-xs" title="فيه أصناف اليوم مالهاش سعر تكلفة مسجّل خالص — صافي الربح المعروض ناقص">
                      ⚠
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground">{fmt(b.dailyFixedCost)}</td>
                <td className={b.netAfterDailyFixedCost < 0 ? 'text-destructive font-medium' : 'font-medium'}>
                  {fmt(b.netAfterDailyFixedCost)}
                  {idleBranchIds.has(b.branchId) && (
                    <span className="text-muted-foreground ms-1 text-xs font-normal" title={NO_SALES_TODAY_HINT}>
                      (لسه مفيش مبيعات)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        "إجمالي المبيعات" رقم تراكمي لكل الوقت. أعمدة الربح والمصاريف الثابتة واليوم بعدها كلها عن اليوم الحالي فقط —
        نفس الفترة، عشان تكون قابلة للمقارنة مع بعضها.
      </p>
      {allBranchesIdle && <p className="text-muted-foreground text-xs">{NO_SALES_TODAY_HINT}</p>}
      {summary.branches.length > 1 && (
        <div className="border-border grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-muted-foreground text-xs">إجمالي رصيد الخزينة (كل الفروع)</p>
            <p className={`text-lg font-bold ${summary.totalTreasuryBalance < 0 ? 'text-destructive' : ''}`}>
              {fmt(summary.totalTreasuryBalance)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي المبيعات العام (كل الوقت)</p>
            <p className="text-lg font-bold">{fmt(summary.totalSales)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي الربح المؤكد (اليوم)</p>
            <p className="text-lg font-bold">{fmt(summary.totalRealProfit)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي الربح التقديري (اليوم)</p>
            <p className="text-lg font-bold">
              {fmt(summary.totalEstimatedProfit)}
              {summary.hasUnknownProfitItems && <span className="text-warning ms-1 text-xs">⚠ فيه أصناف غير معروفة التكلفة</span>}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">إجمالي المصاريف الثابتة يوميًا</p>
            <p className="text-lg font-bold">{fmt(summary.totalDailyFixedCost)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">الصافي العام بعد المصاريف اليومية (اليوم)</p>
            <p className={`text-lg font-bold ${summary.totalNetAfterDailyFixedCost < 0 ? 'text-destructive' : ''}`}>
              {fmt(summary.totalNetAfterDailyFixedCost)}
            </p>
          </div>
        </div>
      )}
      {summary.hasUnknownProfitItems && (
        <p className="text-muted-foreground text-xs">
          ⚠ فيه أصناف اليوم (منتجات جاهزة/بضاعة مخزون/لوحات وإعلانات) مالهاش سعر تكلفة مسجّل بعد — بمبيعات
          {fmt(summary.totalUnknownCostRevenue)} مش داخلة في الربح المؤكد ولا التقديري خالص، لحد ما يتسجّل سعر
          التكلفة بتاعها من شاشة المخزون/المنتجات الجاهزة، أو سعر تكلفة المورد للوحات من شاشة الإعدادات.
        </p>
      )}
    </div>
  );
}
