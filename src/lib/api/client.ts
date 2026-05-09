// JWT-aware fetch wrapper.
// VITE_API_BASE_URL overrides at build time; otherwise falls back to the Render API directly.

const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const API_BASE = (RAW_BASE && RAW_BASE.replace(/\/$/, "")) || "https://gametracker-api-npr9.onrender.com";

const ACCESS_KEY = "gt_accessToken";
const REFRESH_KEY = "gt_refreshToken";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setTokens(t: { accessToken: string; refreshToken: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, t.accessToken);
  window.localStorage.setItem(REFRESH_KEY, t.refreshToken);
}
export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!json.accessToken) return false;
    setTokens({
      accessToken: json.accessToken,
      refreshToken: json.refreshToken ?? refreshToken,
    });
    return true;
  } catch {
    return false;
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // default true
  _retry?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, auth = true, _retry, headers, ...rest } = opts;
  const h: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (auth) {
    const token = getAccessToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !_retry) {
    const ok = await refreshAccessToken();
    if (ok) return api<T>(path, { ...opts, _retry: true });
    clearTokens();
  }

  if (!res.ok) {
    let detail: unknown = undefined;
    try {
      detail = await res.json();
    } catch {
      /* noop */
    }
    const message =
      (detail != null && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : null) ??
      (res.statusText || `HTTP ${res.status}`);
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
