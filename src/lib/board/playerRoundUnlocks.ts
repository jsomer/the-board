// Client-side per-player round-lock overrides.
//
// The backend approves/locks scorecards at the GROUP level — there is no
// per-player unlock API yet. Admins still need a way to flag an individual
// player as "open for editing" after the round is otherwise complete, so we
// keep an override list in localStorage keyed by event id.
//
// Components that gate editing on round-complete / group-approved status can
// consult `isPlayerUnlocked(eventId, playerId)` to bypass the lock for that
// player. The flag is best-effort and only applies in this browser.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gt_playerRoundUnlocks_v1";

type Store = Record<string, string[]>; // eventId -> playerIds[]

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

let cache: Store = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function write(next: Store) {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      /* ignore quota */
    }
  }
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = read();
      emit();
    }
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return cache;
}
const EMPTY: Store = {};
function getServerSnapshot(): Store {
  return EMPTY;
}

function keyOf(eventId: number | string | null | undefined): string | null {
  if (eventId == null) return null;
  return String(eventId);
}

export function unlockPlayer(eventId: number | string, playerId: number | string) {
  const k = keyOf(eventId);
  if (!k) return;
  const list = cache[k] ?? [];
  const pid = String(playerId);
  if (list.includes(pid)) return;
  write({ ...cache, [k]: [...list, pid] });
}

export function relockPlayer(eventId: number | string, playerId: number | string) {
  const k = keyOf(eventId);
  if (!k) return;
  const list = cache[k] ?? [];
  const pid = String(playerId);
  if (!list.includes(pid)) return;
  const next = list.filter((x) => x !== pid);
  const copy = { ...cache };
  if (next.length === 0) delete copy[k];
  else copy[k] = next;
  write(copy);
}

export function clearEventUnlocks(eventId: number | string) {
  const k = keyOf(eventId);
  if (!k || !(k in cache)) return;
  const copy = { ...cache };
  delete copy[k];
  write(copy);
}

export function isPlayerUnlocked(
  eventId: number | string | null | undefined,
  playerId: number | string,
): boolean {
  const k = keyOf(eventId);
  if (!k) return false;
  return (cache[k] ?? []).includes(String(playerId));
}

export function usePlayerRoundUnlocks(eventId: number | string | null | undefined): string[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const k = keyOf(eventId);
  if (!k) return [];
  return all[k] ?? [];
}
