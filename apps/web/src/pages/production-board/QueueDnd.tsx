import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Owner (2026-09-08, "عايز اقدر احرك الصفوف بأريحية شبه صفوف نوشن") —
 * free drag-and-drop reordering (grab a handle, drop anywhere), replacing
 * the up/down step buttons `moveInStageQueue` used to render. One
 * `QueueDndContext` per rendered list (the desktop table body, the mobile
 * card list, and each Kanban column all get their own — never shared,
 * since dnd-kit tracks draggable ids per context and the same
 * `WorkflowQueueItem.id` is never mounted twice inside one context at
 * once). `onReorder` receives the full list in its NEW order — the caller
 * decides what "new order" means for its own scope (see
 * `useQueueActions.persistStageOrder`'s own doc comment for why a Kanban
 * column can persist that order directly while a mixed-stage list like
 * "الكل" has to project it down to same-stage siblings first).
 */
export function QueueDndContext<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (newOrder: T[], movedId: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = items.slice();
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved!);
    onReorder(reordered, String(active.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Per-row/card drag wiring — `setNodeRef`/`style` go on the item's own outer element, `attributes`/`listeners` go ONLY on the small `DragHandle` so the rest of the row (checkbox, buttons, links) keeps working normally. */
export function useQueueSortableItem(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? 'relative' : undefined,
  };
  return { setNodeRef, style, attributes, listeners };
}

export function DragHandle({
  attributes,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      title="اسحب لتغيير الترتيب"
      className="text-muted-foreground hover:text-foreground flex cursor-grab touch-none items-center active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/**
 * Owner (2026-09-08, "عايز اقدر اتحكم في مكان العمود يعني احركه اصغر
 * مساحته شوية وهكذا... زي نوشن") — the column-reorder counterpart to
 * `QueueDndContext` above: a HORIZONTAL sortable strip of column ids
 * (table header cells, or Kanban stage columns), nested inside its own
 * `DndContext` — deliberately separate from the row-level one (rows sort
 * vertically by `WorkflowQueueItem.id`, columns sort horizontally by a
 * plain string id; two independent `DndContext`s, each tracking its own
 * disjoint id set, is the same pattern dnd-kit's own multi-container Kanban
 * examples use — nesting one inside the other, when the row-context wraps
 * the whole `<Table>`/board, works cleanly since neither ever registers
 * the other's ids).
 */
export function ColumnDndContext({
  order,
  onReorder,
  children,
}: {
  order: string[];
  onReorder: (newOrder: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = order.slice();
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved!);
    onReorder(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Owner (2026-09-08, same request) — a thin drag handle on a column's
 * trailing edge (`insetInlineEnd`, so it sits correctly in this app's RTL
 * layout without a manual sign-flip) that reports raw pointer-movement
 * deltas in screen pixels; the caller decides what "wider"/"narrower"
 * means for its own layout via `useColumnLayout.resizeColumn`. Plain
 * pointer events, not dnd-kit — resizing isn't a sortable-list concern.
 *
 * Sits fully INSIDE the header cell (`insetInlineEnd: 0`), not straddling
 * its edge — the header has `overflow: hidden` (the `truncate` class, so a
 * long label doesn't spill into the next column), which silently clips
 * and makes unclickable any part of an overlapping handle that pokes
 * outside the cell's own box. A handle centered ON the boundary is only
 * half-grabbable in practice; keeping it inside avoids that entirely.
 */
export function ColumnResizeHandle({ onResize }: { onResize: (deltaPx: number) => void }) {
  const lastXRef = useRef(0);

  const handlePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    lastXRef.current = e.clientX;
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - lastXRef.current;
      lastXRef.current = moveEvent.clientX;
      onResize(delta);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      title="اسحب لتغيير العرض"
      className="hover:bg-primary/40 absolute inset-y-0 w-2 cursor-col-resize touch-none select-none"
      style={{ insetInlineEnd: 0 }}
    />
  );
}
