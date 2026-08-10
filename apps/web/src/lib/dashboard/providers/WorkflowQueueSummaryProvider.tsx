import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { WorkflowDashboardSummary } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';

const WorkflowDashboardSummaryContext = createContext<WorkflowDashboardSummary | null | undefined>(undefined);

/**
 * FEATURE-005 Sprint 2.5 — manual refresh (Requirement 6). A second, small
 * context alongside the summary one, so the eight widgets already reading
 * `useWorkflowQueueSummaryContext()` are untouched; only `DashboardPage`
 * itself needs `refresh`/`lastUpdated`.
 */
const WorkflowDashboardRefreshContext = createContext<{ refresh: () => void; lastUpdated: Date | null } | undefined>(
  undefined,
);

/**
 * A data provider, not a widget — every job-related Dashboard widget
 * (Active Work Orders, Waiting Jobs, Delayed Jobs, Jobs by Department,
 * Jobs by Operator, Supplier Delays, Daily Production) reads from this
 * one provider instead of each fetching independently.
 *
 * FEATURE-005 Sprint 2: this now calls the single
 * `GET /api/workflow-instances/dashboard-summary` aggregate endpoint
 * instead of Sprint 1's `GET /api/departments` + N ×
 * `GET .../queue?departmentId=` fan-out — the endpoint that fan-out was
 * always a stand-in for (Sprint 1 `01_ANALYSIS.md` Open Decision #1).
 * The provider's own shape (one context, gated the same way) is
 * unchanged; only its fetch mechanism is.
 */
export function WorkflowQueueSummaryProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const [summary, setSummary] = useState<WorkflowDashboardSummary | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const canLoad = can('work-orders.view');

  const load = useCallback(() => {
    if (!canLoad) return;
    apiGet<WorkflowDashboardSummary>('/api/workflow-instances/dashboard-summary')
      .then((data) => {
        setSummary(data);
        setLastUpdated(new Date());
      })
      .catch(() => setSummary(null));
  }, [canLoad]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <WorkflowDashboardSummaryContext.Provider value={canLoad ? summary : null}>
      <WorkflowDashboardRefreshContext.Provider value={{ refresh: load, lastUpdated }}>
        {children}
      </WorkflowDashboardRefreshContext.Provider>
    </WorkflowDashboardSummaryContext.Provider>
  );
}

/** `null` = not permitted or still loading; consumers already gate on permission via the registry, so both look the same here. */
export function useWorkflowQueueSummaryContext(): WorkflowDashboardSummary | null {
  const ctx = useContext(WorkflowDashboardSummaryContext);
  if (ctx === undefined) {
    throw new Error('useWorkflowQueueSummaryContext must be used within a WorkflowQueueSummaryProvider');
  }
  return ctx;
}

export function useWorkflowQueueSummaryRefresh(): { refresh: () => void; lastUpdated: Date | null } {
  const ctx = useContext(WorkflowDashboardRefreshContext);
  if (ctx === undefined) {
    throw new Error('useWorkflowQueueSummaryRefresh must be used within a WorkflowQueueSummaryProvider');
  }
  return ctx;
}
