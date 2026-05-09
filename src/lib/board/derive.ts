// Pure derivation functions — no React, no API calls.
// Maps real GameTracker data shapes onto the existing Board UI shapes.

import type {
  EventPlayer,
  EventRecord,
  SideBet,
  SkinsState,
  ScoringType,
} from "@/lib/api/types";
import type { Player, Team, Trend } from "@/data/board";
import { teamForPlayer } from "./teams";

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function thruHoles(holeScores: number[]): number {
  return holeScores.filter((s) => s > 0).length;
}

export function lastScoredHole(
  holeScores: number[],
  pars: number[],
): { hole: number; score: number; par: number } | undefined {
  for (let i = holeScores.length - 1; i >= 0; i--) {
    if (holeScores[i] > 0) {
      return { hole: i + 1, score: holeScores[i], par: pars[i] ?? 4 };
    }
  }
  return undefined;
}

// "score" used for sorting/display:
//   stableford / net_stableford: diff = (achieved + adjustment) - quota   (higher = better, but we negate so lower = better matches existing "toPar" logic)
//   stroke / net_stroke: sum(played strokes) - sum(corresponding pars)
export function scoreVsField(p: EventPlayer, pars: number[], scoring: ScoringType): number {
  if (scoring === "stableford") {
    const diff = p.achieved + (p.adjustment ?? 0) - p.quota;
    return -diff; // negate so "lower number = better" matches stroke convention
  }
  let s = 0;
  for (let i = 0; i < p.holeScores.length; i++) {
    if (p.holeScores[i] > 0) s += p.holeScores[i] - (pars[i] ?? 4);
  }
  return s;
}

export function skinsCountFor(playerId: string | number, skins: SkinsState | null): number {
  if (!skins) return 0;
  return skins.holes.filter((h) => String(h.winner) === String(playerId)).length;
}

export function holeSkinValue(skins: SkinsState | null, hole: number): number {
  if (!skins || !skins.participants.length) return 0;
  const h = skins.holes.find((x) => x.hole === hole);
  const carry = h?.carryIn ?? 0;
  const perHole = skins.pot / 18 / Math.max(1, skins.participants.length);
  return Math.round((carry + 1) * perHole * skins.participants.length); // total $ on this hole
}

export function projectedPayouts(
  event: EventRecord,
  ranked: EventPlayer[],
): Map<string, number> {
  const out = new Map<string, number>();
  const breakdown = event.payout_breakdown_json;
  if (!breakdown || breakdown.length === 0) {
    return out;
  }
  for (let i = 0; i < ranked.length; i++) {
    const slot = breakdown.find((b) => b.rank === i + 1);
    if (slot) {
      out.set(String(ranked[i].player_id), Math.round(event.total_pot * slot.pct));
    }
  }
  return out;
}

export function findSkinsState(sideBets: SideBet[] | undefined): SkinsState | null {
  const sb = sideBets?.find((b) => b.type === "skins");
  return (sb?.state as SkinsState) ?? null;
}

export function formatString(event: EventRecord): string {
  const label =
    event.scoring_type === "stableford"
      ? "Stableford"
      : event.scoring_type === "net_stroke"
        ? "Net Stroke"
        : "Stroke";
  const entry = event.players.length > 0 ? Math.round(event.total_pot / event.players.length) : 0;
  return entry > 0 ? `${label} • $${entry} entry` : label;
}

// Compute Player[] in the existing UI shape from real event + side-bets.
// `prevPositions` lets us derive movement deltas across polls.
export function derivePlayers(
  event: EventRecord,
  sideBets: SideBet[] | undefined,
  prevPositions: Map<string, number>,
): { players: Player[]; positions: Map<string, number> } {
  const skins = findSkinsState(sideBets);
  const pars = event.hole_pars;

  const ranked = [...event.players].sort(
    (a, b) =>
      scoreVsField(a, pars, event.scoring_type) - scoreVsField(b, pars, event.scoring_type),
  );

  const payouts = projectedPayouts(event, ranked);
  const cashLine = event.payout_breakdown_json?.length ?? 0;

  const positions = new Map<string, number>();
  const players: Player[] = ranked.map((p, idx) => {
    const id = String(p.player_id);
    positions.set(id, idx + 1);
    const prev = prevPositions.get(id);
    const movement = prev != null ? prev - (idx + 1) : 0;
    const trend: Trend = movement > 0 ? "up" : movement < 0 ? "down" : "flat";

    const last = lastScoredHole(p.holeScores, pars);
    const team = teamForPlayer(p.player_id, idx, event.teams_json);

    // For stableford UIs that show "toPar"-style number we use diff (achieved-quota)
    const display =
      event.scoring_type === "stableford"
        ? p.achieved + (p.adjustment ?? 0) - p.quota
        : Math.round(scoreVsField(p, pars, event.scoring_type));

    const projected = payouts.get(id) ?? 0;
    const skinsCount = skinsCountFor(p.player_id, skins);

    // Bubble: within ±1 of last paying place
    const bubble = cashLine > 0 ? Math.abs(idx + 1 - cashLine) <= 1 && projected === 0 : false;
    const pressure = bubble
      ? `On the bubble — keep position to cash`
      : undefined;

    return {
      id,
      name: p.name,
      initials: initials(p.name),
      team,
      thru: thruHoles(p.holeScores),
      toPar: event.scoring_type === "stableford" ? -display : display,
      lastHole: last,
      trend,
      movement,
      projected,
      skins: skinsCount,
      bubble,
      pressure,
    };
  });

  return { players, positions };
}

