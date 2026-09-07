import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Pencil, RefreshCw, Route as RouteIcon, SkipForward } from 'lucide-react';
import type {
  BusinessPartner,
  Department,
  Machine,
  PartnerAddress,
  ProductionTrack,
  User,
  WorkflowDashboardSummary,
  WorkflowPriority,
  WorkflowQueueItem,
  WorkflowTemplate,
} from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EditableDateCell, EditableSelectCell, EditableTextCell, StatusBadge } from '@/components/cleopatra';
import { cn } from '@/lib/utils';
import { useAuth } from '@/state/AuthContext';
import { ConfirmStageActionDialog } from './ConfirmStageActionDialog';
import { EditQueueItemDialog } from './EditQueueItemDialog';
import { ProductionBoardOrdersTab } from './ProductionBoardOrdersTab';
import { useQueueActions } from './useQueueActions';
import { DragHandle, QueueDndContext, useQueueSortableItem } from './QueueDnd';
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
type TrackTabKey = 'ALL' | 'DESIGN' | 'EXTERNAL_SUPPLIER' | ProductionTrack;
const TRACK_TAB_ORDER: TrackTabKey[] = [
  'ALL',
  'DESIGN',
  'OFFSET',
  'DIGITAL',
  'BOARDS_SIGNAGE',
  'SUBLIMATION_GIFTS',
  'READY_PRODUCTS',
  'SERVICES',
  'OTHER_PRODUCTS',
  // Owner (2026-09-08, "خانة الطلبات اللي هتتجاب من مورد عايزها تظهر كا
  // قسم في الوورك فلو بردو زي باقي الاقسام... اقدر اشوف الطلبات اللي
  // موجودة عند مورد خارجي واقدر ادوس إنها تم استلامها ولا لا") — the real
  // `Department` code `EXTERNAL_SUPPLIER` ("مورّد خارجي") already exists
  // and already carries every "إرسال للمورد"/"الإحضار من المورد" stage
  // instance — it was just buried inside whichever track happened to use
  // it (mainly "منتجات جاهزة"), never its own tab. Handled exactly like
  // `DESIGN` above: a real Department, not a `ProductionTrack`, queried by
  // `departmentId`. The existing "إنهاء" checkbox already marks an item
  // received (advances the stage) — nothing new needed there.
  'EXTERNAL_SUPPLIER',
];
const TRACK_TAB_LABELS: Record<TrackTabKey, string> = {
  // Owner (2026-09-07, "عايز كل الطلبات في مكان واحد وفي فلتر... لكن كله
  // في نفس الداتا بيز وانا افلتر براحتي") — one combined queue across
  // every track/department this caller can see, with its own track filter
  // dropdown (see `DepartmentsTab`) instead of switching tabs one at a
  // time. The per-track tabs below stay exactly as they were — additive,
  // not a replacement.
  ALL: 'الكل',
  DESIGN: 'التصميم',
  OFFSET: 'أوفست',
  DIGITAL: 'ديجيتال',
  BOARDS_SIGNAGE: 'لوحات وإعلانات',
  SUBLIMATION_GIFTS: 'طباعة حرارية وهدايا',
  READY_PRODUCTS: 'منتجات جاهزة',
  SERVICES: 'خدمات',
  OTHER_PRODUCTS: 'منتجات أخرى',
  EXTERNAL_SUPPLIER: 'مورّد خارجي',
};
/** `OverviewTab`'s per-track summary cards — excludes the new "الكل" tab, which isn't a real track/department to summarize on its own. */
const SUMMARY_TRACK_ORDER = TRACK_TAB_ORDER.filter((key): key is Exclude<TrackTabKey, 'ALL'> => key !== 'ALL');

/**
 * FEATURE-010 (2026-08-14, owner's exact spec) — two tabs, both reading
 * from the same Workflow Engine data (WorkflowInstance/StageInstance),
 * shown two different ways: "الطلبات" (every active order, its full
 * Workflow as a stage chain) and "الأقسام" (the pre-existing department
 * queue, unchanged behaviorally — see `DepartmentsTab` below, previously
 * this whole file's default export).
 */
type TopTab = 'OVERVIEW' | 'MY_TASKS' | 'ORDERS' | 'DEPARTMENTS' | 'WORKFLOW';
const TOP_TAB_ORDER: TopTab[] = ['OVERVIEW', 'MY_TASKS', 'ORDERS', 'DEPARTMENTS', 'WORKFLOW'];
const TOP_TAB_LABELS: Record<TopTab, string> = {
  OVERVIEW: 'نظرة عامة',
  MY_TASKS: 'مهامي اليوم',
  ORDERS: 'الطلبات',
  DEPARTMENTS: 'الأقسام',
  // Owner (2026-09-07, "عايز فيو مختلف يظهرلي فيه كل وورك فلو حسب اختياري
  // بيبانلي فيه كل الشغل اللي في الوورك فلو اللي اختارته واشوفه في مراحله
  // المختلفة") — the Kanban-by-workflow view, explicitly deferred until the
  // unified "الكل" tab above shipped (owner's own choice: "ملحق بعد ما
  // الشاشة الموحدة تخلص").
  WORKFLOW: 'حسب الوركفلو',
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
      {tab === 'MY_TASKS' && <MyTasksTab />}
      {tab === 'ORDERS' && <ProductionBoardOrdersTab />}
      {tab === 'DEPARTMENTS' && <DepartmentsTab initialTrackTab={departmentsTrackTab} />}
      {tab === 'WORKFLOW' && <WorkflowKanbanTab />}
    </div>
  );
}

