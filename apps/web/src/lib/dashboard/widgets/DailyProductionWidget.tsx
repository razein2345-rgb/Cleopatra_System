import { CheckCircle2 } from 'lucide-react';
import { DashboardWidget } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function DailyProductionWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  return (
    <DashboardWidget
      label="الإنتاج اليومي"
      value={summary?.dailyProductionCount ?? null}
      icon={CheckCircle2}
      tone="success"
      hint="مراحل مكتملة اليوم"
    />
  );
}

export const dailyProductionWidget: DashboardWidgetDefinition = {
  id: 'daily-production',
  permission: 'work-orders.view',
  Component: DailyProductionWidgetComponent,
};
