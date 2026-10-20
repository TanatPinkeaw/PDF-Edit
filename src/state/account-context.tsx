/**
 * Account state: anonymous workspace quota, optional Google sign-in.
 * One bootstrap request on load; quota updates are pushed by `trackRun`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_QUOTA,
  apiFetch,
  isQuota,
  resetWorkspaceToken,
  type AccountSnapshot,
  type Quota,
} from '../lib/api';
import { requestGoogleCredential } from '../lib/google-auth';
import { QUOTA_EVENT } from '../lib/runs';

type AccountStatus = 'loading' | 'ready' | 'offline';

type AccountValue = {
  status: AccountStatus;
  snapshot: AccountSnapshot | null;
  quota: Quota;
  user: AccountSnapshot['user'];
  authConfigured: boolean;
  googleClientId: string | null;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteEverything: () => Promise<void>;
};

const AccountContext = createContext<AccountValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<AccountSnapshot>('/api/bootstrap', { method: 'POST' });
      if (!mounted.current) return;
      setSnapshot(next);
      setStatus('ready');
      setError(null);
    } catch (fetchError) {
      if (!mounted.current) return;
      setStatus('offline');
      setError(errorMessage(fetchError));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasSnapshot = useRef(false);
  hasSnapshot.current = snapshot !== null;

  useEffect(() => {
    const handleQuota = (event: Event) => {
      const quota = (event as CustomEvent<unknown>).detail;
      if (!isQuota(quota)) return;
      // A quota event means the API is reachable again.
      setStatus('ready');
      setError(null);
      if (!hasSnapshot.current) {
        void refresh();
        return;
      }
      setSnapshot((current) => (current ? { ...current, quota } : current));
    };

    window.addEventListener(QUOTA_EVENT, handleQuota);
    return () => window.removeEventListener(QUOTA_EVENT, handleQuota);
  }, [refresh]);

  const signIn = useCallback(async () => {
    const clientId = snapshot?.googleClientId ?? null;
    if (!clientId) {
      setError('ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID — เพิ่มใน .env แล้วรีสตาร์ท API');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const credential = await requestGoogleCredential(clientId);
      await apiFetch('/api/auth/google', { method: 'POST', body: { credential } });
      await refresh();
    } catch (signInError) {
      setError(errorMessage(signInError));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refresh, snapshot?.googleClientId]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await apiFetch('/api/auth/signout', { method: 'POST' });
      await refresh();
    } catch (signOutError) {
      setError(errorMessage(signOutError));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refresh]);

  const deleteEverything = useCallback(async () => {
    setBusy(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE' });
      resetWorkspaceToken();
      await refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [refresh]);

  const value = useMemo<AccountValue>(
    () => ({
      status,
      snapshot,
      quota: snapshot?.quota ?? DEFAULT_QUOTA,
      user: snapshot?.user ?? null,
      authConfigured: snapshot?.authConfigured ?? false,
      googleClientId: snapshot?.googleClientId ?? null,
      error,
      busy,
      refresh,
      signIn,
      signOut,
      deleteEverything,
    }),
    [status, snapshot, error, busy, refresh, signIn, signOut, deleteEverything],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount ต้องใช้ภายใน AccountProvider');
  return value;
}
