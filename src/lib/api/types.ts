// Real GameTracker API types

export type ScoringType = "stableford" | "stroke" | "net_stroke";
export type EventStatus = "draft" | "active" | "completed";

export interface EventPlayer {
  player_id: string | number;
  name: string;
  quota: number;
  achieved: number;
  adjustment: number;
  holeScores: number[]; // length 18; 0 = unscored
}

export interface EventRecord {
  id: number;
  name: string;
  course_name?: string;
  scoring_type: ScoringType;
  status: EventStatus;
  total_pot: number;
  hole_pars: number[]; // length 18
  payout_breakdown_json?: { rank: number; pct: number }[] | null;
  players: EventPlayer[];
  teams_json?: Record<string, string> | null; // playerId -> teamName (when backend ships it)
}

export interface SkinHole {
  hole: number; // 1..18
  winner: string | number | null;
  carryIn: number; // # of prior carried holes folded in
}

export interface SkinsState {
  pot: number;
  participants: (string | number)[];
  holes: SkinHole[];
}

export interface H2HSegmentScore {
  up: number;       // holes up for player A (negative = A is down)
  thru: number;
  remaining: number;
  status: "live" | "closed" | "ao"; // all-out / dormie etc
  closedAt?: number;
}

export interface H2HState {
  segment: "front" | "back" | "overall";
  playerA: string | number;
  playerB: string | number;
  score: H2HSegmentScore;
}

export interface NassauState {
  playerA: string | number;
  playerB: string | number;
  perSegment: number; // $ value per segment
  segments: H2HState[]; // front, back, overall
  doubled?: boolean;
  tripled?: boolean;
}

export type SideBet =
  | { type: "skins"; state: SkinsState }
  | { type: "h2h"; state: H2HState }
  | { type: "nassau"; state: NassauState }
  | { type: string; state: unknown };

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
