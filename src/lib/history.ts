/** Small undo/redo stack over immutable snapshots. */

export type History<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

const HISTORY_LIMIT = 50;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Pushes `next` as the new present. Reference equality is used on purpose:
 * callers always build a new object when something actually changed.
 */
export function commitHistory<T>(history: History<T>, next: T): History<T> {
  if (Object.is(history.present, next)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
  };
}

export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
