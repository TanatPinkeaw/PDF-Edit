/** Typed fetch wrapper for the local API, plus the anonymous workspace token. */

/**
 * The wallet, only present while credits are enabled. It is shelved by
 * default: runs are free and the server returns null instead.
 */
export type Credits = {
  balance: number;
  /** Anonymous browsers only: the one-off allowance they started with. */
  allowance: number | null;
  member: boolean;
};

export type CreditReason =
  | 'anon_grant'
  | 'signup_bonus'
  | 'run'
  | 'refund'
  | 'redeem'
  | 'admin'
  | 'merge';

export type CreditEntry = {
  id: string;
  delta: number;
  reason: CreditReason;
  note: string | null;
  balanceAfter: number;
  jobRunId: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

/** `log`/`disabled` mean no SMTP is configured; only `log` exposes the code. */
export type MailMode = 'smtp' | 'log' | 'disabled';

export type VerificationStatus = {
  verified: boolean;
  /** False when the deployment cannot send mail, so nothing is blocked. */
  enforced: boolean;
  mailMode: MailMode;
  pendingExpiresAt: string | null;
  resendAt: string | null;
};

export type AccountSnapshot = {
  workspaceId: string | null;
  user: PublicUser | null;
  /** Null in the shipped free mode. */
  credits: Credits | null;
  /** False while the credit system is shelved (the default). */
  creditsEnabled: boolean;
  /** True when a tool may not run without signing in (the default). */
  requireSignIn: boolean;
  recentEntries: CreditEntry[];
  /** Null for anonymous browsers: there is no mailbox to prove. */
  verification: VerificationStatus | null;
  /** Null for anonymous browsers; false means the account signed up with Google. */
  passwordSet: boolean | null;
  authConfigured: boolean;
  googleClientId: string | null;
};

export type RunRecord = {
  id: string;
  tool: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled' | 'abandoned';
  inputName: string | null;
  inputPages: number | null;
  inputBytes: number | null;
  outputName: string | null;
  outputBytes: number | null;
  params: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type PresetRecord = {
  id: string;
  tool: string;
  name: string;
  params: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ShareRecord = {
  token: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  expiresAt: string;
  downloadCount: number;
  expired: boolean;
};

const TOKEN_KEY = 'pdfstudio.workspace.v1';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Forgets the local workspace token; the next request creates a fresh one. */
export function resetWorkspaceToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable; nothing else to clear.
  }
}

/** Stable per-browser token; the server only stores its hash. */
export function getWorkspaceToken(): string {
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    if (existing && TOKEN_PATTERN.test(existing)) return existing;
    const token = createToken();
    window.localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // Private mode without storage still works for the current page.
    return createToken();
  }
}

export type ApiRequest = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const headers = new Headers(request.headers);
  headers.set('x-workspace-token', getWorkspaceToken());

  let body: string | undefined;
  if (request.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(request.body);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...request,
      headers,
      body,
      credentials: 'same-origin',
    });
  } catch (error) {
    throw new ApiError(0, 'network_error', error instanceof Error ? error.message : 'เชื่อมต่อ API ไม่ได้');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { error?: { code?: string; message?: string } }).error
        : undefined;
    throw new ApiError(
      response.status,
      errorBody?.code ?? 'http_error',
      errorBody?.message ?? `คำขอ ${path} ล้มเหลว (HTTP ${response.status})`,
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
    );
  }

  // A static host without an /api proxy answers 200 with index.html. Returning
  // null there would surface as a confusing "cannot read property of null" in
  // the caller, so fail with the actual reason instead.
  if (payload === null || typeof payload !== 'object') {
    throw new ApiError(
      response.status,
      'invalid_response',
      `การตอบกลับจาก ${path} ไม่ใช่ JSON — ตรวจว่า /api ถูก proxy ไปที่เซิร์ฟเวอร์`,
    );
  }

  return payload as T;
}

export function isCredits(value: unknown): value is Credits {
  if (typeof value !== 'object' || value === null) return false;
  const credits = value as Partial<Credits>;
  return typeof credits.balance === 'number' && typeof credits.member === 'boolean';
}

export function formatCredits(credits: Credits): string {
  return credits.balance === 1 ? 'เหลือ 1 เครดิต' : `เหลือ ${credits.balance} เครดิต`;
}
