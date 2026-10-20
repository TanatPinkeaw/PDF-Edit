import { describe, expect, it } from 'vitest';

import {
  currentDoc,
  initialSession,
  isDocModified,
  selectedPageNumbers,
  sessionReducer,
  type SessionState,
} from '../src/lib/session';

const open = (pageCount = 5): SessionState =>
  sessionReducer(initialSession, { type: 'loaded', fileName: 'report.pdf', pageCount });

const order = (state: SessionState): number[] =>
  currentDoc(state)?.entries.map((entry) => entry.srcIndex) ?? [];

const run = (state: SessionState, ...actions: Parameters<typeof sessionReducer>[1][]) =>
  actions.reduce(sessionReducer, state);

describe('loading', () => {
  it('creates one entry per page in original order', () => {
    const state = open(4);
    expect(order(state)).toEqual([0, 1, 2, 3]);
    expect(state.selection).toEqual([]);
    expect(isDocModified(currentDoc(state)!)).toBe(false);
  });

  it('rejects an empty document', () => {
    expect(() => open(0)).toThrow();
  });
});

describe('selection', () => {
  it('selects a single page and toggles it off again', () => {
    const state = run(open(), { type: 'toggle', id: 'page-2', mode: 'single' });
    expect(state.selection).toEqual(['page-2']);

    const cleared = sessionReducer(state, { type: 'toggle', id: 'page-2', mode: 'single' });
    expect(cleared.selection).toEqual([]);
  });

  it('adds to the selection in add mode', () => {
    const state = run(
      open(),
      { type: 'toggle', id: 'page-0', mode: 'add' },
      { type: 'toggle', id: 'page-2', mode: 'add' },
    );
    expect(state.selection).toEqual(['page-0', 'page-2']);
  });

  it('selects a range from the anchor', () => {
    const state = run(
      open(),
      { type: 'toggle', id: 'page-1', mode: 'single' },
      { type: 'toggle', id: 'page-3', mode: 'range' },
    );
    expect(state.selection).toEqual(['page-1', 'page-2', 'page-3']);
  });

  it('inverts and clears the selection', () => {
    const inverted = run(open(3), { type: 'selectAll' }, { type: 'invertSelection' });
    expect(inverted.selection).toEqual([]);

    const partial = run(
      open(3),
      { type: 'toggle', id: 'page-1', mode: 'single' },
      { type: 'invertSelection' },
    );
    expect(partial.selection).toEqual(['page-0', 'page-2']);
  });

  it('reports selected page numbers in display order', () => {
    const state = run(
      open(4),
      { type: 'toggle', id: 'page-3', mode: 'single' },
      { type: 'toggle', id: 'page-1', mode: 'add' },
    );
    expect(selectedPageNumbers(state)).toEqual([2, 4]);
  });
});

describe('delete', () => {
  it('removes selected pages and can undo them', () => {
    const deleted = run(
      open(),
      { type: 'toggle', id: 'page-1', mode: 'single' },
      { type: 'toggle', id: 'page-3', mode: 'add' },
      { type: 'deleteSelected' },
    );

    expect(order(deleted)).toEqual([0, 2, 4]);
    expect(deleted.selection).toEqual([]);
    expect(isDocModified(currentDoc(deleted)!)).toBe(true);

    const restored = sessionReducer(deleted, { type: 'undo' });
    expect(order(restored)).toEqual([0, 1, 2, 3, 4]);
  });

  it('refuses to delete every page', () => {
    const state = run(open(3), { type: 'selectAll' }, { type: 'deleteSelected' });
    expect(order(state)).toEqual([0, 1, 2]);
  });

  it('keeps still-valid selections when undoing a delete', () => {
    const state = run(
      open(3),
      { type: 'toggle', id: 'page-1', mode: 'single' },
      { type: 'deleteSelected' },
      { type: 'toggle', id: 'page-0', mode: 'single' },
      { type: 'undo' },
    );
    expect(order(state)).toEqual([0, 1, 2]);
    expect(state.selection).toEqual(['page-0']);
  });
});

describe('reorder', () => {
  it('moves an entry to another position', () => {
    const state = sessionReducer(open(), { type: 'move', from: 0, to: 3 });
    expect(order(state)).toEqual([1, 2, 3, 0, 4]);
  });

  it('ignores out-of-range moves', () => {
    const state = sessionReducer(open(), { type: 'move', from: 0, to: 99 });
    expect(order(state)).toEqual([0, 1, 2, 3, 4]);
  });

  it('nudges a single page without knowing its index', () => {
    const state = run(
      open(4),
      { type: 'nudge', id: 'page-3', delta: -1 },
      { type: 'nudge', id: 'page-3', delta: -1 },
    );
    expect(order(state)).toEqual([0, 3, 1, 2]);
  });

  it('clamps nudges at the edges', () => {
    const state = run(open(3), { type: 'nudge', id: 'page-0', delta: -1 });
    expect(order(state)).toEqual([0, 1, 2]);
  });

  it('restores the original order', () => {
    const moved = sessionReducer(open(), { type: 'move', from: 4, to: 0 });
    const reset = sessionReducer(moved, { type: 'resetOrder' });
    expect(order(reset)).toEqual([0, 1, 2, 3, 4]);
    expect(isDocModified(currentDoc(reset)!)).toBe(false);
  });

  it('undoes and redoes a move', () => {
    const moved = sessionReducer(open(), { type: 'move', from: 0, to: 2 });
    const undone = sessionReducer(moved, { type: 'undo' });
    const redone = sessionReducer(undone, { type: 'redo' });
    expect(order(undone)).toEqual([0, 1, 2, 3, 4]);
    expect(order(redone)).toEqual([1, 2, 0, 3, 4]);
  });
});
