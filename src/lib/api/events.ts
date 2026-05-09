import { api } from "./client";
import type { EventRecord, SideBet } from "./types";

// Defensively unwrap an API response that may be an array, or an object
// wrapping an array under a common key (data/items/results/<key>).
function asArray<T = unknown>(raw: unknown, key?: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (key && Array.isArray(r[key])) return r[key] as T[];
    for (const k of ["data", "items", "results", "rows"]) {
      if (Array.isArray(r[k])) return r[k] as T[];
    }
  }
  return [];
}

function unwrapEvent(raw: Record<string, unknown>): EventRecord {
  const nested = raw.results_json as { players?: unknown } | null | undefined;
  const topPlayers = (raw as { players?: unknown }).players;
  const players = Array.isArray(nested?.players)
    ? nested!.players
    : Array.isArray(topPlayers)
      ? topPlayers
      : [];
  return {
    ...(raw as unknown as EventRecord),
    players: players as EventRecord["players"],
  };
}

export async function listEvents(): Promise<EventRecord[]> {
  const raw = await api<unknown>("/events");
  const rows = asArray<Record<string, unknown>>(raw, "events");
  return rows.map(unwrapEvent);
}

export async function getEvent(id: number | string): Promise<EventRecord> {
  const raw = await api<Record<string, unknown>>(`/events/${id}`);
  return unwrapEvent(raw);
}

export async function getSideBets(id: number | string): Promise<SideBet[]> {
  const raw = await api<unknown>(`/events/${id}/side-bets`);
  return asArray<SideBet>(raw, "sideBets");
}

export function pickActiveEvent(events: EventRecord[] | null | undefined): EventRecord | null {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => b.id - a.id);
  return sorted.find((e) => e.status === "draft") ?? sorted[0];
}

export interface HoleScorePayload {
  playerId: number;
  holeNumber: number; // 1..18
  grossScore: number; // positive int
}

export function postHoleScore(eventId: number | string, payload: HoleScorePayload) {
  if (!Number.isFinite(payload.playerId) || payload.playerId <= 0) {
    return Promise.reject(new Error(`Invalid playerId: ${String(payload.playerId)}`));
  }
  if (!Number.isInteger(payload.holeNumber) || payload.holeNumber < 1 || payload.holeNumber > 18) {
    return Promise.reject(new Error(`Invalid holeNumber: ${payload.holeNumber}`));
  }
  return api<unknown>(`/events/${eventId}/hole-score`, {
    method: "POST",
    body: payload,
  });
}

export function lockHoleRequest(eventId: number | string, hole: number) {
  return api<{ locked_holes: number[] }>(`/events/${eventId}/holes/${hole}/lock`, {
    method: "POST",
  });
}

export function unlockHoleRequest(eventId: number | string, hole: number) {
  return api<{ locked_holes: number[] }>(`/events/${eventId}/holes/${hole}/unlock`, {
    method: "POST",
  });
}

