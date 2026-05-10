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

export interface UpdatePlayerPayload {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  usga_handicap?: number | null;
  game_points_needed?: number | null;
}

export function updatePlayer(id: number | string, body: UpdatePlayerPayload) {
  return api<PlayerRecord>(`/players/${id}`, { method: "PUT", body });
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
