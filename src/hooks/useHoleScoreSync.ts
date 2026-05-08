import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postHoleScore } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventRecord } from "@/lib/api/types";

export type SyncStatus = "idle" | "saving" | "saved" | "error";

interface PendingEntry {
  timer: number;
  grossScore: number | undefined; // undefined = clear (not actually supported, treated as no-op)
  prevScore: number; // 0 = was empty
}

interface QueueArgs {
  playerId: string | number;
  holeNumber: number; // 1-indexed
  grossScore: number | undefined;
  prevScore: number;
}

const DEBOUNCE_MS = 500;

export function useHoleScoreSync(eventId: number | null) {
  const qc = useQueryClient();
  const pending = useRef<Map<string, PendingEntry>>(new Map());
  const inFlight = useRef(0);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [savedTick, setSavedTick] = useState(0);

  const flush = useCallback(
    async (key: string) => {
      const entry = pending.current.get(key);
      if (!entry || eventId == null) return;
      pending.current.delete(key);
      const [pidStr, holeStr] = key.split(":");
      const playerId = Number(pidStr);
      const holeNumber = Number(holeStr);
      const { grossScore, prevScore } = entry;
      if (grossScore == null || !Number.isFinite(grossScore) || grossScore < 1) return;

      inFlight.current += 1;
      setStatus("saving");
      try {
        await postHoleScore(eventId, { playerId, holeNumber, grossScore });
        // Mark saved + invalidate so leaderboard / derived data refreshes
        setSavedTick((n) => n + 1);
        await qc.invalidateQueries({ queryKey: ["event", eventId] });
        await qc.invalidateQueries({ queryKey: ["side-bets", eventId] });
      } catch (err) {
        // Revert optimistic write
        revertCache(qc, eventId, playerId, holeNumber, prevScore);
        const msg =
          err instanceof ApiError
            ? err.status === 403
              ? "You can only score your own player"
              : `Save failed (${err.status})`
            : err instanceof Error
              ? err.message
              : "Save failed";
        toast.error(msg);
        setStatus("error");
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) {
          setStatus((prev) => (prev === "error" ? "error" : "saved"));
        }
      }
    },
    [eventId, qc],
  );

  const queue = useCallback(
    ({ playerId, holeNumber, grossScore, prevScore }: QueueArgs) => {
      if (eventId == null) return;
      const key = `${playerId}:${holeNumber}`;

      // Optimistic write into the event query cache
      writeCache(qc, eventId, Number(playerId), holeNumber, grossScore ?? 0);

      const existing = pending.current.get(key);
      if (existing) window.clearTimeout(existing.timer);

      const prevForRevert = existing ? existing.prevScore : prevScore;
      const timer = window.setTimeout(() => void flush(key), DEBOUNCE_MS);
      pending.current.set(key, { timer, grossScore, prevScore: prevForRevert });
    },
    [eventId, flush, qc],
  );

  // Cleanup outstanding timers on unmount
  useEffect(() => {
    const map = pending.current;
    return () => {
      map.forEach((e) => window.clearTimeout(e.timer));
      map.clear();
    };
  }, []);

  return { queue, status, savedTick };
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
