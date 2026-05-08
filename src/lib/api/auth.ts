import { api, setTokens, clearTokens, getAccessToken } from "./client";
import type { AuthTokens, MeResponse } from "./types";

const ADMIN_KEY = "gt_isAdmin";

export function getMe() {
  return api<MeResponse>("/auth/me");
}

export function getStoredIsAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ADMIN_KEY) === "1";
}

function setStoredIsAdmin(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(ADMIN_KEY, "1");
  else window.localStorage.removeItem(ADMIN_KEY);
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const tokens = await api<AuthTokens>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setTokens(tokens);
  const isAdmin = Boolean(tokens.isAdmin ?? tokens.user?.isAdmin);
  setStoredIsAdmin(isAdmin);
  return tokens;
}

export function logout() {
  clearTokens();
  setStoredIsAdmin(false);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}
