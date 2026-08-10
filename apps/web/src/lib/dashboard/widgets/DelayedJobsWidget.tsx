import { ClipboardList } from 'lucide-react';
import { DashboardWidget } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function DelayedJobsWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  return (
    <DashboardWidget
      label="مهام متأخرة"
      value={summary?.totals.delayed ?? null}
      icon={ClipboardList}
      tone="danger"
    />
  );
}

export const delayedJobsWidget: DashboardWidgetDefinition = {
  id: 'delayed-jobs',
  permission: 'work-orders.view',
  Component: DelayedJobsWidgetComponent,
};
