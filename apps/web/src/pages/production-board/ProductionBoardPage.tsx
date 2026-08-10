import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Route as RouteIcon } from 'lucide-react';
import type { Department, User, WorkflowPriority, WorkflowQueueItem } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatusBadge } from '@/components/cleopatra';
import { cn } from '@/lib/utils';
import { useAuth } from '@/state/AuthContext';
import { ConfirmStageActionDialog } from './ConfirmStageActionDialog';
import { EditQueueItemDialog } from './EditQueueItemDialog';
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  STAGE_STATUS_LABELS,
  formatDueDate,
  formatTimeInStage,
  priorityTone,
  rowToneClassName,
} from './productionBoardLabels';

/**
 * The Queue Philosophy screen (VISION.md) — a department's queue as the
 * entire interface between an employee and their work. Reads/writes go
 * through the exact endpoints FEATURE-004 M1 already built and secured
 * (`GET .../queue`, `PUT .../advance`, `PUT .../current-stage`); this page
 * adds no business logic of its own. Filtering (FEATURE-005 Sprint 2.5) is a
 * client-side narrowing of the array the server already returned, in the
 * order the server already sorted it — it never re-sorts or re-fetches.
 */
export function ProductionBoardPage() {
  const { can } = useAuth();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [employees, setEmployees] = useState<User[]>([]);
  const [queue, setQueue] = useState<WorkflowQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WorkflowQueueItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: WorkflowQueueItem; action: 'FAIL' | 'SKIP' } | null>(
    null,
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<WorkflowPriority | 'ALL'>('ALL');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet<Department[]>('/api/departments')
      .then((depts) => {
        setDepartments(depts);
        if (depts.length > 0) {
          // FEATURE-005 Sprint 2.5 — a `?department=<id>` deep link from the
          // Dashboard's Jobs by Department widget (Requirement 8). Read once
          // at mount: arriving here is always a fresh route mount (navigating
          // from the Dashboard), so `window.location.search` is accurate.
          const fromLink = new URLSearchParams(window.location.search).get('department');
          const target = fromLink && depts.some((d) => d.id === fromLink) ? fromLink : depts[0].id;
          setDepartmentId((prev) => prev || target);
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الأقسام'));
    apiGet<User[]>('/api/users').then(setEmployees).catch(() => undefined);
  }, []);

  const employeeName = (id: string | null) => employees.find((e) => e.id === id)?.name ?? '—';

  const loadQueue = useCallback(() => {
    if (!departmentId) return;
    apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?departmentId=${departmentId}`)
      .then((items) => {
        setQueue(items);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الانتظار'));
  }, [departmentId]);

  useEffect(loadQueue, [loadQueue]);

  const filteredQueue = useMemo(() => {
    if (!queue) return null;
    const q = search.trim().toLowerCase();
    return queue.filter((item) => {
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
      if (delayedOnly && !item.isDelayed) return false;
      if (q) {
        const matchesOrder = item.workOrderNumber?.toLowerCase().includes(q) ?? false;
        const matchesCustomer = item.customerName?.toLowerCase().includes(q) ?? false;
        if (!matchesOrder && !matchesCustomer) return false;
      }
      return true;
    });
  }, [queue, priorityFilter, delayedOnly, search]);

  const advance = async (item: WorkflowQueueItem, action: 'COMPLETE' | 'FAIL' | 'SKIP') => {
    setActionError(null);
    try {
      await apiPut(`/api/workflow-instances/${item.workflowInstanceId}/advance`, {
        action,
        variableValues: item.variableValues ?? undefined,
      });
      loadQueue();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    }
  };

  if (error) return <div className="text-destructive">{error}</div>;

  const canEdit = can('work-orders.edit');

  const actionButtons = (item: WorkflowQueueItem) => (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => void advance(item, 'COMPLETE')}>
        إنهاء
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setConfirmAction({ item, action: 'SKIP' })}>
        تخطي
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ item, action: 'FAIL' })}>
        فشل
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditingItem(item)}>
        تعديل
      </Button>
    </div>
  );

  // FEATURE-005 Sprint 2.5, Requirement 10 — always visible (read-only), unlike
  // the mutation actions above which stay gated behind `work-orders.edit`.
  const timelineLink = (item: WorkflowQueueItem) => (
    <Link
      to={`/production-board/timeline/${item.workflowInstanceId}?workOrderNumber=${encodeURIComponent(item.workOrderNumber ?? '')}&customerName=${encodeURIComponent(item.customerName ?? '')}`}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
    >
      <RouteIcon className="size-3.5" />
      المسار الكامل
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">لوحة الإنتاج</h1>
        <div className="flex flex-wrap items-center gap-2">
          {departments && (
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button type="button" variant="secondary" size="icon" onClick={loadQueue} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          {lastUpdated && (
            <span className="text-muted-foreground text-xs">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم الأمر أو اسم العميل…"
          className="border-input bg-background min-w-[180px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as WorkflowPriority | 'ALL')}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">كل الأولويات</option>
          {PRIORITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} />
          المتأخرة فقط
        </label>
      </div>

      {actionError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {actionError}
        </div>
      )}

      {!filteredQueue ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <>
          {/* Desktop/tablet: table. Mobile: cards (Requirement 12 — a real layout, not horizontal scroll). */}
          <div className="border-border bg-card hidden rounded-2xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل</TableHead>
                  <TableHead>أمر التشغيل</TableHead>
                  <TableHead>المرحلة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>التأخير</TableHead>
                  <TableHead>تاريخ الاستحقاق</TableHead>
                  <TableHead>منذ</TableHead>
                  <TableHead>الموظف المسؤول</TableHead>
                  <TableHead>سبب الانتظار</TableHead>
                  <TableHead>المسار</TableHead>
                  {canEdit && <TableHead>الإجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQueue.map((item) => (
                  <TableRow key={item.id} className={cn(rowToneClassName(item.isDelayed, item.priority))}>
                    <TableCell className="font-medium">{item.customerName ?? '—'}</TableCell>
                    <TableCell>{item.workOrderNumber ?? '—'}</TableCell>
                    <TableCell>{item.stageName}</TableCell>
                    <TableCell>
                      <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
                        {STAGE_STATUS_LABELS[item.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={priorityTone(item.priority)}>{PRIORITY_LABELS[item.priority]}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      {item.isDelayed ? (
                        <StatusBadge tone="danger">متأخرة</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">في الموعد</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDueDate(item.dueDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTimeInStage(item.startedAt, item.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{employeeName(item.assignedEmployeeId)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.waitingReason ?? '—'}</TableCell>
                    <TableCell>{timelineLink(item)}</TableCell>
                    {canEdit && <TableCell>{actionButtons(item)}</TableCell>}
                  </TableRow>
                ))}
                {filteredQueue.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 12 : 11} className="text-muted-foreground text-center">
                      {queue && queue.length > 0
                        ? 'لا توجد مهام مطابقة لعوامل التصفية الحالية.'
                        : 'لا توجد مهام في قائمة الانتظار لهذا القسم.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 sm:hidden">
            {filteredQueue.length === 0 && (
              <div className="border-border bg-card text-muted-foreground rounded-2xl border p-4 text-center text-sm">
                {queue && queue.length > 0
                  ? 'لا توجد مهام مطابقة لعوامل التصفية الحالية.'
                  : 'لا توجد مهام في قائمة الانتظار لهذا القسم.'}
              </div>
            )}
            {filteredQueue.map((item) => (
              <Card key={item.id} className={cn('gap-2 p-3', rowToneClassName(item.isDelayed, item.priority))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.customerName ?? '—'}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.workOrderNumber ?? '—'} · {item.stageName}
                    </p>
                  </div>
                  {item.isDelayed ? (
                    <StatusBadge tone="danger">متأخرة</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">في الموعد</StatusBadge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
                    {STAGE_STATUS_LABELS[item.status]}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(item.priority)}>{PRIORITY_LABELS[item.priority]}</StatusBadge>
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>الاستحقاق: {formatDueDate(item.dueDate)}</span>
                  <span>منذ {formatTimeInStage(item.startedAt, item.createdAt)}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {employeeName(item.assignedEmployeeId)}
                  {item.waitingReason ? ` — ${item.waitingReason}` : ''}
                </div>
                {timelineLink(item)}
                {canEdit && actionButtons(item)}
              </Card>
            ))}
          </div>
        </>
      )}

      {editingItem && (
        <EditQueueItemDialog
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            loadQueue();
          }}
        />
      )}

      {confirmAction && (
        <ConfirmStageActionDialog
          stageName={confirmAction.item.stageName}
          action={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            void advance(confirmAction.item, confirmAction.action);
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}
