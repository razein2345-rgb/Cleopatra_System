import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

/**
 * system_specifications_v2.md §16.2 (HR Scaling Alert, 2026-09-09) —
 * "مراقبة Queue Time، عدد Jobs المنتظرة... يمكن إطلاق تنبيه إداري عند
 * تجاوز الحدود المحددة." Reuses `DepartmentJobSummary.waiting`/`.delayed`
 * (already computed by `getWorkflowDashboardSummary` for
 * `jobsByDepartmentWidget`, رول 5) — `hrScalingAlerts` on the same shared
 * summary is empty until an admin actually sets a threshold in الإعدادات
 * → الإنتاج (رول 15، لا Threshold مثبّت في الكود).
 */
function HrScalingAlertWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  const alerts = summary?.hrScalingAlerts ?? [];

  return (
    <Card className="border-warning/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="text-warning size-4" />
        <span className="text-sm font-bold">تنبيهات التوسع في الفريق</span>
      </div>
      {summary === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm">✓ مفيش قسم متجاوز حدود التنبيه المحددة.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {alerts.map((a, i) => (
            <li key={`${a.departmentId}-${a.reason}-${i}`}>
              <Link
                to={`/production-board?department=${a.departmentId}`}
                className="hover:bg-accent/60 text-warning-foreground flex items-center justify-between rounded-md px-1 py-0.5 -mx-1 transition-colors"
              >
                <span>{a.departmentName}</span>
                <span>
                  {a.reason === 'WAITING' ? 'مهام منتظرة' : 'مهام متأخرة'}: {a.count} (الحد {a.threshold})
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const hrScalingAlertWidget: DashboardWidgetDefinition = {
  id: 'hr-scaling-alert',
  permission: 'work-orders.view',
  Component: HrScalingAlertWidgetComponent,
  span: 'lg',
};
