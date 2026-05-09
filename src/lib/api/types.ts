// Real GameTracker API types

export type ScoringType = "stableford" | "gross_stroke" | "net_stroke";
export type EventStatus = "draft" | "final";

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
  event_code: string;        // auto-generated 6-char alphanumeric, primary display identifier
  name: string;              // legacy field, set to event_code on creation
  event_date?: string | null;
  course_name?: string;
  scoring_type: ScoringType;
  status: EventStatus;
  total_pot: number;
  hole_pars: number[]; // length 18
  payout_breakdown_json?: { rank: number; pct: number }[] | null;
  players: EventPlayer[];
  teams_json?: Record<string, string> | null;
  locked_holes?: number[];
}

export interface MeResponse {
  playerId: number | null;
  isAdmin?: boolean;
}

export interface GameSetup {
  id: number;
  name: string;
  scoring_type: "gross_stroke" | "net_stroke" | "stableford" | string;
  entry_fee?: number | null;
}

export interface Course {
  id: number;
  name: string;
}

export interface PlayerRecord {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  usga_handicap?: number | null;
  game_points_needed?: number | null;
}

export interface CreateEventPayload {
  name: string;
  gameSetupId: number;
  eventDate?: string;
  startTime?: string;
  courseId?: number | null;
  entryFee?: number;
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
  isAdmin?: boolean;
  user?: { id?: number; email?: string; isAdmin?: boolean } | null;
}
