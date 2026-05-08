import { api } from "./client";
import type {
  Course,
  CreateEventPayload,
  EventPlayer,
  EventRecord,
  GameSetup,
  PlayerRecord,
} from "./types";

export function listGameSetups() {
  return api<GameSetup[]>("/game-setups");
}

export function listCourses() {
  return api<Course[]>("/courses");
}

export function listPlayers() {
  return api<PlayerRecord[]>("/players");
}

export function createEvent(payload: CreateEventPayload) {
  return api<EventRecord>("/events", { method: "POST", body: payload });
}

export interface PlayerQuotaResponse {
  quota: number;
  source: "per_game" | "default" | string;
}

export function getPlayerGameQuota(playerId: number | string, gameSetupId: number | string) {
  return api<PlayerQuotaResponse>(`/players/${playerId}/game-quota/${gameSetupId}`);
}

export function updateEvent(
  id: number | string,
  body: { results: { players: EventPlayer[] } } & Record<string, unknown>,
) {
  return api<EventRecord>(`/events/${id}`, { method: "PUT", body });
}
