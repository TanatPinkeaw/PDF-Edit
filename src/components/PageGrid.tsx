import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

import type { Thumbnails } from '../hooks/useThumbnails';
import type { PageEntry, ToggleMode } from '../lib/session';
import { PageCard } from './PageCard';

type Props = {
  entries: readonly PageEntry[];
  selection: readonly string[];
  disabled: boolean;
  thumbnails: Thumbnails;
  rotations?: ReadonlyMap<number, number>;
  canReorder?: boolean;
  onMove: (from: number, to: number) => void;
  onToggle: (id: string, mode: ToggleMode) => void;
  onDelete: (id: string) => void;
  onNudge: (id: string, delta: number) => void;
};

export function PageGrid({
  entries,
  selection,
  disabled,
  thumbnails,
  rotations,
  canReorder = true,
  onMove,
  onToggle,
  onDelete,
  onNudge,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = entries.map((entry) => entry.id);
  const selected = new Set(selection);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onMove(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul className="page-grid" aria-label="รายการหน้า">
          {entries.map((entry, index) => (
            <PageCard
              key={entry.id}
              entry={entry}
              position={index + 1}
              total={entries.length}
              selected={selected.has(entry.id)}
              disabled={disabled}
              rotation={rotations?.get(entry.srcIndex) ?? 0}
              canReorder={canReorder}
              thumbnails={thumbnails}
              onToggle={onToggle}
              onDelete={onDelete}
              onNudge={onNudge}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
