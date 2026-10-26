import { useEffect, useState } from 'react';

import { filesFromDataTransfer } from '../lib/dropped-files';

type Options = {
  enabled?: boolean;
  onFiles: (files: File[]) => void;
};

export type FileDropState = {
  /** A file drag is hovering the window. */
  dragging: boolean;
  /** A folder is being walked; keep the overlay up meanwhile. */
  reading: boolean;
};

/**
 * Tracks a window-wide file drag and hands dropped files to the caller.
 * Folders are read recursively, so a whole scan folder can be dropped at once.
 */
export function useFileDrop({ enabled = true, onFiles }: Options): FileDropState {
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }

    let depth = 0;

    const carriesFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const handleEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragging(true);
    };

    const handleOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };

    const handleDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!carriesFiles(event)) return;
      event.preventDefault();
      const transfer = event.dataTransfer;
      if (!transfer) return;

      setReading(true);
      // Files are read asynchronously; the DataTransfer itself is gone once
      // this handler returns, so entries were captured inside the call below.
      void filesFromDataTransfer(transfer)
        .catch(() => [])
        .then((files) => onFiles(files))
        .finally(() => setReading(false));
    };

    window.addEventListener('dragenter', handleEnter);
    window.addEventListener('dragover', handleOver);
    window.addEventListener('dragleave', handleLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleEnter);
      window.removeEventListener('dragover', handleOver);
      window.removeEventListener('dragleave', handleLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [enabled, onFiles]);

  return { dragging, reading };
}
