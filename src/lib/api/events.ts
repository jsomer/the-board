import { api } from "./client";
import type { EventRecord, SideBet } from "./types";

function unwrapEvent(raw: Record<string, unknown>): EventRecord {
  const nested = raw.results_json as { players?: unknown } | null | undefined;
  return {
    ...(raw as unknown as EventRecord),
    players: Array.isArray(nested?.players) ? nested.players : [],
  };
}

export async function listEvents(): Promise<EventRecord[]> {
  const rows = await api<Record<string, unknown>[]>("/events");
  return rows.map(unwrapEvent);
}

export async function getEvent(id: number | string): Promise<EventRecord> {
  const raw = await api<Record<string, unknown>>(`/events/${id}`);
  return unwrapEvent(raw);
}

export function getSideBets(id: number | string) {
  return api<SideBet[]>(`/events/${id}/side-bets`);
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

export function pickActiveEvent(events: EventRecord[]): EventRecord | null {
  if (!events.length) return null;
  // Prefer most recent draft; fall back to most recent final
  const sorted = [...events].sort((a, b) => b.id - a.id);
  return sorted.find((e) => e.status === "draft") ?? sorted[0];
}
