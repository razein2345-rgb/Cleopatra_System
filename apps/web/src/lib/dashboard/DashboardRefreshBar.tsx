import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflowQueueSummaryRefresh } from './providers/WorkflowQueueSummaryProvider';

/**
 * FEATURE-005 Sprint 2.5, Requirement 6 (Dashboard half). `DashboardPage`
 * stays generic over `DASHBOARD_WIDGETS`/`DASHBOARD_DATA_PROVIDERS` — this
 * one small component is the deliberate, acknowledged exception: today the
 * Dashboard's only data provider is `WorkflowQueueSummaryProvider`, so this
 * reads its refresh hook directly rather than building a speculative
 * multi-provider refresh registry for a second provider that doesn't exist
 * yet. Must be rendered inside `WorkflowQueueSummaryProvider`'s tree.
 */
export function DashboardRefreshBar() {
  const { refresh, lastUpdated } = useWorkflowQueueSummaryRefresh();

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="icon" onClick={refresh} aria-label="تحديث">
        <RefreshCw className="size-4" />
      </Button>
      {lastUpdated && (
        <span className="text-muted-foreground text-xs">
          آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
