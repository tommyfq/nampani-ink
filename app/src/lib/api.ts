'use client';

export type Role = 'OWNER' | 'MANAGER' | 'FRONT_DESK' | 'ARTIST';
export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  outletIds: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** Calls the API through this app's /api proxy, with the login cookie. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? `Error ${res.status}`;
    throw new ApiError(res.status, message, data?.issues ?? []);
  }
  return data as T;
}

/** 1050 basis points → "10.5" (percent, for inputs). */
export const bpsToPercent = (bps: number | null | undefined) => (bps == null ? '' : String(bps / 100));
export const percentToBps = (v: string) => Math.round(Number(v) * 100);
