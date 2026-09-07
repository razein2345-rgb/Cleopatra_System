import { useState } from 'react';
import { Ban, Pencil, SkipForward } from 'lucide-react';
import type { WorkflowQueueItem } from '@cleopatra/shared';
import { apiPut } from '@/lib/api';
import { EditQueueItemDialog } from './EditQueueItemDialog';
import { ConfirmStageActionDialog } from './ConfirmStageActionDialog';

/**
 * Shared "act on a queue row" wiring — complete/reorder/skip/fail/edit —
 * factored out of `DepartmentsTab` (FEATURE-010) so the Kanban-by-workflow
 * view (owner, 2026-09-07, "فيو مختلف... كل وورك فلو حسب اختياري") can
 * offer the exact same actions on the exact same `WorkflowQueueItem` rows
 * without re-implementing them — same `PUT .../advance` and
 * `PUT .../current-stage` calls, same confirmation dialogs (rule 5 — no
 * Duplicate Logic).
 */
export function useQueueActions(reload: () => void) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WorkflowQueueItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: WorkflowQueueItem; action: 'FAIL' | 'SKIP' } | null>(
    null,
  );

  const advance = async (item: WorkflowQueueItem, action: 'COMPLETE' | 'FAIL' | 'SKIP') => {
    setActionError(null);
    try {
      await apiPut(`/api/workflow-instances/${item.workflowInstanceId}/advance`, {
        action,
        variableValues: item.variableValues ?? undefined,
      });
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    }
  };

  /**
   * Owner (2026-09-08, "عايز اقدر احرك الصفوف بأريحية شبه صفوف نوشن") —
   * persists a drag-and-drop reorder. `newFullOrder` is the ENTIRE visible
   * list in its new order (drag geometry is computed against everything
   * on screen, since other-stage rows can be interleaved — e.g. the "الكل"
   * unified view); `movedId` says which row was actually dragged. Reorder
   * still only ever means something WITHIN one stage (confirmed explicit:
   * per-stage, never global — see `StageInstance.manualSortOrder`'s own
   * schema comment), so this projects `newFullOrder` down to just the
   * dragged item's own `stageId` siblings — preserving their new relative
   * order — and renumbers all of them sequentially (0, 1, 2, ...). A full
   * renumber (not just swapping two neighbors) is what makes "drop
   * anywhere" work correctly instead of only "one step up/down".
   */
  const persistStageOrder = async (newFullOrder: WorkflowQueueItem[], movedId: string) => {
    const movedItem = newFullOrder.find((i) => i.id === movedId);
    if (!movedItem) return;
    const siblings = newFullOrder.filter((i) => i.stageId === movedItem.stageId);

    setReorderError(null);
    try {
      await Promise.all(
        siblings.map((sibling, index) =>
          sibling.manualSortOrder === index
            ? Promise.resolve()
            : apiPut(`/api/workflow-instances/${sibling.workflowInstanceId}/current-stage`, {
                manualSortOrder: index,
              }),
        ),
      );
      reload();
    } catch (err) {
      setReorderError(err instanceof Error ? err.message : 'تعذر تغيير الترتيب');
    }
  };

  // FEATURE-010 (2026-08-14, owner: "في الورك فلو متقسم ويدجيتز بتنتقل
  // دايركت لما ادوس على الـchek box اللي جمب الطلب إلى المرحلة اللي بعدها")
  // — a single checkbox replaces the "إنهاء" button: ticking it immediately
  // completes the current stage. تخطي/فشل/تعديل stay available as small
  // secondary icons next to it — less common actions, not gone.
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

  const dialogs = (
    <>
      {editingItem && (
        <EditQueueItemDialog
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            reload();
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
    </>
  );

  return { actionError, reorderError, actionButtons, dialogs, persistStageOrder };
}
