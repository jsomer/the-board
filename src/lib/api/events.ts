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
