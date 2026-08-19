import type { ComponentType, ReactNode } from 'react';
import type { DashboardWidgetDefinition } from './types';
import { WorkflowQueueSummaryProvider } from './providers/WorkflowQueueSummaryProvider';
import { financialOverviewWidget } from './widgets/FinancialOverviewWidget';
import { openQuotationsWidget } from './widgets/OpenQuotationsWidget';
import { activeWorkOrdersWidget } from './widgets/ActiveWorkOrdersWidget';
import { waitingJobsWidget } from './widgets/WaitingJobsWidget';
import { jobsInProgressWidget } from './widgets/JobsInProgressWidget';
import { delayedJobsWidget } from './widgets/DelayedJobsWidget';
import { dailyProductionWidget } from './widgets/DailyProductionWidget';
import { jobsByDepartmentWidget } from './widgets/JobsByDepartmentWidget';
import { jobsByOperatorWidget } from './widgets/JobsByOperatorWidget';
import { supplierDelaysWidget } from './widgets/SupplierDelaysWidget';
import { readyForDeliveryWidget } from './widgets/ReadyForDeliveryWidget';
import { attendanceWidget } from './widgets/AttendanceWidget';
import { lowStockWidget } from './widgets/LowStockWidget';

/**
 * Every Dashboard card, in render order. Add a widget by writing a
 * `DashboardWidgetDefinition` in `widgets/` and listing it here —
 * `DashboardPage.tsx` never changes. See REFINEMENTS.md §2.
 *
 * FEATURE-005 Sprint 2 adds the remaining VISION.md Production Dashboard
 * representative views (Jobs in progress, Jobs by department, Jobs by
 * operator, Supplier delays, Daily production) to Sprint 1's original
 * four — all reading the same `WorkflowQueueSummaryProvider`.
 */
export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  financialOverviewWidget,
  attendanceWidget,
  openQuotationsWidget,
  activeWorkOrdersWidget,
  waitingJobsWidget,
  jobsInProgressWidget,
  delayedJobsWidget,
  dailyProductionWidget,
  jobsByDepartmentWidget,
  jobsByOperatorWidget,
  supplierDelaysWidget,
  readyForDeliveryWidget,
  lowStockWidget,
];

/**
 * Shared-data context providers the widget grid is wrapped in, so widgets
 * that read the same source (e.g. the three queue-derived widgets above)
 * don't each fetch independently. Add a provider here when a future
 * widget group needs one — `DashboardPage.tsx` composes this list
 * generically, it doesn't know what any provider is for.
 */
export const DASHBOARD_DATA_PROVIDERS: ComponentType<{ children: ReactNode }>[] = [
  WorkflowQueueSummaryProvider,
];
