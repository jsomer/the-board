import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postHoleScore } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventRecord } from "@/lib/api/types";

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface PendingEntry {
  // Score data
  playerId: number;
  holeNumber: number;
  grossScore: number;
  // For optimistic revert
  prevScore: number;
  // Scheduling
  scheduledAt: number; // epoch ms — when this should next attempt
  attempts: number;
}

interface QueueArgs {
  playerId: string | number;
  holeNumber: number; // 1-indexed
  grossScore: number | undefined;
  prevScore: number;
}

const DEBOUNCE_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const MAX_ATTEMPTS = 8;
const STORAGE_PREFIX = "gt_pendingScores_v1:";

function storageKey(eventId: number) {
  return `${STORAGE_PREFIX}${eventId}`;
}

/** Remove queue entries for events other than the current one. */
function pruneStaleQueues(currentEventId: number) {
  if (typeof window === "undefined") return;
  try {
    const keep = storageKey(currentEventId);
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && k !== keep) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function loadQueue(eventId: number): Map<string, PendingEntry> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(storageKey(eventId));
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as Array<[string, PendingEntry]>;
    return new Map(arr);
  } catch {
    return new Map();
  }
}

function persistQueue(eventId: number, q: Map<string, PendingEntry>) {
  if (typeof window === "undefined") return;
  try {
    if (q.size === 0) window.localStorage.removeItem(storageKey(eventId));
    else window.localStorage.setItem(storageKey(eventId), JSON.stringify([...q.entries()]));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function useHoleScoreSync(eventId: number | null) {
  const qc = useQueryClient();
  // Persistent queue keyed by `${playerId}:${hole}`
  const queueRef = useRef<Map<string, PendingEntry>>(new Map());
  const flushTimer = useRef<number | null>(null);
  const inFlight = useRef(0);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [savedTick, setSavedTick] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Load queue on event change
  useEffect(() => {
    if (eventId == null) {
      queueRef.current = new Map();
      setPendingCount(0);
      return;
    }
    pruneStaleQueues(eventId);
    queueRef.current = loadQueue(eventId);
    setPendingCount(queueRef.current.size);
    if (queueRef.current.size > 0) {
      // Replay optimistic state into the cache so UI matches on reload
      queueRef.current.forEach((e) =>
        writeCache(qc, eventId, e.playerId, e.holeNumber, e.grossScore),
      );
      scheduleFlushNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Online/offline listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing scores");
      scheduleFlushNow();
    };
    const goOffline = () => {
      setOnline(false);
      setStatus("offline");
      toast.warning("Offline — scores queued");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleFlushNow() {
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => void flushQueue(), 0);
  }

  function scheduleFlushAt(ms: number) {
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => void flushQueue(), Math.max(0, ms));
  }

  const flushQueue = useCallback(async () => {
    flushTimer.current = null;
    if (eventId == null) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    const now = Date.now();
    const ready: Array<[string, PendingEntry]> = [];
    let nextWake = Infinity;
    queueRef.current.forEach((e, k) => {
      if (e.scheduledAt <= now) ready.push([k, e]);
      else nextWake = Math.min(nextWake, e.scheduledAt);
    });
    if (ready.length === 0) {
      if (Number.isFinite(nextWake)) scheduleFlushAt(nextWake - now);
      return;
    }

    setStatus("saving");
    inFlight.current += ready.length;

    const results = await Promise.all(
      ready.map(async ([key, entry]) => {
        try {
          await postHoleScore(eventId, {
            playerId: entry.playerId,
            holeNumber: entry.holeNumber,
            grossScore: entry.grossScore,
          });
          return { key, ok: true as const };
        } catch (err) {
          return { key, ok: false as const, err, entry };
        }
      }),
    );

    let hadError = false;
    let hadSuccess = false;
    let permanentFailure = false;
    for (const r of results) {
      inFlight.current -= 1;
      if (r.ok) {
        queueRef.current.delete(r.key);
        hadSuccess = true;
        continue;
      }
      const err = r.err;
      // Permanent client error — drop & revert
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
        const e = r.entry;
        revertCache(qc, eventId, e.playerId, e.holeNumber, e.prevScore);
        queueRef.current.delete(r.key);
        permanentFailure = true;
        const msg = err.status === 403 ? "You can only score your own player" : `Save failed (${err.status})`;
        toast.error(msg);
        continue;
      }
      // Transient — back off, with attempt cap
      const e = r.entry;
      const attempts = e.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        revertCache(qc, eventId, e.playerId, e.holeNumber, e.prevScore);
        queueRef.current.delete(r.key);
        permanentFailure = true;
        toast.error("Save failed after multiple retries", {
          description: `Hole ${e.holeNumber} reverted. Re-enter when connection is stable.`,
        });
        continue;
      }
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 5));
      queueRef.current.set(r.key, { ...e, attempts, scheduledAt: Date.now() + delay });
      hadError = true;
    }

    persistQueue(eventId, queueRef.current);
    setPendingCount(queueRef.current.size);

    if (hadSuccess) {
      setSavedTick((n) => n + 1);
      await qc.invalidateQueries({ queryKey: ["event", eventId] });
      await qc.invalidateQueries({ queryKey: ["side-bets", eventId] });
    }

    if (queueRef.current.size === 0) {
      setStatus(permanentFailure && !hadSuccess ? "error" : "saved");
    } else if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
    } else if (hadError) {
      setStatus("error");
      // Schedule next retry at the earliest pending scheduledAt
      let next = Infinity;
      queueRef.current.forEach((e) => { next = Math.min(next, e.scheduledAt); });
      scheduleFlushAt(next - Date.now());
    } else {
      // Still pending but not yet ready
      let next = Infinity;
      queueRef.current.forEach((e) => { next = Math.min(next, e.scheduledAt); });
      if (Number.isFinite(next)) scheduleFlushAt(next - Date.now());
    }
  }, [eventId, qc]);

  const queue = useCallback(
    ({ playerId, holeNumber, grossScore, prevScore }: QueueArgs) => {
      if (eventId == null) return;
      if (grossScore == null || !Number.isFinite(grossScore) || grossScore < 1) return;
      const pid = Number(playerId);
      const key = `${pid}:${holeNumber}`;

      // Optimistic write
      writeCache(qc, eventId, pid, holeNumber, grossScore);

      const existing = queueRef.current.get(key);
      const prevForRevert = existing ? existing.prevScore : prevScore;
      queueRef.current.set(key, {
        playerId: pid,
        holeNumber,
        grossScore,
        prevScore: prevForRevert,
        scheduledAt: Date.now() + DEBOUNCE_MS,
        attempts: 0,
      });
      persistQueue(eventId, queueRef.current);
      setPendingCount(queueRef.current.size);
      scheduleFlushAt(DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, qc],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    };
  }, []);

  /**
   * Clear a hole's score locally (used by Undo when there was no prior value).
   * Skips the network — backend currently has no "delete score" endpoint.
   */
  const clear = useCallback(
    ({ playerId, holeNumber }: { playerId: string | number; holeNumber: number }) => {
      if (eventId == null) return;
      const pid = Number(playerId);
      const key = `${pid}:${holeNumber}`;
      queueRef.current.delete(key);
      persistQueue(eventId, queueRef.current);
      setPendingCount(queueRef.current.size);
      writeCache(qc, eventId, pid, holeNumber, 0);
    },
    [eventId, qc],
  );

  return { queue, clear, status, savedTick, pendingCount, online };
}

function writeCache(
  qc: ReturnType<typeof useQueryClient>,
  eventId: number,
  playerId: number,
  holeNumber: number,
  grossScore: number,
) {
  qc.setQueryData<EventRecord>(["event", eventId], (old) => {
    if (!old) return old;
    return {
      ...old,
      players: old.players.map((p) =>
        Number(p.player_id) === playerId
          ? {
              ...p,
              holeScores: p.holeScores.map((s, i) => (i === holeNumber - 1 ? grossScore : s)),
            }
          : p,
      ),
    };
  });
}

function revertCache(
  qc: ReturnType<typeof useQueryClient>,
  eventId: number,
  playerId: number,
  holeNumber: number,
  prevScore: number,
) {
  writeCache(qc, eventId, playerId, holeNumber, prevScore);
}
