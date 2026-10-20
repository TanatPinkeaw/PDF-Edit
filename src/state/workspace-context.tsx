/** One open document shared by every tool, so switching tools keeps the file. */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { usePdfSession, type PdfSession } from '../hooks/usePdfSession';
import { useThumbnails, type Thumbnails } from '../hooks/useThumbnails';

export type WorkspaceValue = {
  session: PdfSession;
  thumbnails: Thumbnails;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const session = usePdfSession();
  const thumbnails = useThumbnails(session.bytes);
  const value = useMemo(() => ({ session, thumbnails }), [session, thumbnails]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace ต้องใช้ภายใน WorkspaceProvider');
  return value;
}
