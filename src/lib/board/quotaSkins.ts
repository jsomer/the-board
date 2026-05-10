import type { EventRecord, HoleLeader, SkinsState } from "@/lib/api/types";

export type HoleSkin = { hole: number; winner: string | null; value: number };

/** Quotas keyed by string player id, derived from EventRecord.players[].quota */
export function quotasFromEvent(evt: EventRecord | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!evt) return out;
  for (const p of evt.players) out[String(p.player_id)] = p.quota;
  return out;
}

/** Convert SkinsState into the per-hole list the UI uses. */
export function skinRowsFromState(skins: SkinsState | null): HoleSkin[] {
  if (!skins) return [];
  const participants = Array.isArray(skins.participants) ? skins.participants : [];
  const holes = Array.isArray(skins.holes) ? skins.holes : [];
  const perHoleBase = participants.length > 0 && skins.pot > 0 ? skins.pot / 18 : 5;
  return holes.map((h) => ({
    hole: h.hole,
    winner: h.winner != null ? String(h.winner) : null,
    value: Math.round((h.carryIn + 1) * perHoleBase),
  }));
}

/**
 * Convert the live `hole_leaders` array (returned on every GET /events/:id poll)
 * into per-hole skin rows the UI uses.
 *  - status === "clear"    → that hole has a live winner (holders[0])
 *  - status === "tied"     → skin is dead on that hole (carry to next)
 *  - status === "unplayed" → no winner yet
 */
export function skinRowsFromHoleLeaders(
  evt: EventRecord | null | undefined,
): HoleSkin[] {
  if (!evt) return [];
  const leaders: HoleLeader[] = Array.isArray(evt.hole_leaders) ? evt.hole_leaders : [];
  if (leaders.length === 0) return [];
  const perHole = 5; // server doesn't carry per-hole pot value yet
  return leaders
    .slice()
    .sort((a, b) => a.hole - b.hole)
    .map((h) => ({
      hole: h.hole,
      winner: h.status === "clear" && h.holders?.[0] ? String(h.holders[0].player_id) : null,
      value: perHole,
    }));
}
