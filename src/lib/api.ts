/** Typed fetch wrapper for the local API, plus the anonymous workspace token. */

export type Quota = {
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string | null;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export type AccountSnapshot = {
  workspaceId: string | null;
  user: PublicUser | null;
  quota: Quota;
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

  return payload as T;
}

export function isQuota(value: unknown): value is Quota {
  if (typeof value !== 'object' || value === null) return false;
  const quota = value as Partial<Quota>;
  return typeof quota.unlimited === 'boolean' && typeof quota.used === 'number';
}

export const DEFAULT_QUOTA: Quota = {
  unlimited: false,
  limit: 3,
  used: 0,
  remaining: 3,
  resetAt: null,
};

export function formatQuota(quota: Quota): string {
  if (quota.unlimited) return 'ไม่จำกัด';
  return `เหลือ ${quota.remaining ?? 0}/${quota.limit ?? 3} ครั้ง`;
}
