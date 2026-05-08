import { api } from "./client";

export interface GroupMember {
  player_id: number;
  name: string;
}

export interface EventGroup {
  id: number;
  event_id: number;
  name: string;
  start_hole: number | null;
  members: GroupMember[];
}

export function listGroups(eventId: number | string) {
  return api<EventGroup[]>(`/events/${eventId}/groups`);
}

export function createGroup(
  eventId: number | string,
  body: { name: string; startHole?: number | null },
) {
  return api<EventGroup>(`/events/${eventId}/groups`, { method: "POST", body });
}

export function updateGroup(
  eventId: number | string,
  groupId: number | string,
  body: { name?: string; startHole?: number | null },
) {
  return api<EventGroup>(`/events/${eventId}/groups/${groupId}`, { method: "PUT", body });
}

export function deleteGroup(eventId: number | string, groupId: number | string) {
  return api<{ success: boolean }>(`/events/${eventId}/groups/${groupId}`, { method: "DELETE" });
}

export function addGroupMember(
  eventId: number | string,
  groupId: number | string,
  playerId: number | string,
) {
  return api<EventGroup>(`/events/${eventId}/groups/${groupId}/members`, {
    method: "POST",
    body: { playerId },
  });
}

export function removeGroupMember(
  eventId: number | string,
  groupId: number | string,
  playerId: number | string,
) {
  return api<EventGroup>(
    `/events/${eventId}/groups/${groupId}/members/${playerId}`,
    { method: "DELETE" },
  );
}

export interface GroupHoleScorePayload {
  playerId: number;
  holeNumber: number;
  grossScore: number;
}

export function postGroupHoleScore(
  eventId: number | string,
  groupId: number | string,
  payload: GroupHoleScorePayload,
) {
  return api<unknown>(`/events/${eventId}/groups/${groupId}/score`, {
    method: "POST",
    body: payload,
  });
}
