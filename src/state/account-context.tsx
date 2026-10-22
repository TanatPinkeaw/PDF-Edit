/**
 * Account state: the credit wallet, email/password members and the optional
 * Google sign-in. One bootstrap request on load; credit updates are pushed by
 * `trackRun` and by redeeming a code.
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
  apiFetch,
  isCredits,
  resetWorkspaceToken,
  type AccountSnapshot,
  type CreditEntry,
  type Credits,
  type VerificationStatus,
} from '../lib/api';
import { requestGoogleCredential } from '../lib/google-auth';
import { CREDITS_EVENT } from '../lib/runs';

type AccountStatus = 'loading' | 'ready' | 'offline';

type AccountValue = {
  status: AccountStatus;
  snapshot: AccountSnapshot | null;
  /** Null while credits are shelved (the default). */
  credits: Credits | null;
  /** False while the credit system is shelved; the wallet UI stays hidden. */
  creditsEnabled: boolean;
  /** True when a tool may not run without signing in. */
  requireSignIn: boolean;
  recentEntries: CreditEntry[];
  user: AccountSnapshot['user'];
  authConfigured: boolean;
  googleClientId: string | null;
  /** Null for anonymous browsers. */
  verification: VerificationStatus | null;
  /** Null for anonymous browsers; false means Google-only (no password). */
  passwordSet: boolean | null;
  /** Set only while mail is logged instead of sent (no SMTP configured). */
  devCode: string | null;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  sendVerificationCode: () => Promise<VerificationStatus>;
  confirmEmailCode: (code: string) => Promise<VerificationStatus>;
  signUp: (email: string, password: string, name?: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  redeem: (code: string) => Promise<number>;
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
  const [devCode, setDevCode] = useState<string | null>(null);
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
    const handleCredits = (event: Event) => {
      const credits = (event as CustomEvent<unknown>).detail;
      if (!isCredits(credits)) return;
      // A credit update means the API is reachable again.
      setStatus('ready');
      setError(null);
      if (!hasSnapshot.current) {
        void refresh();
        return;
      }
      setSnapshot((current) => (current ? { ...current, credits } : current));
    };

    window.addEventListener(CREDITS_EVENT, handleCredits);
    return () => window.removeEventListener(CREDITS_EVENT, handleCredits);
  }, [refresh]);

  const authenticate = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await apiFetch(path, { method: 'POST', body });
        await refresh();
        return true;
      } catch (authError) {
        if (mounted.current) setError(errorMessage(authError));
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh],
  );

  const signUp = useCallback(
    (email: string, password: string, name?: string) =>
      authenticate('/api/auth/signup', { email, password, ...(name ? { name } : {}) }),
    [authenticate],
  );

  const signIn = useCallback(
    (email: string, password: string) => authenticate('/api/auth/signin', { email, password }),
    [authenticate],
  );

  const signInWithGoogle = useCallback(async () => {
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

  const redeem = useCallback(async (code: string): Promise<number> => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{
        granted: number;
        credits: Credits;
        entries: CreditEntry[];
      }>('/api/credits/redeem', { method: 'POST', body: { code } });
      if (mounted.current) {
        setSnapshot((current) =>
          current
            ? { ...current, credits: response.credits, recentEntries: response.entries }
            : current,
        );
      }
      return response.granted;
    } catch (redeemError) {
      if (mounted.current) setError(errorMessage(redeemError));
      throw redeemError;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const applyVerification = useCallback((verification: VerificationStatus) => {
    if (!mounted.current) return;
    setSnapshot((current) => (current ? { ...current, verification } : current));
  }, []);

  const sendVerificationCode = useCallback(async (): Promise<VerificationStatus> => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{ verification: VerificationStatus; devCode?: string }>(
        '/api/auth/verify/send',
        { method: 'POST' },
      );
      applyVerification(response.verification);
      setDevCode(response.devCode ?? null);
      return response.verification;
    } catch (sendError) {
      const message = errorMessage(sendError);
      if (mounted.current) setError(message);
      throw sendError;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [applyVerification]);

  const confirmEmailCode = useCallback(
    async (code: string): Promise<VerificationStatus> => {
      setBusy(true);
      setError(null);
      try {
        const response = await apiFetch<{ verification: VerificationStatus }>(
          '/api/auth/verify/confirm',
          { method: 'POST', body: { code } },
        );
        applyVerification(response.verification);
        setDevCode(null);
        return response.verification;
      } catch (confirmError) {
        const message = errorMessage(confirmError);
        if (mounted.current) setError(message);
        throw confirmError;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [applyVerification],
  );

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
      credits: snapshot?.credits ?? null,
      creditsEnabled: snapshot?.creditsEnabled ?? false,
      requireSignIn: snapshot?.requireSignIn ?? true,
      recentEntries: snapshot?.recentEntries ?? [],
      user: snapshot?.user ?? null,
      authConfigured: snapshot?.authConfigured ?? false,
      googleClientId: snapshot?.googleClientId ?? null,
      verification: snapshot?.verification ?? null,
      passwordSet: snapshot?.passwordSet ?? null,
      devCode,
      error,
      busy,
      refresh,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      redeem,
      sendVerificationCode,
      confirmEmailCode,
      deleteEverything,
    }),
    [
      status,
      snapshot,
      error,
      devCode,
      busy,
      refresh,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      redeem,
      sendVerificationCode,
      confirmEmailCode,
      deleteEverything,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount ต้องใช้ภายใน AccountProvider');
  return value;
}
