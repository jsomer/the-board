// Lightweight client-side hole lock store with audit trail.
// Persisted in localStorage, shared across the app via a tiny pub/sub +
// useSyncExternalStore hook. No backend yet — purely a UI-side guard.

import { useSyncExternalStore } from "react";

const KEY = "gt_holeLocks_v1";

export interface HoleAuditEntry {
  hole: number;
  action: "lock" | "unlock";
  actor: string;
  at: number; // epoch ms
  note?: string;
}

export interface HoleLocksState {
  locked: number[]; // sorted ascending list of locked hole numbers
  audit: HoleAuditEntry[]; // newest first
}

const EMPTY: HoleLocksState = { locked: [], audit: [] };

function read(): HoleLocksState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as HoleLocksState;
    if (!parsed || !Array.isArray(parsed.locked) || !Array.isArray(parsed.audit)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

let cache: HoleLocksState = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function write(next: HoleLocksState) {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota / disabled — ignore */
    }
  }
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
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

function getServerSnapshot() {
  return EMPTY;
}

export function useHoleLocks(): HoleLocksState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isHoleLocked(hole: number): boolean {
  return cache.locked.includes(hole);
}

export function lockHole(hole: number, actor = "Admin", note?: string) {
  if (cache.locked.includes(hole)) return;
  const entry: HoleAuditEntry = { hole, action: "lock", actor, at: Date.now(), note };
  write({
    locked: [...cache.locked, hole].sort((a, b) => a - b),
    audit: [entry, ...cache.audit].slice(0, 200),
  });
}

export function unlockHole(hole: number, actor = "Admin", note?: string) {
  if (!cache.locked.includes(hole)) return;
  const entry: HoleAuditEntry = { hole, action: "unlock", actor, at: Date.now(), note };
  write({
    locked: cache.locked.filter((h) => h !== hole),
    audit: [entry, ...cache.audit].slice(0, 200),
  });
}

export function clearHoleAudit() {
  write({ locked: cache.locked, audit: [] });
}
