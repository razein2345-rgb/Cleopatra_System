import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { WorkflowInstanceListItem, WorkflowStage, WorkflowTemplate } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { STAGE_STATUS_LABELS } from './productionBoardLabels';

type ChainStageDisplay =
  | { kind: 'REACHED'; stage: WorkflowStage; status: 'DONE' | 'IN_PROGRESS' | 'SKIPPED' | 'FAILED' }
  | { kind: 'UPCOMING'; stage: WorkflowStage };

/**
 * FEATURE-010 (2026-08-14, owner's exact spec) — "الطلبات" tab: every
 * active order as one card, its full Workflow rendered as a stage chain
 * with the current stage visually highlighted *inside* the chain (not as
 * separate text). `GET /api/workflow-instances` only returns
 * `stageInstances[]` for stages the order has actually reached so far
 * (`createWorkflowInstance`/`applyStageTransition` only ever create a
 * `StageInstance` row for the stage the instance is on or has passed) — so
 * showing the *full* chain, including stages not reached yet, requires
 * merging that against the owning `WorkflowTemplate`'s complete stage list
 * (fetched once per distinct template, not per order). A stage with no
 * matching `StageInstance` yet is simply "upcoming" — muted, no status.
 *
 * Reaching "تسليم" (or any stage with no `nextStageId`) completes the
 * `WorkflowInstance` (existing engine behavior — see
 * `applyStageTransition`), so it stops being `IN_PROGRESS` and this tab's
 * default `?status=IN_PROGRESS` fetch naturally drops it — never deleted,
 * just no longer active (owner's Rule 9/10).
 */
export function ProductionBoardOrdersTab() {
  const [instances, setInstances] = useState<WorkflowInstanceListItem[] | null>(null);
  const [templatesById, setTemplatesById] = useState<Map<string, WorkflowTemplate>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = () => {
    apiGet<WorkflowInstanceListItem[]>('/api/workflow-instances?status=IN_PROGRESS')
      .then(async (items) => {
        setInstances(items);
        setLastUpdated(new Date());
        const missingTemplateIds = [...new Set(items.map((i) => i.templateId))];
        const templates = await Promise.all(
          missingTemplateIds.map((id) => apiGet<WorkflowTemplate>(`/api/workflow-templates/${id}`)),
        );
        setTemplatesById(new Map(templates.map((t) => [t.id, t])));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات'));
  };

  useEffect(load, []);

  const cards = useMemo(() => {
    if (!instances) return null;
    return instances.map((instance) => {
      const template = templatesById.get(instance.templateId);
      const stageInstanceByStageId = new Map(instance.stageInstances.map((si) => [si.stageId, si]));
      const chain: ChainStageDisplay[] = (template?.stages ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const si = stageInstanceByStageId.get(stage.id);
          if (!si) return { kind: 'UPCOMING', stage };
          return { kind: 'REACHED', stage, status: si.status === 'WAITING' ? 'IN_PROGRESS' : si.status };
        });
      return { instance, chain };
    });
  }, [instances, templatesById]);

  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="icon" onClick={load} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          {lastUpdated && (
            <span className="text-muted-foreground text-xs">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {!cards ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : cards.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-6 text-center text-sm">
          لا توجد طلبات قيد التشغيل حاليًا.
        </div>
      ) : (
        <div className="grid gap-3">
          {cards.map(({ instance, chain }) => (
            <Card key={instance.id} className="gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{instance.workOrderNumber ?? '—'}</p>
                  <p className="text-muted-foreground text-xs">
                    {instance.customerName ?? '—'} · {instance.templateName}
                  </p>
                  {instance.itemNames.length > 0 && (
                    <p className="text-muted-foreground text-xs">{instance.itemNames.join('، ')}</p>
                  )}
                </div>
                <Link
                  to={`/production-board/timeline/${instance.id}?workOrderNumber=${encodeURIComponent(instance.workOrderNumber ?? '')}&customerName=${encodeURIComponent(instance.customerName ?? '')}`}
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                >
                  المسار الكامل
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {chain.map((entry, idx) => (
                  <div key={entry.stage.id} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-muted-foreground select-none">‹</span>}
                    <StageChip entry={entry} />
                  </div>
                ))}
                {chain.length === 0 && <span className="text-muted-foreground text-sm">جارٍ تحميل مراحل الـWorkflow…</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StageChip({ entry }: { entry: ChainStageDisplay }) {
  if (entry.kind === 'UPCOMING') {
    return (
      <span className="border-border text-muted-foreground rounded-full border border-dashed px-3 py-1 text-xs">
        {entry.stage.name}
      </span>
    );
  }

  const { stage, status } = entry;
  if (status === 'IN_PROGRESS') {
    return (
      <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-bold shadow-sm">
        {stage.name}
      </span>
    );
  }

  const toneClass =
    status === 'DONE'
      ? 'bg-success/15 text-success'
      : status === 'SKIPPED'
        ? 'bg-warning/15 text-warning'
        : 'bg-destructive/15 text-destructive';

  return (
    <span className={cn('rounded-full px-3 py-1 text-xs', toneClass)}>
      {stage.name}
      {status !== 'DONE' && <span className="opacity-75"> ({STAGE_STATUS_LABELS[status]})</span>}
    </span>
  );
}
