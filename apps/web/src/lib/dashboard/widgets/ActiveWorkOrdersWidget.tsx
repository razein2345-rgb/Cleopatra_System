import { PackageSearch } from 'lucide-react';
import { DashboardWidget } from '@/components/cleopatra';
import { useWorkflowQueueSummaryContext } from '../providers/WorkflowQueueSummaryProvider';
import type { DashboardWidgetDefinition } from '../types';

function ActiveWorkOrdersWidgetComponent() {
  const summary = useWorkflowQueueSummaryContext();
  return (
    <DashboardWidget
      label="أوامر التشغيل النشطة"
      value={summary?.totals.activeWorkOrders ?? null}
      icon={PackageSearch}
      tone="neutral"
    />
  );
}

export const activeWorkOrdersWidget: DashboardWidgetDefinition = {
  id: 'active-work-orders',
  permission: 'work-orders.view',
  Component: ActiveWorkOrdersWidgetComponent,
};
