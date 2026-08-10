import { useAuth } from '@/state/AuthContext';
import { DASHBOARD_WIDGETS, DASHBOARD_DATA_PROVIDERS } from '@/lib/dashboard/registry';
import { DashboardRefreshBar } from '@/lib/dashboard/DashboardRefreshBar';
import { isWidgetPermitted } from '@/lib/dashboard/types';
import { ModuleNavGrid } from './ModuleNavGrid';

/**
 * Contains no widget logic itself — it filters the widget registry by
 * permission and renders each visible widget's own component inside the
 * registered data providers. Adding a widget never touches this file, see
 * REFINEMENTS.md §2. `DashboardRefreshBar` is the one deliberate exception
 * (FEATURE-005 Sprint 2.5) — see its own doc comment.
 */
export function DashboardPage() {
  const { authContext, can } = useAuth();
  const visibleWidgets = DASHBOARD_WIDGETS.filter((w) => isWidgetPermitted(w, can));

  const grid = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-semibold">نظرة عامة</h2>
        <DashboardRefreshBar />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visibleWidgets.map((w) => (
          <div key={w.id} className={w.span === 'lg' ? 'sm:col-span-2' : undefined}>
            <w.Component />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">مرحبًا، {authContext?.user.name}</h1>
        <p className="text-muted-foreground text-sm">
          الأدوار: {authContext?.user.roles.map((role) => role.label).join('، ') || '—'}
        </p>
      </div>

      <ModuleNavGrid />

      {DASHBOARD_DATA_PROVIDERS.reduceRight((children, Provider) => <Provider>{children}</Provider>, grid)}

      {visibleWidgets.length === 0 && (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-5 text-sm">
          لا تتوفر بيانات تشغيلية لعرضها بصلاحياتك الحالية.
        </div>
      )}
    </div>
  );
}
