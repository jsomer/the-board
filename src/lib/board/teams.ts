// Local stub — replace with event.teams_json when backend ships team support.
// Maps player_id -> team name. Falls back to alternating Eagles/Hawks by index.

const STUB: Record<string, "Eagles" | "Hawks"> = {};

export function teamForPlayer(
  playerId: string | number,
  index: number,
  teamsJson?: Record<string, string> | null,
): "Eagles" | "Hawks" {
  if (teamsJson && teamsJson[String(playerId)]) {
    const t = teamsJson[String(playerId)];
    if (t === "Eagles" || t === "Hawks") return t;
  }
  if (STUB[String(playerId)]) return STUB[String(playerId)];
  return index % 2 === 0 ? "Eagles" : "Hawks";
}
