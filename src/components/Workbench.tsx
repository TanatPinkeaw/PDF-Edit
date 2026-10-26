import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';

import { useFileDrop } from '../hooks/useFileDrop';
import { isPdfFile } from '../lib/dropped-files';
import { canRedo, canUndo } from '../lib/history';
import { isDocModified, selectedPageNumbers, type ToggleMode } from '../lib/session';
import { useWorkspace } from '../state/workspace-context';
import { DropOverlay } from './DropOverlay';
import { DropZone } from './DropZone';
import { PageGrid } from './PageGrid';
import { Toolbar } from './Toolbar';

type Props = {
  aside: ReactNode;
  /** Extra rotation per source page, for live previews. */
  rotations?: ReadonlyMap<number, number>;
  allowDelete?: boolean;
  emptyHint?: string;
  children?: ReactNode;
};

/**
 * The document workspace shared by organize/rotate/page-numbers/watermark:
 * file intake, page grid, selection toolbar and a tool-specific side panel.
 */
export function Workbench({
  aside,
  rotations,
  allowDelete = true,
  emptyHint,
  children,
}: Props) {
  const { session, thumbnails } = useWorkspace();
  const { doc, state, busy, dispatch } = session;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNumbers = selectedPageNumbers(state);

  const handleDrop = (files: File[]) => {
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length === 0) {
      session.notify('error', 'ไม่พบไฟล์ PDF ในสิ่งที่วาง — ลากไฟล์ .pdf หรือโฟลเดอร์ที่มี PDF');
      return;
    }
    if (pdfs.length > 1) {
      session.notify(
        'info',
        `พบ ${pdfs.length} ไฟล์ — เปิด ${pdfs[0]?.name ?? 'ไฟล์แรก'} (ใช้ Merge PDF เพื่อรวมหลายไฟล์)`,
      );
    }
    const first = pdfs[0];
    if (first) void session.openFile(first);
  };

  const drop = useFileDrop({ onFiles: handleDrop, enabled: !busy });

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (modifier && key === 'y') {
        event.preventDefault();
        session.redo();
        return;
      }
      if (isTyping(event.target)) return;

      if (modifier && key === 'a' && doc) {
        event.preventDefault();
        dispatch({ type: 'selectAll' });
        return;
      }
      if (
        allowDelete &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        state.selection.length > 0
      ) {
        event.preventDefault();
        session.deleteSelected();
        return;
      }
      if (event.key === 'Escape') {
        dispatch({ type: 'selectNone' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allowDelete, dispatch, doc, session, state.selection.length]);

  const handleToggle = (id: string, mode: ToggleMode) => dispatch({ type: 'toggle', id, mode });

  const handleDeleteOne = (id: string) => {
    if (!state.selection.includes(id)) dispatch({ type: 'toggle', id, mode: 'single' });
    dispatch({ type: 'deleteSelected' });
  };

  const pickFile = () => fileInputRef.current?.click();

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void session.openFile(file);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        onChange={handleFileInput}
        aria-label="เลือกไฟล์ PDF"
        tabIndex={-1}
      />

      {!doc ? (
        <div className="empty">
          <DropZone busy={busy} onPick={pickFile} onSample={() => void session.loadSample()} hint={emptyHint} />
        </div>
      ) : (
        <main className="workspace">
          <div className="grid-column">
            <Toolbar
              total={doc.entries.length}
              selectedCount={selectedNumbers.length}
              modified={isDocModified(doc)}
              canUndo={canUndo(state.history)}
              canRedo={canRedo(state.history)}
              busy={busy}
              allowDelete={allowDelete}
              onSelectAll={() => dispatch({ type: 'selectAll' })}
              onInvert={() => dispatch({ type: 'invertSelection' })}
              onClearSelection={() => dispatch({ type: 'selectNone' })}
              onDeleteSelected={() => session.deleteSelected()}
              onUndo={() => session.undo()}
              onRedo={() => session.redo()}
              onReset={() => session.resetOrder()}
            />

            {children}

            {thumbnails.failure && (
              <div className="thumbnail-warning" role="alert">
                <div>
                  <strong>{thumbnails.failure.message}</strong>
                  <p>{thumbnails.failure.detail}</p>
                </div>
                <button type="button" onClick={thumbnails.reload}>
                  ลองใหม่
                </button>
              </div>
            )}

            <PageGrid
              entries={doc.entries}
              selection={state.selection}
              disabled={busy}
              thumbnails={thumbnails}
              rotations={rotations}
              canReorder={allowDelete}
              onMove={session.move}
              onToggle={handleToggle}
              onDelete={handleDeleteOne}
              onNudge={session.nudge}
            />
          </div>

          <aside className="side">{aside}</aside>
        </main>
      )}

      <DropOverlay drop={drop} label="วางไฟล์ PDF หรือโฟลเดอร์เพื่อเปิด" />
    </>
  );
}
