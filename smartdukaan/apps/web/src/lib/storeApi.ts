import type { ApiErrorBody } from '@smartdukaan/shared';
import { ApiError } from './api';

/**
 * Buyer-facing API client. Unlike the retailer client (in-memory access token
 * + refresh cookie), the customer token is a long-lived JWT kept in
 * localStorage for convenience — lower-stakes buyer accounts, no shop data.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'sd_store_token';

export function getStoreToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setStoreToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getStoreToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/store${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  const text = await res.text();
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
  if (!res.ok) {
    const body = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, body ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return payload as T;
}

export const storeApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
};
