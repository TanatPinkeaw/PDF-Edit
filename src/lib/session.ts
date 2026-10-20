/**
 * Pure state for one opened PDF: the current page order, the selection and the
 * undo/redo stack. File bytes live outside this module so the state stays
 * cheap to snapshot and easy to test.
 */

import {
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  type History,
} from './history';

export type PageEntry = {
  /** Stable id for React keys and drag & drop. */
  id: string;
  /** 0-based index of the page in the uploaded file. */
  srcIndex: number;
};

export type DocState = {
  fileName: string;
  pageCount: number;
  entries: PageEntry[];
};

export type SessionState = {
  history: History<DocState | null>;
  selection: readonly string[];
  anchor: string | null;
};

export type ToggleMode = 'single' | 'add' | 'range';

export type SessionAction =
  | { type: 'loaded'; fileName: string; pageCount: number }
  | { type: 'closed' }
  | { type: 'toggle'; id: string; mode: ToggleMode }
  | { type: 'selectAll' }
  | { type: 'selectNone' }
  | { type: 'invertSelection' }
  | { type: 'deleteSelected' }
  | { type: 'move'; from: number; to: number }
  | { type: 'nudge'; id: string; delta: number }
  | { type: 'resetOrder' }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialSession: SessionState = {
  history: createHistory<DocState | null>(null),
  selection: [],
  anchor: null,
};

export function createDoc(fileName: string, pageCount: number): DocState {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error(`pageCount ต้องเป็นจำนวนเต็มมากกว่า 0 (ได้ ${pageCount})`);
  }
  return {
    fileName,
    pageCount,
    entries: Array.from({ length: pageCount }, (_, srcIndex) => ({
      id: `page-${srcIndex}`,
      srcIndex,
    })),
  };
}

export function currentDoc(state: SessionState): DocState | null {
  return state.history.present;
}

export function selectedEntries(state: SessionState): PageEntry[] {
  const doc = currentDoc(state);
  if (!doc) return [];
  const selected = new Set(state.selection);
  return doc.entries.filter((entry) => selected.has(entry.id));
}

export function selectedPageNumbers(state: SessionState): number[] {
  const doc = currentDoc(state);
  if (!doc) return [];
  const selected = new Set(state.selection);
  return doc.entries.flatMap((entry, index) => (selected.has(entry.id) ? [index + 1] : []));
}

/** True when the page order or page count differs from the uploaded file. */
export function isDocModified(doc: DocState): boolean {
  return (
    doc.entries.length !== doc.pageCount ||
    doc.entries.some((entry, index) => entry.srcIndex !== index)
  );
}

export function moveEntry<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];
  next.splice(to, 0, moved);
  return next;
}

function pruneSelection(
  selection: readonly string[],
  anchor: string | null,
  entries: readonly PageEntry[],
): { selection: readonly string[]; anchor: string | null } {
  const ids = new Set(entries.map((entry) => entry.id));
  const nextSelection = selection.filter((id) => ids.has(id));
  return {
    selection: nextSelection,
    anchor: anchor !== null && ids.has(anchor) ? anchor : (nextSelection[0] ?? null),
  };
}

function withDoc(state: SessionState, doc: DocState | null): SessionState {
  const pruned = pruneSelection(
    state.selection,
    state.anchor,
    doc?.entries ?? [],
  );
  return {
    history: commitHistory(state.history, doc),
    selection: pruned.selection,
    anchor: pruned.anchor,
  };
}

function withHistory(state: SessionState, history: History<DocState | null>): SessionState {
  const pruned = pruneSelection(state.selection, state.anchor, history.present?.entries ?? []);
  return { history, selection: pruned.selection, anchor: pruned.anchor };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const doc = currentDoc(state);

  switch (action.type) {
    case 'loaded': {
      const nextDoc = createDoc(action.fileName, action.pageCount);
      return {
        history: createHistory<DocState | null>(nextDoc),
        selection: [],
        anchor: null,
      };
    }

    case 'closed': {
      return {
        history: createHistory<DocState | null>(null),
        selection: [],
        anchor: null,
      };
    }

    case 'toggle': {
      if (!doc) return state;
      const selected = new Set(state.selection);

      if (action.mode === 'range' && state.anchor) {
        const anchorIndex = doc.entries.findIndex((entry) => entry.id === state.anchor);
        const targetIndex = doc.entries.findIndex((entry) => entry.id === action.id);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [from, to] =
            anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          return {
            ...state,
            selection: doc.entries.slice(from, to + 1).map((entry) => entry.id),
            anchor: state.anchor,
          };
        }
      }

      if (action.mode === 'add') {
        if (selected.has(action.id)) selected.delete(action.id);
        else selected.add(action.id);
        return { ...state, selection: [...selected], anchor: action.id };
      }

      const isOnlySelection = selected.size === 1 && selected.has(action.id);
      return {
        ...state,
        selection: isOnlySelection ? [] : [action.id],
        anchor: isOnlySelection ? null : action.id,
      };
    }

    case 'selectAll': {
      if (!doc) return state;
      return { ...state, selection: doc.entries.map((entry) => entry.id) };
    }

    case 'selectNone': {
      return { ...state, selection: [], anchor: null };
    }

    case 'invertSelection': {
      if (!doc) return state;
      const selected = new Set(state.selection);
      return {
        ...state,
        selection: doc.entries.filter((entry) => !selected.has(entry.id)).map((entry) => entry.id),
      };
    }

    case 'deleteSelected': {
      if (!doc || state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const entries = doc.entries.filter((entry) => !selected.has(entry.id));
      if (entries.length === 0) return state;
      return withDoc(state, { ...doc, entries });
    }

    case 'move': {
      if (!doc) return state;
      const entries = moveEntry(doc.entries, action.from, action.to);
      if (entries.every((entry, index) => entry === doc.entries[index])) return state;
      return withDoc(state, { ...doc, entries });
    }

    case 'nudge': {
      if (!doc) return state;
      const from = doc.entries.findIndex((entry) => entry.id === action.id);
      if (from === -1) return state;
      const to = Math.min(Math.max(from + action.delta, 0), doc.entries.length - 1);
      if (to === from) return state;
      return withDoc(state, { ...doc, entries: moveEntry(doc.entries, from, to) });
    }

    case 'resetOrder': {
      if (!doc) return state;
      const entries = [...doc.entries].sort((a, b) => a.srcIndex - b.srcIndex);
      if (entries.every((entry, index) => entry === doc.entries[index])) return state;
      return withDoc(state, { ...doc, entries });
    }

    case 'undo': {
      if (!canUndo(state.history)) return state;
      return withHistory(state, undoHistory(state.history));
    }

    case 'redo': {
      if (!canRedo(state.history)) return state;
      return withHistory(state, redoHistory(state.history));
    }

    default:
      return state;
  }
}
