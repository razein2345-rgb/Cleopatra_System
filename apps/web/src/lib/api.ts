import type { ApiResponse } from '@cleopatra/shared';
import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Device Access Control (2026-08-24, owner: "عايز اقدر احدد الأجهزة
 * المسموح لها بفتح النظام") — a random, non-sensitive identifier kept in
 * `localStorage`, sent as `X-Device-Id` on every request so the backend
 * (`requireAuth.ts`) can recognize this browser across sessions. Not a
 * fingerprint — no device characteristics are collected here, just an
 * opaque token this browser generates once and keeps.
 */
const DEVICE_ID_KEY = 'cp_device_id';

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Device-Id': getDeviceId(),
  };
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

/**
 * FEATURE-007 — attachment upload (multipart). Can't reuse `request()`
 * directly — it hardcodes `Content-Type: application/json`, which would
 * override the `multipart/form-data; boundary=...` the browser needs to
 * set itself from the FormData body.
 */
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new Error(body.error.message);
  }
  return body.data;
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

/** "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — first PATCH caller in the app; same shape as `apiPut`, just the HTTP verb for a genuinely partial update. */
export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
