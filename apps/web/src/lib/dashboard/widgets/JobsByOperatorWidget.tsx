import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function JobsByOperatorWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">المهام حسب الموظف</span>
      </div>
      {summary === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : summary.byOperator.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد مهام مسندة حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {summary.byOperator.map((o) => (
            <li key={o.employeeId} className="flex items-center justify-between">
              <span>{o.employeeName}</span>
              <span className="text-muted-foreground">
                {o.waiting + o.inProgress} مهمة{o.delayed > 0 ? ` — ${o.delayed} متأخرة` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const jobsByOperatorWidget: DashboardWidgetDefinition = {
  id: 'jobs-by-operator',
  permission: 'work-orders.view',
  Component: JobsByOperatorWidgetComponent,
  span: 'lg',
};
