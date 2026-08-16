import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Pencil, RefreshCw, Route as RouteIcon, SkipForward } from 'lucide-react';
import type { Department, ProductionTrack, User, WorkflowPriority, WorkflowQueueItem } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatusBadge } from '@/components/cleopatra';
import { cn } from '@/lib/utils';
import { useAuth } from '@/state/AuthContext';
import { ConfirmStageActionDialog } from './ConfirmStageActionDialog';
import { EditQueueItemDialog } from './EditQueueItemDialog';
import { ProductionBoardOrdersTab } from './ProductionBoardOrdersTab';
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
 * FEATURE-010 (2026-08-14, owner's exact spec) — "الأقسام" tab's own sub-
 * tabs: التصميم first (shared across every track — a real Department, not
 * a `ProductionTrack`, so it's handled as `'DESIGN'` and queried by
 * `departmentId` like before), then one tab per confirmed production
 * track in the owner's exact order, plus "منتجات أخرى" (OTHER_PRODUCTS)
 * appended at the end — a real, working track with real departments and
 * a published template that wasn't in the owner's list but has jobs that
 * would otherwise have nowhere to show.
 */
type TrackTabKey = 'DESIGN' | ProductionTrack;
const TRACK_TAB_ORDER: TrackTabKey[] = [
  'DESIGN',
  'OFFSET',
  'DIGITAL',
  'BOARDS_SIGNAGE',
  'READY_PRODUCTS',
  'SERVICES',
  'OTHER_PRODUCTS',
];
const TRACK_TAB_LABELS: Record<TrackTabKey, string> = {
  DESIGN: 'التصميم',
  OFFSET: 'أوفست',
  DIGITAL: 'ديجيتال',
  BOARDS_SIGNAGE: 'لوحات وإعلانات',
  READY_PRODUCTS: 'منتجات جاهزة',
  SERVICES: 'خدمات',
  OTHER_PRODUCTS: 'منتجات أخرى',
};

/**
 * FEATURE-010 (2026-08-14, owner's exact spec) — two tabs, both reading
 * from the same Workflow Engine data (WorkflowInstance/StageInstance),
 * shown two different ways: "الطلبات" (every active order, its full
 * Workflow as a stage chain) and "الأقسام" (the pre-existing department
 * queue, unchanged behaviorally — see `DepartmentsTab` below, previously
 * this whole file's default export).
 */
type TopTab = 'OVERVIEW' | 'ORDERS' | 'DEPARTMENTS';
const TOP_TAB_ORDER: TopTab[] = ['OVERVIEW', 'ORDERS', 'DEPARTMENTS'];
const TOP_TAB_LABELS: Record<TopTab, string> = {
  OVERVIEW: 'نظرة عامة',
  ORDERS: 'الطلبات',
  DEPARTMENTS: 'الأقسام',
};

export function ProductionBoardPage() {
  const [tab, setTab] = useState<TopTab>('OVERVIEW');
  const [departmentsTrackTab, setDepartmentsTrackTab] = useState<TrackTabKey>('DESIGN');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">لوحة الإنتاج</h1>
        <div className="border-border bg-muted/40 flex gap-1 rounded-lg border p-1">
          {TOP_TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              {TOP_TAB_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'OVERVIEW' && (
        <OverviewTab
          onSelectTrack={(track) => {
            setDepartmentsTrackTab(track);
            setTab('DEPARTMENTS');
          }}
        />
      )}
      {tab === 'ORDERS' && <ProductionBoardOrdersTab />}
      {tab === 'DEPARTMENTS' && <DepartmentsTab initialTrackTab={departmentsTrackTab} />}
    </div>
  );
}

interface TrackSummary {
  key: TrackTabKey;
  running: number;
  delayed: number;
  topPriority: WorkflowPriority | null;
}

const PRIORITY_RANK: Record<WorkflowPriority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

/**
 * system_specifications_v2.md §6.5 — the Unified Production Overview, the
 * spec's own "أولوية عليا في التصميم" (top design priority): one screen
 * showing every production department's status at once (running/delayed
 * job counts, top priority), instead of having to click through each
 * track's own tab in `DepartmentsTab` to find out. Deliberately reuses the
 * exact same `/api/workflow-instances/queue` endpoint `DepartmentsTab`
 * already calls per track — no new backend endpoint, no data stored here
 * beyond this component's own render state (rule 5 — no Duplicate Logic /
 * parallel storage). Machine status isn't shown — no Machine/Capacity
 * model exists yet (deferred to a later batch, see gap_analysis_report.md).
 */
function OverviewTab({ onSelectTrack }: { onSelectTrack: (track: TrackTabKey) => void }) {
  const [summaries, setSummaries] = useState<TrackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Manufacturing shop-floor dashboards refresh every 30-60s to match how
  // often someone actually glances at them — a manual refresh button alone
  // isn't enough for a screen meant to stay open on a shared/wall display.
  const AUTO_REFRESH_MS = 45_000;

  const load = useCallback(() => {
    setError(null);
    apiGet<Department[]>('/api/departments')
      .then(async (depts) => {
        const designDeptId = depts.find((d) => d.code === 'DESIGN')?.id;
        const results = await Promise.all(
          TRACK_TAB_ORDER.map(async (key): Promise<TrackSummary> => {
            const query = key === 'DESIGN' ? (designDeptId ? `departmentId=${designDeptId}` : null) : `productionTrack=${key}`;
            if (!query) return { key, running: 0, delayed: 0, topPriority: null };
            const items = await apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?${query}`);
            const topPriority = items.reduce<WorkflowPriority | null>(
              (top, item) => (top === null || PRIORITY_RANK[item.priority] > PRIORITY_RANK[top] ? item.priority : top),
              null,
            );
            return { key, running: items.length, delayed: items.filter((i) => i.isDelayed).length, topPriority };
          }),
        );
        setSummaries(results);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل النظرة العامة'));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    const interval = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!summaries) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">حالة كل قسم إنتاجي لحظيًا — اضغط على أي كارت لفتح القسم مباشرة.</p>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-muted-foreground text-xs">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button type="button" variant="secondary" size="icon" onClick={load} aria-label="تحديث">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaries.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelectTrack(s.key)}
            className={cn(
              'border-border bg-card rounded-2xl border p-4 text-start transition hover:shadow-md',
              s.delayed > 0 ? 'border-danger/40' : s.topPriority === 'URGENT' ? 'border-warning/40' : '',
            )}
          >
            <p className="text-muted-foreground text-sm">{TRACK_TAB_LABELS[s.key]}</p>
            <p className="mt-1 text-2xl font-bold">
              {s.running} <span className="text-muted-foreground text-sm font-normal">جارية</span>
            </p>
            {s.delayed > 0 ? (
              <p className="text-danger mt-1 text-sm">⚠ {s.delayed} متأخر</p>
            ) : (
              <p className="text-success mt-1 text-sm">✓ مفيش متأخر</p>
            )}
            {s.topPriority && (
              <StatusBadge tone={priorityTone(s.topPriority)} className="mt-2">
                أعلى أولوية: {PRIORITY_LABELS[s.topPriority]}
              </StatusBadge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function DepartmentsTab({ initialTrackTab }: { initialTrackTab?: TrackTabKey }) {
  const { can } = useAuth();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [trackTab, setTrackTab] = useState<TrackTabKey>(initialTrackTab ?? 'DESIGN');
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
        // FEATURE-005 Sprint 2.5 — a `?department=<id>` deep link from the
        // Dashboard's Jobs by Department widget (Requirement 8). Read once
        // at mount: arriving here is always a fresh route mount (navigating
        // from the Dashboard), so `window.location.search` is accurate.
        // Resolve the linked department to its track sub-tab (or التصميم).
        const fromLink = new URLSearchParams(window.location.search).get('department');
        const linkedDept = fromLink ? depts.find((d) => d.id === fromLink) : undefined;
        if (linkedDept) {
          setTrackTab(linkedDept.code === 'DESIGN' ? 'DESIGN' : (linkedDept.productionTrack ?? 'DESIGN'));
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الأقسام'));
    apiGet<User[]>('/api/users').then(setEmployees).catch(() => undefined);
  }, []);

  const employeeName = (id: string | null) => employees.find((e) => e.id === id)?.name ?? '—';
  const designDepartmentId = departments?.find((d) => d.code === 'DESIGN')?.id;

  const loadQueue = useCallback(() => {
    const query =
      trackTab === 'DESIGN'
        ? designDepartmentId
          ? `departmentId=${designDepartmentId}`
          : null
        : `productionTrack=${trackTab}`;
    if (!query) return;
    apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?${query}`)
      .then((items) => {
        setQueue(items);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الانتظار'));
  }, [trackTab, designDepartmentId]);

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

  // FEATURE-010 (2026-08-14, owner: "في الورك فلو متقسم ويدجيتز بتنتقل
  // دايركت لما ادوس على الـchek box اللي جمب الطلب إلى المرحلة اللي بعدها")
  // — a single checkbox replaces the "إنهاء" button: ticking it immediately
  // completes the current stage (same `advance(item, 'COMPLETE')` call the
  // button already made, no confirmation). تخطي/فشل/تعديل stay available as
  // small secondary icons next to it — less common actions, not gone.
  const actionButtons = (item: WorkflowQueueItem) => (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs" title="إنهاء المرحلة والانتقال للتالية">
        <input type="checkbox" checked={false} onChange={() => void advance(item, 'COMPLETE')} />
        إنهاء
      </label>
      <button
        type="button"
        title="تخطي"
        onClick={() => setConfirmAction({ item, action: 'SKIP' })}
        className="text-muted-foreground hover:text-foreground"
      >
        <SkipForward className="size-4" />
      </button>
      <button
        type="button"
        title="فشل"
        onClick={() => setConfirmAction({ item, action: 'FAIL' })}
        className="text-muted-foreground hover:text-destructive"
      >
        <Ban className="size-4" />
      </button>
      <button
        type="button"
        title="تعديل"
        onClick={() => setEditingItem(item)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-4" />
      </button>
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
      <div className="border-border bg-muted/40 flex flex-wrap gap-1 rounded-lg border p-1">
        {TRACK_TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTrackTab(key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              trackTab === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {TRACK_TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
