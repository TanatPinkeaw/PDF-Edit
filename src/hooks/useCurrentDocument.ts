import { useEffect, useState } from 'react';

import { buildPdf } from '../lib/pdf-ops';
import { useWorkspace } from '../state/workspace-context';

/**
 * Bytes of the document in its current order (after deletes/reorders), which is
 * what page numbers and watermarks must follow.
 */
export function useCurrentDocument(): Uint8Array | null {
  const { session } = useWorkspace();
  const doc = session.doc;
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session.bytes || !doc) {
      setBytes(null);
      return;
    }

    buildPdf(
      session.bytes,
      doc.entries.map((entry) => entry.srcIndex),
    ).then(
      (next) => {
        if (!cancelled) setBytes(next);
      },
      () => {
        if (!cancelled) setBytes(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [doc, session.bytes]);

  return bytes;
}
