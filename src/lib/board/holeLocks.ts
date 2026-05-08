// Server-driven hole locks.
//
// The list of locked holes lives on the EventRecord and is refreshed by the
// normal poll. Lock/unlock actions hit the API and apply an optimistic update
// to the React Query cache so the UI flips immediately.
//
// We still keep a small client-side AUDIT log of admin actions taken in this
// browser. The backend doesn't ship one yet, so this is best-effort and only
// shows what *this* admin did locally — labelled accordingly in the UI.

import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lockHoleRequest, unlockHoleRequest } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventRecord } from "@/lib/api/types";
import { toast } from "sonner";

const AUDIT_KEY = "gt_holeLocks_audit_v1";

export interface HoleAuditEntry {
  hole: number;
  action: "lock" | "unlock";
  actor: string;
  at: number;
  note?: string;
}

// ---------------- audit log (client-only) ----------------

function readAudit(): HoleAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HoleAuditEntry[]) : [];
  } catch {
    return [];
  }
}

let auditCache: HoleAuditEntry[] = readAudit();
const auditListeners = new Set<() => void>();

function emitAudit() {
  for (const l of auditListeners) l();
}

function writeAudit(next: HoleAuditEntry[]) {
  auditCache = next.slice(0, 200);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AUDIT_KEY, JSON.stringify(auditCache));
    } catch {
      /* ignore quota */
    }
  }
  emitAudit();
}

function pushAudit(entry: HoleAuditEntry) {
  writeAudit([entry, ...auditCache]);
}

export function clearHoleAudit() {
  writeAudit([]);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === AUDIT_KEY) {
      auditCache = readAudit();
      emitAudit();
    }
  });
}

function subscribeAudit(cb: () => void) {
  auditListeners.add(cb);
  return () => auditListeners.delete(cb);
}
function getAuditSnapshot() {
  return auditCache;
}
function getAuditServerSnapshot(): HoleAuditEntry[] {
  return [];
}

export function useHoleLockAudit(): HoleAuditEntry[] {
  return useSyncExternalStore(subscribeAudit, getAuditSnapshot, getAuditServerSnapshot);
}

// ---------------- locked-holes derivation ----------------

// The single source of truth for `locked` lives in the React Query cache for
// `["event", eventId]`. Components that need it should read from useBoardData()
// — but we expose a hook here for callers that already use this module.

import { useBoardData } from "./context";

export interface HoleLocksState {
  locked: number[];
  audit: HoleAuditEntry[];
}

export function useHoleLocks(): HoleLocksState {
  const { rawEvent } = useBoardData();
  const audit = useHoleLockAudit();
  const locked = (rawEvent?.locked_holes ?? []).slice().sort((a, b) => a - b);
  return { locked, audit };
}

/**
 * Read the current locked-holes list without subscribing (e.g. from event
 * handlers). Falls back to an empty array when no event is loaded.
 */
export function isHoleLocked(hole: number, lockedHoles?: number[]): boolean {
  if (lockedHoles) return lockedHoles.includes(hole);
  return false;
}

// ---------------- mutation hooks ----------------

function patchCache(qc: ReturnType<typeof useQueryClient>, eventId: number, next: number[]) {
  qc.setQueryData<EventRecord>(["event", eventId], (old) =>
    old ? { ...old, locked_holes: next } : old,
  );
}

export function useHoleLockActions() {
  const qc = useQueryClient();
  const { eventId, rawEvent } = useBoardData();

  const lock = async (hole: number, actor = "Admin", note?: string) => {
    if (eventId == null) return;
    const before = rawEvent?.locked_holes ?? [];
    if (before.includes(hole)) return;
    patchCache(qc, eventId, [...before, hole].sort((a, b) => a - b));
    pushAudit({ hole, action: "lock", actor, at: Date.now(), note });
    try {
      const { locked_holes } = await lockHoleRequest(eventId, hole);
      patchCache(qc, eventId, locked_holes);
    } catch (err) {
      patchCache(qc, eventId, before);
      const msg = err instanceof ApiError && err.status === 403
        ? "Admin only"
        : `Failed to lock hole ${hole}`;
      toast.error(msg);
    }
  };

  const unlock = async (hole: number, actor = "Admin", note?: string) => {
    if (eventId == null) return;
    const before = rawEvent?.locked_holes ?? [];
    if (!before.includes(hole)) return;
    patchCache(qc, eventId, before.filter((h) => h !== hole));
    pushAudit({ hole, action: "unlock", actor, at: Date.now(), note });
    try {
      const { locked_holes } = await unlockHoleRequest(eventId, hole);
      patchCache(qc, eventId, locked_holes);
    } catch (err) {
      patchCache(qc, eventId, before);
      const msg = err instanceof ApiError && err.status === 403
        ? "Admin only"
        : `Failed to unlock hole ${hole}`;
      toast.error(msg);
    }
  };

  return { lock, unlock };
}
