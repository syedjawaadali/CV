import type { ApiErrorBody, AuthResponse } from '@smartdukaan/shared';

/**
 * Thin fetch wrapper around the API.
 *
 * Security model:
 *  - The short-lived access token lives only in memory (never localStorage),
 *    so it is not readable after a page reload or by persistent XSS payloads.
 *  - The long-lived refresh token is an httpOnly cookie the browser sends
 *    automatically (credentials: 'include'); JS can never read it.
 *  - On a 401 we transparently try to refresh once, then retry the request.
 */

/**
 * API origin. Empty by default so the web app calls the SAME origin (`/api`),
 * which the Vite dev server proxies in development. In a packaged native app
 * (Capacitor) the webview runs from a local origin, so it must be pointed at an
 * absolute, deployed API via VITE_API_BASE_URL at build time
 * (e.g. https://api.smartdukaan.pk). No trailing slash.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody['error']) {
    super(body?.message ?? 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? 'UNKNOWN';
    this.fieldErrors = body?.fieldErrors;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Optional idempotency key for unsafe, non-retry-safe operations. */
  idempotencyKey?: string;
  /** Internal: prevents infinite refresh recursion. */
  _isRetry?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Attempt to mint a fresh access token from the refresh cookie. */
async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as AuthResponse;
        setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        // Reset after the microtask so concurrent callers share this result.
        setTimeout(() => { refreshInFlight = null; }, 0);
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !opts._isRetry && path !== '/auth/login' && path !== '/auth/register') {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, _isRetry: true });
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }

  if (!res.ok) {
    const body = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, body ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>(path, { method: 'POST', body, idempotencyKey }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  tryRefresh,
};
