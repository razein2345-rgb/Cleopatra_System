import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { WorkflowInstance } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { StatusBadge } from '@/components/cleopatra';
import { STAGE_STATUS_LABELS, stageStatusTone } from './productionBoardLabels';

/**
 * FEATURE-005 Sprint 2.5, Requirement 10 — a read-only, cross-department
 * view of one order's full journey. Reads the existing, unchanged
 * `GET /api/workflow-instances/:id` (built in FEATURE-004 M1, never called
 * by the frontend until now) — no new endpoint, no new authorization rule.
 * Per 01_ANALYSIS.md's Permissions/Security note: this endpoint has never
 * been department-scoped (unlike the per-department queue), so a
 * `work-orders.view` caller sees this order's full stage history regardless
 * of their own department access — that is pre-existing FEATURE-004
 * behavior this page exposes for the first time, not a new access rule.
 * `workOrderNumber`/`customerName` are optional display-only query params
 * passed by the linking row (not fetched or computed here) — reaching this
 * page directly by id simply omits them from the header.
 */
export function WorkOrderTimelinePage() {
  const { workflowInstanceId } = useParams<{ workflowInstanceId: string }>();
  const [searchParams] = useSearchParams();
  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowInstanceId) return;
    apiGet<WorkflowInstance>(`/api/workflow-instances/${workflowInstanceId}`)
      .then(setInstance)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل مسار الطلب'));
  }, [workflowInstanceId]);

  if (error) return <div className="text-destructive">{error}</div>;

  const workOrderNumber = searchParams.get('workOrderNumber');
  const customerName = searchParams.get('customerName');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/production-board" className="text-muted-foreground text-sm hover:underline">
          → العودة إلى لوحة الإنتاج
        </Link>
        <h1 className="text-2xl font-bold">مسار الطلب{workOrderNumber ? ` — ${workOrderNumber}` : ''}</h1>
        {customerName && <p className="text-muted-foreground text-sm">العميل: {customerName}</p>}
      </div>

      {!instance ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : instance.stageInstances.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-4 text-center text-sm">
          لا توجد مراحل مسجلة لهذا الطلب.
        </div>
      ) : (
        <ol className="space-y-3">
          {instance.stageInstances.map((stage, index) => (
            <li key={stage.id} className="border-border bg-card flex items-start gap-3 rounded-2xl border p-4">
              <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{stage.stageName}</p>
                  <StatusBadge tone={stageStatusTone(stage.status)}>{STAGE_STATUS_LABELS[stage.status]}</StatusBadge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {stage.departmentName ?? '—'} · المرحلة {index + 1} من {instance.stageInstances.length}
                </p>
                <p className="text-muted-foreground text-xs">
                  {stage.startedAt ? `بدأت: ${new Date(stage.startedAt).toLocaleString('ar-EG')}` : 'لم تبدأ بعد'}
                  {stage.finishedAt ? ` — انتهت: ${new Date(stage.finishedAt).toLocaleString('ar-EG')}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
