import { PlayCircle } from 'lucide-react';
import { DashboardWidget } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function JobsInProgressWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  return (
    <DashboardWidget
      label="مهام قيد التنفيذ"
      value={summary?.totals.inProgress ?? null}
      icon={PlayCircle}
      tone="info"
    />
  );
}

export const jobsInProgressWidget: DashboardWidgetDefinition = {
  id: 'jobs-in-progress',
  permission: 'work-orders.view',
  Component: JobsInProgressWidgetComponent,
};
