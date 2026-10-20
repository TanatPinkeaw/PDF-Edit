import { useEffect, useState } from 'react';

type Options = {
  enabled?: boolean;
  onFiles: (files: File[]) => void;
};

/** Tracks a window-wide file drag and hands dropped files to the caller. */
export function useFileDrop({ enabled = true, onFiles }: Options): boolean {
  const [dragging, setDragging] = useState(false);

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
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
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

  return dragging;
}
