import { Building } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

/**
 * FEATURE-005 Sprint 2.5, Requirement 8 — each row links to that
 * department's own Production Board queue. This is the one Dashboard widget
 * that can link accurately: a department's row genuinely is that
 * department's own counts, unlike Delayed Jobs or Jobs by Operator (both
 * cross-department aggregates Production Board's per-department view can't
 * represent without picking an arbitrary department) — those stay
 * informational-only per the approved decision.
 */
function JobsByDepartmentWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Building className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">المهام حسب القسم</span>
      </div>
      {summary === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : summary.byDepartment.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد مهام مفتوحة حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {summary.byDepartment.map((d) => (
            <li key={d.departmentId}>
              <Link
                to={`/production-board?department=${d.departmentId}`}
                className="hover:bg-accent/60 flex items-center justify-between rounded-md px-1 py-0.5 -mx-1 transition-colors"
              >
                <span>{d.departmentName}</span>
                <span className="text-muted-foreground">
                  {d.waiting + d.inProgress} مهمة{d.delayed > 0 ? ` — ${d.delayed} متأخرة` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const jobsByDepartmentWidget: DashboardWidgetDefinition = {
  id: 'jobs-by-department',
  permission: 'work-orders.view',
  Component: JobsByDepartmentWidgetComponent,
  span: 'lg',
};
