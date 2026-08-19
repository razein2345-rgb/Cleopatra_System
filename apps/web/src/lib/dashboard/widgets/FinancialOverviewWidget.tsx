import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { BranchSummary, SalesSummary, TreasuryBalance, TreasuryDayClosure } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import type { DashboardWidgetDefinition } from '../types';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 2.1 ("مفيش أي Widget مالي/تجاري لصاحب
 * المشروع") — the owner opens the same production-feed Dashboard every
 * ordinary employee sees, with no "health of the business" screen of
 * their own. Reuses `getTreasuryBalance`/`getTodayClosure` as-is (no new
 * endpoint for either) plus one new small aggregate for sales
 * (`getSalesSummary`, see orderService.ts's doc comment — confirmed no
 * similar query existed anywhere before this).
 *
 * `permission: 'treasury.view'` on the registry entry is a floor, not the
 * real gate — the actual "owner only" restriction the audit item asks for
 * is this role check, matching the exact pattern `AuditLogPage.tsx` and
 * `EmployeeProfilePage.tsx`'s attendance section already use (there is no
 * role-aware field on `DashboardWidgetDefinition`, so self-gating inside
 * the component is the lowest-risk way to add this without touching the
 * shared widget type).
 */
function FinancialOverviewWidgetComponent() {
  const { authContext } = useAuth();
  const isOwner = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN' || r.name === 'ADMIN') ?? false;

  const [balance, setBalance] = useState<TreasuryBalance | null>(null);
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [closures, setClosures] = useState<{ branch: BranchSummary; closure: TreasuryDayClosure | null }[] | null>(
    null,
  );

  useEffect(() => {
    if (!isOwner) return;
    apiGet<TreasuryBalance>('/api/treasury-entries/balance')
      .then(setBalance)
      .catch(() => undefined);
    apiGet<SalesSummary>('/api/orders/sales-summary')
      .then(setSales)
      .catch(() => undefined);
    apiGet<BranchSummary[]>('/api/branches')
      .then(async (branches) => {
        const rows = await Promise.all(
          branches.map(async (branch) => ({
            branch,
            closure: await apiGet<TreasuryDayClosure | null>(
              `/api/treasury-entries/today-closure?branchId=${branch.id}`,
            ).catch(() => null),
          })),
        );
        setClosures(rows);
      })
      .catch(() => setClosures([]));
  }, [isOwner]);

  if (!isOwner) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">نظرة مالية سريعة</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">رصيد الخزينة</p>
          <p className="text-xl font-bold">{balance ? fmt(balance.balance) : '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">مبيعات اليوم</p>
          <p className="text-xl font-bold">
            {sales ? fmt(sales.todayTotal) : '—'}
            {sales && <span className="text-muted-foreground ms-1 text-xs font-normal">({sales.todayCount} فاتورة)</span>}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">مبيعات آخر 7 أيام</p>
          <p className="text-xl font-bold">
            {sales ? fmt(sales.weekTotal) : '—'}
            {sales && <span className="text-muted-foreground ms-1 text-xs font-normal">({sales.weekCount} فاتورة)</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="text-muted-foreground mb-1.5 text-xs">تقفيل اليوم لكل فرع</p>
        {!closures ? (
          <p className="text-muted-foreground text-xs">جارٍ التحميل…</p>
        ) : closures.length === 0 ? (
          <p className="text-muted-foreground text-xs">لا توجد فروع.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {closures.map(({ branch, closure }) => (
              <div key={branch.id} className="flex items-center gap-1.5 text-xs">
                <span>{branch.name}</span>
                {!closure ? (
                  <StatusBadge tone="warning">لسه مقفلش</StatusBadge>
                ) : closure.isOpen ? (
                  <StatusBadge tone="danger">اتفتح تاني</StatusBadge>
                ) : (
                  <StatusBadge tone="success">مقفول</StatusBadge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export const financialOverviewWidget: DashboardWidgetDefinition = {
  id: 'financial-overview',
  permission: 'treasury.view',
  Component: FinancialOverviewWidgetComponent,
  span: 'lg',
};
