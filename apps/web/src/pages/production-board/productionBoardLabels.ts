import type { StageInstanceStatus, WorkflowPriority } from '@cleopatra/shared';

export const STAGE_STATUS_LABELS: Record<StageInstanceStatus, string> = {
  WAITING: 'في الانتظار',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'مكتملة',
  SKIPPED: 'تم التخطي',
  FAILED: 'فشلت',
};

export const PRIORITY_LABELS: Record<WorkflowPriority, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'مرتفعة',
  URGENT: 'عاجلة',
};

export const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS) as [WorkflowPriority, string][];

export function priorityTone(priority: WorkflowPriority): 'neutral' | 'warning' | 'danger' {
  if (priority === 'URGENT') return 'danger';
  if (priority === 'HIGH') return 'warning';
  return 'neutral';
}

/** FEATURE-005 Sprint 2.5 — display-only date formatting, no business logic. */
export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '—';
  return new Date(dueDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Relative time since a stage started (falling back to when the row was
 * created, for a stage that hasn't been explicitly started) — display-only
 * formatting of an existing timestamp, not a new duration calculation the
 * Workflow Engine owns.
 */
export function formatTimeInStage(startedAt: string | null, createdAt: string): string {
  const since = new Date(startedAt ?? createdAt).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - since) / 60000));
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} س`;
  const days = Math.round(hours / 24);
  return `${days} يوم`;
}

/** Row-level tint for at-a-glance scanning — delayed outranks urgent-but-on-time. */
export function rowToneClassName(isDelayed: boolean, priority: WorkflowPriority): string {
  if (isDelayed) return 'bg-danger/10 hover:bg-danger/15';
  if (priority === 'URGENT') return 'bg-warning/10 hover:bg-warning/15';
  return '';
}

/** FEATURE-005 Sprint 2.5 — the Work Order timeline's per-stage status tone. */
export function stageStatusTone(status: StageInstanceStatus): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'DONE') return 'success';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'FAILED') return 'danger';
  if (status === 'SKIPPED') return 'warning';
  return 'neutral';
}