export function deriveTeams(players: Player[]): Team[] {
  const groups: Record<"Eagles" | "Hawks", Player[]> = { Eagles: [], Hawks: [] };
  for (const p of players) groups[p.team].push(p);
  const mk = (id: string, name: "Eagles" | "Hawks", arr: Player[]): Team => {
    if (arr.length === 0)
      return { id, name, score: 0, thru: 0, projected: 0, trend: "flat" };
    const score = Math.round(arr.reduce((s, p) => s + p.toPar, 0) / arr.length);
    const thru = Math.round(arr.reduce((s, p) => s + p.thru, 0) / arr.length);
    const projected = arr.reduce((s, p) => s + p.projected, 0);
    const movementSum = arr.reduce((s, p) => s + p.movement, 0);
    const trend: Trend = movementSum > 0 ? "up" : movementSum < 0 ? "down" : "flat";
    return { id, name, score, thru, projected, trend };
  };
  return [mk("t1", "Eagles", groups.Eagles), mk("t2", "Hawks", groups.Hawks)];
}

export interface BoardEvent {
  name: string;
  eventCode: string;
  eventDate: string | null;
  format: string;
  pot: number;
  skinsPot: number;
  hole: number;
  totalHoles: number;
}

export function deriveEvent(event: EventRecord, sideBets: SideBet[] | undefined): BoardEvent {
  const skins = findSkinsState(sideBets);
  const maxThru = Math.max(0, ...event.players.map((p) => thruHoles(p.holeScores)));
  return {
    name: event.event_code ?? event.name,
    eventCode: event.event_code ?? event.name,
    eventDate: event.event_date ?? null,
    format: formatString(event),
    pot: event.total_pot,
    skinsPot: skins?.pot ?? 0,
    hole: Math.max(1, Math.min(18, maxThru || 1)),
    totalHoles: 18,
  };
}

export function deriveTickerItems(
  prevPlayers: Player[] | null,
  players: Player[],
): { tag: string; text: string }[] {
  const items: { tag: string; text: string }[] = [];
  if (!prevPlayers) {
    // First load — surface a few interesting facts
    const leader = players[0];
    if (leader) items.push({ tag: "LEAD", text: `${leader.name} leads at ${fmt(leader.toPar)}` });
    const skinHolder = players.find((p) => p.skins > 0);
    if (skinHolder) items.push({ tag: "SKIN", text: `${skinHolder.name} has ${skinHolder.skins} skin${skinHolder.skins > 1 ? "s" : ""}` });
    const bubble = players.find((p) => p.bubble);
    if (bubble) items.push({ tag: "BUBBLE", text: `${bubble.name} on the bubble` });
    return items.length ? items : [{ tag: "LIVE", text: "Live event in progress" }];
  }
  const prevById = new Map(prevPlayers.map((p) => [p.id, p]));
  for (const p of players) {
    const prev = prevById.get(p.id);
    if (!prev) continue;
    if (p.skins > prev.skins) items.push({ tag: "SKIN", text: `${p.name} won a skin` });
    if (p.toPar < prev.toPar)
      items.push({ tag: "BIRDIE", text: `${p.name} now ${fmt(p.toPar)}` });
    if (p.bubble && !prev.bubble)
      items.push({ tag: "BUBBLE", text: `${p.name} drops to the bubble` });
  }
  if (items.length === 0)
    items.push({ tag: "LIVE", text: "No movement since last refresh" });
  return items.slice(0, 6);
}

function fmt(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}
