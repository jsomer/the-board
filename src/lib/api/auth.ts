import { api, setTokens, clearTokens, getAccessToken } from "./client";
import type { AuthTokens } from "./types";

export async function login(email: string, password: string): Promise<AuthTokens> {
  const tokens = await api<AuthTokens>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setTokens(tokens);
  return tokens;
}

export function logout() {
  clearTokens();
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}
