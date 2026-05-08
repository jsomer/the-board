import { api } from "./client";
import type { EventRecord, SideBet } from "./types";

export function listEvents() {
  return api<EventRecord[]>("/events");
}

export function getEvent(id: number | string) {
  return api<EventRecord>(`/events/${id}`);
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

export function pickActiveEvent(events: EventRecord[]): EventRecord | null {
  if (!events.length) return null;
  // Prefer active, then draft, then highest id
  const sorted = [...events].sort((a, b) => b.id - a.id);
  return (
    sorted.find((e) => e.status === "active") ??
    sorted.find((e) => e.status === "draft") ??
    sorted[0]
  );
}
