import type { CSSProperties, ReactNode } from 'react';
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
