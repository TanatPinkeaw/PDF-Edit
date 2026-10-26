export type Identified = { id: string };

/**
 * Moves the dragged row — or the whole selected block when the dragged row is
 * selected — to the slot of `overId`. The block keeps its internal order.
 */
export function moveBlock<T extends Identified>(
  items: readonly T[],
  activeId: string,
  overId: string,
  selectedIds: Iterable<string> = [],
): T[] {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex === -1 || overIndex === -1 || activeId === overId) return [...items];

  const selected = new Set(selectedIds);
  const movingIds = selected.has(activeId) ? selected : new Set([activeId]);
  if (movingIds.has(overId)) return [...items];

  const moving = items.filter((item) => movingIds.has(item.id));
  if (moving.length === 0) return [...items];

  const rest = items.filter((item) => !movingIds.has(item.id));
  const restOverIndex = rest.findIndex((item) => item.id === overId);
  if (restOverIndex === -1) return [...items];

  // Dragging down drops the block after the target; dragging up drops it before.
  const insertAt = activeIndex < overIndex ? restOverIndex + 1 : restOverIndex;
  rest.splice(insertAt, 0, ...moving);
  return rest;
}