interface TrackSummary {
  key: TrackTabKey;
  running: number;
  delayed: number;
  topPriority: WorkflowPriority | null;
  machinesRunning: number;
  machinesTotal: number;
  machinesInMaintenance: number;
  /** Owner (2026-08-17, "متوسط مدة تسليم الاوردر لكل مسار") — null for DESIGN (not a ProductionTrack) or a track with zero completed jobs yet. */
  avgDeliveryHours: number | null;
}

/** e.g. 30 → "يوم و6 ساعات", 4 → "4 ساعات" — matches how the owner phrased it ("من 3 أيام لإسبوع"). */
function formatDeliveryDuration(hours: number): string {
  const totalHours = Math.round(hours);
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (days === 0) return `${remainingHours} ساعة`;
  if (remainingHours === 0) return `${days} يوم`;
  return `${days} يوم و${remainingHours} ساعة`;
}

/** Owner (2026-09-08, "يطبع فيها... عنوانه علشان يقدر يوصله") — joins a `PartnerAddress`'s free-form fields into one printable line; `null` (no address on file) prints as "—", not an empty cell. */
function formatPartnerAddress(address: PartnerAddress | null): string {
  if (!address) return '—';
  const parts = [address.governorate, address.city, address.district, address.street, address.building].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join('، ') : '—';
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
 * parallel storage). Machine status (§6.5.1/§16.1, 2026-08-16) is grouped
 * client-side from `/api/machines` by each machine's `department.
 * productionTrack` — no per-track machine endpoint invented either.
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
    Promise.all([
      apiGet<Department[]>('/api/departments'),
      apiGet<Machine[]>('/api/machines').catch(() => [] as Machine[]),
      apiGet<WorkflowDashboardSummary>('/api/workflow-instances/dashboard-summary').catch(
        () => null as WorkflowDashboardSummary | null,
      ),
    ])
      .then(async ([depts, machines, dashboardSummary]) => {
        const designDeptId = depts.find((d) => d.code === 'DESIGN')?.id;
        const externalSupplierDeptId = depts.find((d) => d.code === 'EXTERNAL_SUPPLIER')?.id;
        const trackByDeptId = new Map(depts.map((d) => [d.id, d.productionTrack]));
        const avgHoursByTrack = new Map(
          (dashboardSummary?.avgDeliveryDurationByTrack ?? []).map((t) => [t.productionTrack, t.avgHours]),
        );
        const results = await Promise.all(
          SUMMARY_TRACK_ORDER.map(async (key): Promise<TrackSummary> => {
            const specialDeptId = key === 'DESIGN' ? designDeptId : key === 'EXTERNAL_SUPPLIER' ? externalSupplierDeptId : undefined;
            const isSpecial = key === 'DESIGN' || key === 'EXTERNAL_SUPPLIER';
            const trackMachines = machines.filter((m) =>
              isSpecial ? m.departmentId === specialDeptId : m.departmentId && trackByDeptId.get(m.departmentId) === key,
            );
            const machineCounts = {
              machinesTotal: trackMachines.length,
              machinesRunning: trackMachines.filter((m) => m.status === 'RUNNING').length,
              machinesInMaintenance: trackMachines.filter((m) => m.status === 'MAINTENANCE').length,
            };
            const avgDeliveryHours = isSpecial ? null : (avgHoursByTrack.get(key) ?? null);

            const query = isSpecial ? (specialDeptId ? `departmentId=${specialDeptId}` : null) : `productionTrack=${key}`;
            if (!query) return { key, running: 0, delayed: 0, topPriority: null, avgDeliveryHours, ...machineCounts };
            const items = await apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?${query}`);
            const topPriority = items.reduce<WorkflowPriority | null>(
              (top, item) => (top === null || PRIORITY_RANK[item.priority] > PRIORITY_RANK[top] ? item.priority : top),
              null,
            );
            return {
              key,
              running: items.length,
              delayed: items.filter((i) => i.isDelayed).length,
              topPriority,
              avgDeliveryHours,
              ...machineCounts,
            };
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
            {s.machinesTotal > 0 && (
              <p className={cn('mt-1 text-sm', s.machinesInMaintenance > 0 ? 'text-warning' : 'text-muted-foreground')}>
                🔧 {s.machinesRunning}/{s.machinesTotal} ماكينة شغالة
                {s.machinesInMaintenance > 0 ? ` — ${s.machinesInMaintenance} تحت الصيانة` : ''}
              </p>
            )}
            {s.avgDeliveryHours !== null && (
              <p className="text-muted-foreground mt-1 text-sm">
                ⏱ متوسط مدة التسليم: {formatDeliveryDuration(s.avgDeliveryHours)}
              </p>
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

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 5.1 ("لوحة الإنتاج مفيهاش 'مهامي اليوم'
 * شخصية") — an employee assigned across several departments (the common
 * case for this 8-person team, CLAUDE.md §6's "تعدد الأقسام للموظف
 * الواحد") otherwise has to open every department's tab to find their own
 * name in the list. One flat queue across all departments,
 * scoped server-side to the caller's own StaffProfile id
 * (`/api/workflow-instances/queue?mine=true` — see `getMyQueue` in
 * `workflowInstanceService.ts`), so unlike `DepartmentsTab` there is no
 * department/track selector — just what's actually assigned to *me*.
 */
function MyTasksTab() {
  const { can } = useAuth();
  const [queue, setQueue] = useState<WorkflowQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WorkflowQueueItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: WorkflowQueueItem; action: 'FAIL' | 'SKIP' } | null>(
    null,
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [delayedOnly, setDelayedOnly] = useState(false);

  const loadQueue = useCallback(() => {
    apiGet<WorkflowQueueItem[]>('/api/workflow-instances/queue?mine=true')
      .then((items) => {
        setQueue(items);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل مهامك'));
  }, []);

  useEffect(loadQueue, [loadQueue]);

  const filteredQueue = useMemo(() => {
    if (!queue) return null;
    return delayedOnly ? queue.filter((item) => item.isDelayed) : queue;
  }, [queue, delayedOnly]);

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
          <div className="border-border bg-card hidden rounded-2xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل</TableHead>
                  <TableHead>أمر التشغيل</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead>المرحلة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>التأخير</TableHead>
                  <TableHead>تاريخ الاستحقاق</TableHead>
                  <TableHead>منذ</TableHead>
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
                    <TableCell className="text-muted-foreground">{item.departmentName ?? '—'}</TableCell>
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
                        : 'مفيش مهام متعينة عليك دلوقتي.'}
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
                  : 'مفيش مهام متعينة عليك دلوقتي.'}
              </div>
            )}
            {filteredQueue.map((item) => (
              <Card key={item.id} className={cn('gap-2 p-3', rowToneClassName(item.isDelayed, item.priority))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.customerName ?? '—'}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.workOrderNumber ?? '—'} · {item.departmentName ?? '—'} · {item.stageName}
                    </p>
                  </div>
                  {item.isDelayed ? (
                    <StatusBadge tone="danger">متأخرة</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">في الموعد</StatusBadge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
                    {STAGE_STATUS_LABELS[item.status]}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(item.priority)}>{PRIORITY_LABELS[item.priority]}</StatusBadge>
                  <span className="text-muted-foreground">استحقاق: {formatDueDate(item.dueDate)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {timelineLink(item)}
                  {canEdit && actionButtons(item)}
                </div>
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

/**
 * One draggable desktop table row — `useQueueSortableItem` must be called
 * per-row (a real hook, so it needs its own component instance), matching
 * `DepartmentsTab`'s existing column layout exactly, just with a leading
 * drag-handle cell.
 */
/**
 * Owner (2026-09-08, "عايز اقدر اعدل على التفاصيل... زي نوشن") — the four
 * queue fields that used to be edit-only through `EditQueueItemDialog`,
 * now click-to-edit-in-place using the existing `Editable*Cell` family
 * (`@/components/cleopatra`, already built for this exact "زي جدول نوشن"
 * pattern elsewhere in the app — rule 5, no new inline-edit primitives).
 * Shared by the table row, the mobile card, and the Kanban card so all
 * three stay in sync automatically.
 */
function PriorityCell({ item, updateField, disabled }: { item: WorkflowQueueItem; updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>; disabled: boolean }) {
  if (disabled) return <StatusBadge tone={priorityTone(item.priority)}>{PRIORITY_LABELS[item.priority]}</StatusBadge>;
  return (
    <EditableSelectCell
      value={item.priority}
      options={PRIORITY_OPTIONS}
      onSave={(next) => updateField(item, { priority: next })}
      renderValue={(v) => <StatusBadge tone={priorityTone(v)}>{PRIORITY_LABELS[v]}</StatusBadge>}
    />
  );
}

function DueDateCell({ item, updateField, disabled }: { item: WorkflowQueueItem; updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>; disabled: boolean }) {
  if (disabled) return <span className="text-muted-foreground">{formatDueDate(item.dueDate)}</span>;
  return (
    <EditableDateCell
      value={item.dueDate ? item.dueDate.slice(0, 10) : null}
      onSave={(next) => updateField(item, { dueDate: next })}
    />
  );
}

function AssigneeCell({
  item,
  employees,
  updateField,
  disabled,
}: {
  item: WorkflowQueueItem;
  employees: User[];
  updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>;
  disabled: boolean;
}) {
  const name = employees.find((e) => e.id === item.assignedEmployeeId)?.name ?? '—';
  if (disabled) return <span className="text-muted-foreground">{name}</span>;
  // `EditableSelectCell` is `T extends string` — `''` stands in for "غير
  // معيّن" (unassigned) since the component itself can't carry `null`.
  const options: [string, string][] = [['', 'غير معيّن'], ...employees.map((e): [string, string] => [e.id, e.name])];
  return (
    <EditableSelectCell
      value={item.assignedEmployeeId ?? ''}
      options={options}
      onSave={(next) => updateField(item, { assignedEmployeeId: next || null })}
      renderValue={(v) => employees.find((e) => e.id === v)?.name ?? 'غير معيّن'}
    />
  );
}

function WaitingReasonCell({ item, updateField, disabled }: { item: WorkflowQueueItem; updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>; disabled: boolean }) {
  if (disabled) return <span className="text-muted-foreground">{item.waitingReason ?? '—'}</span>;
  return (
    <EditableTextCell
      value={item.waitingReason ?? ''}
      placeholder="—"
      onSave={(next) => updateField(item, { waitingReason: next || null })}
    />
  );
}

function SortableQueueTableRow({
  item,
  employees,
  supplierName,
  updateField,
  canEditFields,
  timelineLink,
  canEdit,
  actionButtons,
}: {
  item: WorkflowQueueItem;
  employees: User[];
  supplierName: (id: string | null) => string;
  updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>;
  canEditFields: boolean;
  timelineLink: (item: WorkflowQueueItem) => ReactNode;
  canEdit: boolean;
  actionButtons: (item: WorkflowQueueItem) => ReactNode;
}) {
  const { setNodeRef, style, attributes, listeners } = useQueueSortableItem(item.id);
  return (
    <TableRow ref={setNodeRef} style={style} className={cn(rowToneClassName(item.isDelayed, item.priority))}>
      <TableCell className="w-8">
        <DragHandle attributes={attributes} listeners={listeners} />
      </TableCell>
      {/* Owner (2026-09-07, "لازم اشوف إسم الصنف مش رقم الفاتورة علشان اعرف
          هي ايه من برة") — the item's own name is the primary identifier
          now, first column, ahead of the customer/order number. */}
      <TableCell className="font-medium">{item.itemNames.join('، ') || '—'}</TableCell>
      <TableCell className="font-medium">{item.customerName ?? '—'}</TableCell>
      <TableCell>{item.workOrderNumber ?? '—'}</TableCell>
      <TableCell>{item.stageName}</TableCell>
      <TableCell>
        <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
          {STAGE_STATUS_LABELS[item.status]}
        </StatusBadge>
      </TableCell>
      <TableCell>
        <PriorityCell item={item} updateField={updateField} disabled={!canEditFields} />
      </TableCell>
      <TableCell>
        {item.isDelayed ? <StatusBadge tone="danger">متأخرة</StatusBadge> : <StatusBadge tone="success">في الموعد</StatusBadge>}
      </TableCell>
      <TableCell className="text-muted-foreground">
        <DueDateCell item={item} updateField={updateField} disabled={!canEditFields} />
      </TableCell>
      <TableCell className="text-muted-foreground">{formatTimeInStage(item.startedAt, item.createdAt)}</TableCell>
      <TableCell className="text-muted-foreground">
        <AssigneeCell item={item} employees={employees} updateField={updateField} disabled={!canEditFields} />
      </TableCell>
      <TableCell className="text-muted-foreground">{supplierName(item.assignedSupplierId)}</TableCell>
      <TableCell className="text-muted-foreground">
        <WaitingReasonCell item={item} updateField={updateField} disabled={!canEditFields} />
      </TableCell>
      <TableCell>{timelineLink(item)}</TableCell>
      {canEdit && <TableCell>{actionButtons(item)}</TableCell>}
    </TableRow>
  );
}

/** The mobile-card equivalent of `SortableQueueTableRow` — same drag wiring, `DepartmentsTab`'s existing card layout plus a leading drag handle. */
function SortableQueueCard({
  item,
  employees,
  supplierName,
  updateField,
  canEditFields,
  timelineLink,
  canEdit,
  actionButtons,
}: {
  item: WorkflowQueueItem;
  employees: User[];
  supplierName: (id: string | null) => string;
  updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>;
  canEditFields: boolean;
  timelineLink: (item: WorkflowQueueItem) => ReactNode;
  canEdit: boolean;
  actionButtons: (item: WorkflowQueueItem) => ReactNode;
}) {
  const { setNodeRef, style, attributes, listeners } = useQueueSortableItem(item.id);
  return (
    <Card ref={setNodeRef} style={style} className={cn('gap-2 p-3', rowToneClassName(item.isDelayed, item.priority))}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <DragHandle attributes={attributes} listeners={listeners} />
          <div className="min-w-0">
            <p className="truncate font-medium">{item.itemNames.join('، ') || '—'}</p>
            <p className="text-muted-foreground truncate text-xs">{item.customerName ?? '—'}</p>
            <p className="text-muted-foreground truncate text-xs">
              {item.workOrderNumber ?? '—'} · {item.stageName}
            </p>
          </div>
        </div>
        {item.isDelayed ? <StatusBadge tone="danger">متأخرة</StatusBadge> : <StatusBadge tone="success">في الموعد</StatusBadge>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
          {STAGE_STATUS_LABELS[item.status]}
        </StatusBadge>
        <PriorityCell item={item} updateField={updateField} disabled={!canEditFields} />
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>الاستحقاق: <DueDateCell item={item} updateField={updateField} disabled={!canEditFields} /></span>
        <span>منذ {formatTimeInStage(item.startedAt, item.createdAt)}</span>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <AssigneeCell item={item} employees={employees} updateField={updateField} disabled={!canEditFields} />
        <WaitingReasonCell item={item} updateField={updateField} disabled={!canEditFields} />
      </div>
      {item.assignedSupplierId && (
        <p className="text-muted-foreground text-xs">المورد: {supplierName(item.assignedSupplierId)}</p>
      )}
      {timelineLink(item)}
      {canEdit && actionButtons(item)}
    </Card>
  );
}

function DepartmentsTab({ initialTrackTab }: { initialTrackTab?: TrackTabKey }) {
  const { can } = useAuth();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [trackTab, setTrackTab] = useState<TrackTabKey>(initialTrackTab ?? 'DESIGN');
  const [employees, setEmployees] = useState<User[]>([]);
  // Owner (2026-09-08, "عايز يظهرلي مين المورد بتاع الصنف في قسم مورد
  // خارجي") — fetched once alongside `employees`, reused both for the
  // "المورد" column and (see `printPickupList`) the pickup-sheet print.
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [queue, setQueue] = useState<WorkflowQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [priorityFilter, setPriorityFilter] = useState<WorkflowPriority | 'ALL'>('ALL');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [search, setSearch] = useState('');
  // Owner (2026-09-07, "عايز كل الطلبات في مكان واحد وفي فلتر... افلتر
  // براحتي") — only meaningful in the "الكل" tab (a per-track tab already
  // narrows the fetch itself); slices the one combined queue further,
  // client-side, exactly like priority/delayed-only above.
  const [unifiedTrackFilter, setUnifiedTrackFilter] = useState<TrackTabKey | 'ALL'>('ALL');
  // Owner (2026-09-08, "عايز اقدر اطبعها علشان لو حد رايح يجيب الطلبات
  // ياخد الورقه دي معاه... يطبع فيها اسم الصنف وإسم المورد وعنوانه") — a
  // pickup sheet for the "مورّد خارجي" tab specifically: resolved once,
  // on demand (not on every load), then printed via a print-only block —
  // see `printPickupList`/`pickupPrintRows` below.
  const [pickupPrintRows, setPickupPrintRows] = useState<
    { itemName: string; supplierName: string; supplierAddress: string }[] | null
  >(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

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
          setTrackTab(
            linkedDept.code === 'DESIGN'
              ? 'DESIGN'
              : linkedDept.code === 'EXTERNAL_SUPPLIER'
                ? 'EXTERNAL_SUPPLIER'
                : (linkedDept.productionTrack ?? 'DESIGN'),
          );
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الأقسام'));
    apiGet<User[]>('/api/users').then(setEmployees).catch(() => undefined);
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => undefined);
  }, []);

  const designDepartmentId = departments?.find((d) => d.code === 'DESIGN')?.id;
  const externalSupplierDepartmentId = departments?.find((d) => d.code === 'EXTERNAL_SUPPLIER')?.id;

  const loadQueue = useCallback(() => {
    const specialDepartmentId =
      trackTab === 'DESIGN' ? designDepartmentId : trackTab === 'EXTERNAL_SUPPLIER' ? externalSupplierDepartmentId : undefined;
    const query =
      trackTab === 'ALL'
        ? 'all=true'
        : trackTab === 'DESIGN' || trackTab === 'EXTERNAL_SUPPLIER'
          ? specialDepartmentId
            ? `departmentId=${specialDepartmentId}`
            : null
          : `productionTrack=${trackTab}`;
    if (!query) return;
    apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?${query}`)
      .then((items) => {
        setQueue(items);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الانتظار'));
  }, [trackTab, designDepartmentId, externalSupplierDepartmentId]);

  useEffect(loadQueue, [loadQueue]);

  const filteredQueue = useMemo(() => {
    if (!queue) return null;
    const q = search.trim().toLowerCase();
    return queue.filter((item) => {
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
      if (delayedOnly && !item.isDelayed) return false;
      if (trackTab === 'ALL' && unifiedTrackFilter !== 'ALL') {
        // Owner (2026-09-07, "افلتر براحتي") — 🐛 the fallback here used to
        // be `?? 'DESIGN'`, meant only for the real التصميم department
        // (which legitimately has no `productionTrack`) — but plenty of
        // OTHER departments are just as legitimately untagged (خدمة
        // العملاء, مورّد خارجي, التشطيب — shared across every track, per
        // `Department.productionTrack`'s own schema comment), and that
        // same fallback silently bucketed every one of them into "التصميم"
        // too, so picking any track — even "التصميم" itself — matched
        // everything and filtered nothing. An untagged non-Design
        // department now simply matches no specific track filter (still
        // visible under "كل الأقسام/المسارات" — only ALL, unfiltered,
        // shows it).
        const itemTrackKey: TrackTabKey | null =
          item.departmentId === designDepartmentId
            ? 'DESIGN'
            : item.departmentId === externalSupplierDepartmentId
              ? 'EXTERNAL_SUPPLIER'
              : item.productionTrack;
        if (itemTrackKey !== unifiedTrackFilter) return false;
      }
      if (q) {
        const matchesOrder = item.workOrderNumber?.toLowerCase().includes(q) ?? false;
        const matchesCustomer = item.customerName?.toLowerCase().includes(q) ?? false;
        // Owner (2026-09-07, "لازم اشوف إسم الصنف مش رقم الفاتورة علشان
        // اعرف هي ايه من برة") — search should find a job by what it
        // actually is, not just its number/customer.
        const matchesItem = item.itemNames.some((name) => name.toLowerCase().includes(q));
        if (!matchesOrder && !matchesCustomer && !matchesItem) return false;
      }
      return true;
    });
  }, [queue, priorityFilter, delayedOnly, search, trackTab, unifiedTrackFilter, designDepartmentId, externalSupplierDepartmentId]);

  const { actionError, reorderError, actionButtons, dialogs, persistStageOrder, updateField } = useQueueActions(loadQueue);

  if (error) return <div className="text-destructive">{error}</div>;

  const canEdit = can('work-orders.edit');
  // Owner (2026-09-08, "عايز يظهرلي مين المورد بتاع الصنف في قسم مورد
  // خارجي") — `assignedSupplierId` resolved to a display name.
  const supplierName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : '—');

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

  // Owner (2026-09-08, "يطبع فيها اسم الصنف وإسم المورد وعنوانه علشان
  // يقدر يوصله") — resolves the supplier + its default address for every
  // item currently visible on the "مورّد خارجي" tab, on demand (not on
  // every load — a supplier's address rarely changes mid-session), then
  // prints via the `pickupPrintRows` print-only block below.
  const printPickupList = async () => {
    if (!filteredQueue) return;
    setPrintError(null);
    setPrinting(true);
    try {
      const supplierIds = [...new Set(filteredQueue.map((i) => i.assignedSupplierId).filter((id): id is string => Boolean(id)))];
      const addressLists = await Promise.all(
        supplierIds.map((id) => apiGet<PartnerAddress[]>(`/api/partners/${id}/addresses`).catch(() => [])),
      );
      const partnerNameById = new Map(partners.map((p) => [p.id, p.nameAr]));
      const addressBySupplierId = new Map(
        supplierIds.map((id, index) => {
          const addresses = addressLists[index] ?? [];
          const address = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
          return [id, address];
        }),
      );
      const rows = filteredQueue.map((item) => ({
        itemName: item.itemNames.join('، ') || '—',
        supplierName: item.assignedSupplierId ? (partnerNameById.get(item.assignedSupplierId) ?? '—') : '—',
        supplierAddress: item.assignedSupplierId ? formatPartnerAddress(addressBySupplierId.get(item.assignedSupplierId) ?? null) : '—',
      }));
      setPickupPrintRows(rows);
      // The print-only block only exists in the DOM once `pickupPrintRows`
      // is set — wait a tick for that render before invoking the browser's
      // print dialog, or `window.print()` would fire against a still-empty
      // block.
      requestAnimationFrame(() => window.print());
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'تعذر تجهيز قائمة الطباعة');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
    <div className="space-y-4 print:hidden">
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
          {/* Owner (2026-09-08, "عايز اقدر اطبعها علشان لو حد رايح يجيب
              الطلبات ياخد الورقه دي معاه") — only meaningful on the
              "مورّد خارجي" tab. */}
          {trackTab === 'EXTERNAL_SUPPLIER' && (
            <Button type="button" variant="secondary" disabled={printing} onClick={() => void printPickupList()}>
              {printing ? 'جارٍ التجهيز…' : 'طباعة قائمة الاستلام'}
            </Button>
          )}
        </div>
      </div>

      {printError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {printError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الصنف أو رقم الأمر أو اسم العميل…"
          className="border-input bg-background min-w-[180px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        {/* Owner (2026-09-07, "عايز... فلتر علشان لو حبيت اشوف الشغل
            الاوفست لوحده او الديجيتال او المنتجات الجاهزة... افلتر
            براحتي") — only shown in "الكل" (a per-track tab already IS
            the filter). */}
        {trackTab === 'ALL' && (
          <select
            value={unifiedTrackFilter}
            onChange={(e) => setUnifiedTrackFilter(e.target.value as TrackTabKey | 'ALL')}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          >
            <option value="ALL">كل الأقسام/المسارات</option>
            {SUMMARY_TRACK_ORDER.map((key) => (
              <option key={key} value={key}>
                {TRACK_TAB_LABELS[key]}
              </option>
            ))}
          </select>
        )}
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

      {reorderError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {reorderError}
        </div>
      )}

      {!filteredQueue ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <>
          {/* Desktop/tablet: table. Mobile: cards (Requirement 12 — a real layout, not horizontal scroll). */}
          <div className="border-border bg-card hidden rounded-2xl border sm:block">
            {/* 🐛 dnd-kit's `DndContext` renders a hidden accessibility
                `<div>` alongside its children — nesting `QueueDndContext`
                directly inside `<TableBody>` put that `<div>` where only
                `<tr>` is valid HTML (React warned: "In HTML, <div> cannot
                be a child of <tbody>"). Wrapping the whole `<Table>`
                instead keeps that hidden node a sibling of `<Table>` under
                this plain `<div>` — valid either way — while
                `SortableContext` (zero DOM of its own) still only needs to
                reach the actual sortable rows inside `<TableBody>`. */}
            <QueueDndContext items={filteredQueue} onReorder={(newOrder, movedId) => void persistStageOrder(newOrder, movedId)}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Owner (2026-09-08, "عايز اقدر احرك الصفوف بأريحية
                        شبه صفوف نوشن") — drag-handle column, empty header
                        label. */}
                    <TableHead className="w-8" />
                    <TableHead>الصنف</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>أمر التشغيل</TableHead>
                    <TableHead>المرحلة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead>التأخير</TableHead>
                    <TableHead>تاريخ الاستحقاق</TableHead>
                    <TableHead>منذ</TableHead>
                    <TableHead>الموظف المسؤول</TableHead>
                    {/* Owner (2026-09-08, "عايز يظهرلي مين المورد بتاع
                        الصنف في قسم مورد خارجي") — "—" for tracks that
                        never assign a supplier, so shown unconditionally
                        rather than a per-tab column count to keep. */}
                    <TableHead>المورد</TableHead>
                    <TableHead>سبب الانتظار</TableHead>
                    <TableHead>المسار</TableHead>
                    {canEdit && <TableHead>الإجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((item) => (
                    <SortableQueueTableRow
                      key={item.id}
                      item={item}
                      employees={employees}
                      supplierName={supplierName}
                      updateField={updateField}
                      canEditFields={canEdit}
                      timelineLink={timelineLink}
                      canEdit={canEdit}
                      actionButtons={actionButtons}
                    />
                  ))}
                  {filteredQueue.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 15 : 14} className="text-muted-foreground text-center">
                        {queue && queue.length > 0
                          ? 'لا توجد مهام مطابقة لعوامل التصفية الحالية.'
                          : 'لا توجد مهام في قائمة الانتظار لهذا القسم.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </QueueDndContext>
          </div>

          <div className="grid gap-2 sm:hidden">
            {filteredQueue.length === 0 && (
              <div className="border-border bg-card text-muted-foreground rounded-2xl border p-4 text-center text-sm">
                {queue && queue.length > 0
                  ? 'لا توجد مهام مطابقة لعوامل التصفية الحالية.'
                  : 'لا توجد مهام في قائمة الانتظار لهذا القسم.'}
              </div>
            )}
            {filteredQueue.length > 0 && (
              <QueueDndContext items={filteredQueue} onReorder={(newOrder, movedId) => void persistStageOrder(newOrder, movedId)}>
                {filteredQueue.map((item) => (
                  <SortableQueueCard
                    key={item.id}
                    item={item}
                    employees={employees}
                    supplierName={supplierName}
                    updateField={updateField}
                    canEditFields={canEdit}
                    timelineLink={timelineLink}
                    canEdit={canEdit}
                    actionButtons={actionButtons}
                  />
                ))}
              </QueueDndContext>
            )}
          </div>
        </>
      )}

      {dialogs}
    </div>
    {/* Owner (2026-09-08, "عايز اقدر اطبعها... يطبع فيها اسم الصنف وإسم
        المورد وعنوانه") — `hidden print:block`, the exact mirror of the
        normal UI's `print:hidden` above: only this shows when the browser
        print dialog actually renders the page. */}
    {pickupPrintRows && (
      <div className="hidden p-8 print:block">
        <h1 className="mb-4 text-xl font-bold">قائمة استلام من الموردين</h1>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black text-start">
              <th className="p-2 text-start">الصنف</th>
              <th className="p-2 text-start">المورد</th>
              <th className="p-2 text-start">العنوان</th>
            </tr>
          </thead>
          <tbody>
            {pickupPrintRows.map((row, index) => (
              <tr key={index} className="border-b border-black/20">
                <td className="p-2">{row.itemName}</td>
                <td className="p-2">{row.supplierName}</td>
                <td className="p-2">{row.supplierAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    </>
  );
}

/** One draggable Kanban card — a column is already scoped to a single stage, so drag reordering here is always within one stage by construction. */
function SortableKanbanCard({
  item,
  employees,
  updateField,
  canEditFields,
  timelineLink,
  canEdit,
  actionButtons,
}: {
  item: WorkflowQueueItem;
  employees: User[];
  updateField: (item: WorkflowQueueItem, patch: Record<string, unknown>) => Promise<void>;
  canEditFields: boolean;
  timelineLink: (item: WorkflowQueueItem) => ReactNode;
  canEdit: boolean;
  actionButtons: (item: WorkflowQueueItem) => ReactNode;
}) {
  const { setNodeRef, style, attributes, listeners } = useQueueSortableItem(item.id);
  return (
    <Card ref={setNodeRef} style={style} className={cn('gap-2 p-3', rowToneClassName(item.isDelayed, item.priority))}>
      <div className="flex items-start gap-2">
        <DragHandle attributes={attributes} listeners={listeners} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.itemNames.join('، ') || '—'}</p>
          <p className="text-muted-foreground truncate text-xs">{item.customerName ?? '—'}</p>
          <p className="text-muted-foreground truncate text-xs">{item.workOrderNumber ?? '—'}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={item.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
          {STAGE_STATUS_LABELS[item.status]}
        </StatusBadge>
        <PriorityCell item={item} updateField={updateField} disabled={!canEditFields} />
        {item.isDelayed && <StatusBadge tone="danger">متأخرة</StatusBadge>}
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>الاستحقاق: <DueDateCell item={item} updateField={updateField} disabled={!canEditFields} /></span>
        <span>منذ {formatTimeInStage(item.startedAt, item.createdAt)}</span>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <AssigneeCell item={item} employees={employees} updateField={updateField} disabled={!canEditFields} />
        <WaitingReasonCell item={item} updateField={updateField} disabled={!canEditFields} />
      </div>
      {timelineLink(item)}
      {canEdit && actionButtons(item)}
    </Card>
  );
}

/**
 * Owner (2026-09-07, "عايز فيو مختلف يظهرلي فيه كل وورك فلو حسب اختياري
 * بيبانلي فيه كل الشغل اللي في الوورك فلو اللي اختارته واشوفه في مراحله
 * المختلفة") — a Kanban board for ONE chosen `WorkflowTemplate` version:
 * columns are that template's own ordered stages (its real structure, not
 * just whichever stages happen to have jobs right now — an empty stage
 * still shows as an empty column), cards are the same `WorkflowQueueItem`
 * rows `DepartmentsTab` already uses, grouped by `stageId`. Deliberately
 * scoped to exactly one template VERSION at a time, never "every version
 * of a code" — an instance's `templateId` is frozen at creation (Workflow
 * Versioning), so a stage from one version has nothing to do with a
 * same-named stage in another; the picker lists every published version
 * (not just the latest) since an older one can still have real jobs on it.
 */
function WorkflowKanbanTab() {
  const { can } = useAuth();
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [queue, setQueue] = useState<WorkflowQueueItem[] | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<WorkflowPriority | 'ALL'>('ALL');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiGet<WorkflowTemplate[]>('/api/workflow-instances/templates')
      .then((list) => {
        setTemplates(list);
        setTemplateId((current) => current || (list[0]?.id ?? ''));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الوركفلوهات'));
    apiGet<User[]>('/api/users').then(setEmployees).catch(() => undefined);
  }, []);

  const loadQueue = useCallback(() => {
    if (!templateId) return;
    apiGet<WorkflowQueueItem[]>(`/api/workflow-instances/queue?templateId=${templateId}`)
      .then((items) => {
        setQueue(items);
        setLastUpdated(new Date());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل شغل هذا الوركفلو'));
  }, [templateId]);

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
        const matchesItem = item.itemNames.some((name) => name.toLowerCase().includes(q));
        if (!matchesOrder && !matchesCustomer && !matchesItem) return false;
      }
      return true;
    });
  }, [queue, priorityFilter, delayedOnly, search]);

  const { actionError, reorderError, actionButtons, dialogs, persistStageOrder, updateField } = useQueueActions(loadQueue);

  const canEdit = can('work-orders.edit');

  const timelineLink = (item: WorkflowQueueItem) => (
    <Link
      to={`/production-board/timeline/${item.workflowInstanceId}?workOrderNumber=${encodeURIComponent(item.workOrderNumber ?? '')}&customerName=${encodeURIComponent(item.customerName ?? '')}`}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
    >
      <RouteIcon className="size-3.5" />
      المسار الكامل
    </Link>
  );

  if (error) return <div className="text-destructive">{error}</div>;
  if (!templates) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  if (templates.length === 0) {
    return <div className="text-muted-foreground">لا يوجد أي وركفلو منشور بعد.</div>;
  }

  // Templates sharing a `code` (an older + a newer published version, both
  // still capable of holding real running instances) get a version suffix
  // so the picker can tell them apart; a code with only one published
  // version stays plain.
  const codeCounts = new Map<string, number>();
  for (const t of templates) codeCounts.set(t.code, (codeCounts.get(t.code) ?? 0) + 1);
  const templateLabel = (t: WorkflowTemplate) => ((codeCounts.get(t.code) ?? 0) > 1 ? `${t.name} (v${t.version})` : t.name);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const byStage = new Map<string, WorkflowQueueItem[]>();
  for (const item of filteredQueue ?? []) {
    const list = byStage.get(item.stageId) ?? [];
    list.push(item);
    byStage.set(item.stageId, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="border-input bg-background min-w-[220px] rounded-md border px-3 py-2 text-sm font-medium"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {templateLabel(t)}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الصنف أو رقم الأمر أو اسم العميل…"
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
        <Button type="button" variant="secondary" size="icon" onClick={loadQueue} aria-label="تحديث">
          <RefreshCw className="size-4" />
        </Button>
        {lastUpdated && (
          <span className="text-muted-foreground text-xs">
            آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {actionError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {actionError}
        </div>
      )}
      {reorderError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          {reorderError}
        </div>
      )}

      {!filteredQueue || !selectedTemplate ? (
        <div className="text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {selectedTemplate.stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            return (
              <div
                key={stage.id}
                className="border-border bg-muted/20 flex w-72 shrink-0 flex-col gap-2 rounded-2xl border p-2"
              >
                <div className="flex items-center justify-between px-1 pt-1">
                  <h3 className="text-sm font-semibold">{stage.name}</h3>
                  <span className="text-muted-foreground text-xs">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && (
                    <div className="text-muted-foreground rounded-xl border border-dashed p-3 text-center text-xs">
                      لا يوجد شغل في هذه المرحلة
                    </div>
                  )}
                  {items.length > 0 && (
                    <QueueDndContext items={items} onReorder={(newOrder, movedId) => void persistStageOrder(newOrder, movedId)}>
                      {items.map((item) => (
                        <SortableKanbanCard
                          key={item.id}
                          item={item}
                          employees={employees}
                          updateField={updateField}
                          canEditFields={canEdit}
                          timelineLink={timelineLink}
                          canEdit={canEdit}
                          actionButtons={actionButtons}
                        />
                      ))}
                    </QueueDndContext>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogs}
    </div>
  );
}
