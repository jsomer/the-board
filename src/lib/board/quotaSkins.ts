import type { EventRecord, SkinsState } from "@/lib/api/types";

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
  const perHoleBase =
    skins.participants.length > 0 && skins.pot > 0 ? skins.pot / 18 : 5;
  return skins.holes.map((h) => ({
    hole: h.hole,
    winner: h.winner != null ? String(h.winner) : null,
    value: Math.round((h.carryIn + 1) * perHoleBase),
  }));
}
