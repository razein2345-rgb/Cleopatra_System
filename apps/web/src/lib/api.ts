import type { ApiResponse } from '@cleopatra/shared';
import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new Error(body.error.message);
  }
  return body.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

export function apiPut<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}
