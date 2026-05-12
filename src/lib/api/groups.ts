import { api } from "./client";

export interface GroupMember {
  player_id: number;
  name: string;
}

export type GroupStatus = "scoring" | "needs_review" | "approved";

export interface EventGroup {
  id: number;
  event_id: number;
  name: string;
  start_hole: number | null;
  status: GroupStatus;
  approved_at: string | null;
  approved_by_player_id: number | null;
  approved_by_name: string | null;
  members: GroupMember[];
}

export function approveGroup(eventId: number | string, groupId: number | string) {
  return api<EventGroup>(`/events/${eventId}/groups/${groupId}/approve`, {
    method: "POST",
  });
}

export async function listGroups(eventId: number | string): Promise<EventGroup[]> {
  const raw = await api<unknown>(`/events/${eventId}/groups`);
  if (Array.isArray(raw)) return raw as EventGroup[];
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const k of ["groups", "data", "items", "results"]) {
      if (Array.isArray(r[k])) return r[k] as EventGroup[];
    }
  }
  return [];
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

