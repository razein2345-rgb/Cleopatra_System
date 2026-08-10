import { Clock } from 'lucide-react';
import { DashboardWidget } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function WaitingJobsWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  return (
    <DashboardWidget
      label="مهام في الانتظار"
      value={summary?.totals.waiting ?? null}
      icon={Clock}
      tone="warning"
    />
  );
}

export const waitingJobsWidget: DashboardWidgetDefinition = {
  id: 'waiting-jobs',
  permission: 'work-orders.view',
  Component: WaitingJobsWidgetComponent,
};
