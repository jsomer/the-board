import { redirect } from "@tanstack/react-router";
import { isAuthenticated } from "@/lib/api/auth";

const ACTIVE_EVENT_KEY = "activeEventId";

/** Read the active event id from URL ?eventId or localStorage. */
function readActiveEventId(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("eventId");
  if (q && /^\d+$/.test(q)) return Number(q);
  const ls = window.localStorage.getItem(ACTIVE_EVENT_KEY);
  if (ls && /^\d+$/.test(ls)) return Number(ls);
  return null;
}

/**
 * Guard for any route that requires both an authenticated session AND a
 * currently-selected event. Throws a redirect when either is missing.
 *
 * - Not authed → /login
 * - Authed, no event → /events (picker)
 */
export function requireAuthAndEvent() {
  if (typeof window === "undefined") return; // skip during SSR
  if (!isAuthenticated()) {
    throw redirect({ to: "/login" });
  }
  if (readActiveEventId() == null) {
    throw redirect({ to: "/events" });
  }
}

/** Auth-only guard (no event required). Used by /events itself. */
export function requireAuth() {
  if (typeof window === "undefined") return;
  if (!isAuthenticated()) {
    throw redirect({ to: "/login" });
  }
}
