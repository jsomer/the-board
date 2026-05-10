import { api, setTokens, clearTokens, getAccessToken } from "./client";
import type { AuthTokens, EventJoinInfo, EventJoinResult, MeResponse } from "./types";

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
  if (typeof window !== "undefined") window.localStorage.removeItem("gt_player_id");
}

// ── Event-code join (no account required) ────────────────────────────────────

export function getEventByCode(eventCode: string): Promise<EventJoinInfo> {
  return api<EventJoinInfo>(`/auth/event/${encodeURIComponent(eventCode.toUpperCase())}`, { auth: false });
}

export async function eventJoin(eventCode: string, playerId: number): Promise<EventJoinResult> {
  const result = await api<EventJoinResult>("/auth/event-join", {
    method: "POST",
    body: { eventCode: eventCode.toUpperCase(), playerId },
    auth: false,
  });
  // Store access token only — no refresh token for player-scoped sessions
  if (typeof window !== "undefined") {
    window.localStorage.setItem("gt_accessToken", result.accessToken);
    window.localStorage.removeItem("gt_refreshToken");
    window.localStorage.setItem("gt_player_id", String(result.player.id));
    window.localStorage.setItem("activeEventId", String(result.event_id));
  }
  setStoredIsAdmin(false);
  return result;
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}
