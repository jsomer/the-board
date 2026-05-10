// Real GameTracker API types

export type ScoringType = "stableford" | "gross_stroke" | "net_stroke";
export type EventStatus = "draft" | "final";

// Dollar-amount breakdown (newer shape). Either this object form or a legacy
// per-rank percentage array may come back from the API.
export interface PayoutBreakdownAmounts {
  firstPlaceAmt?: number;
  secondPlaceAmt?: number;
  thirdPlaceAmt?: number;
  fourthPlaceAmt?: number;
  placeAmounts?: number[]; // dynamic / ordered list of all paid places
  skinsAmt?: number;
  ctpsAmt?: number;
  otherAmt?: number;
}
export type PayoutBreakdownLegacy = { rank: number; pct: number }[];
export type PayoutBreakdownJson = PayoutBreakdownAmounts | PayoutBreakdownLegacy;

export interface PayoutRulesJson {
  firstPlacePct?: number;
  secondPlacePct?: number;
  thirdPlacePct?: number;
  fourthPlacePct?: number;
  placePcts?: number[];
  skinsPct?: number;
  ctpsPct?: number;
  otherPct?: number;
}

export interface EventPlayer {
  player_id: string | number;
  name: string;
  quota: number;
  achieved: number;
  adjustment: number;
  holeScores: number[]; // length 18; 0 = unscored
  thru: number;         // holes with a score > 0; computed by API
  round_complete: boolean; // true when thru === 18
  winnings?: number;       // place payout, populated after finalization
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
  members: Array<{ player_id: number; name: string }>;
}

export interface HoleLeader {
  hole: number;                                         // 1–18
  status: "unplayed" | "clear" | "tied";
  low_score: number | null;                             // target score to beat; null if unplayed
  holders: Array<{ player_id: number; name: string }>; // 1 = sole leader, 2+ = tied
  played_count: number;                                 // players who have scored this hole
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
  payout_breakdown_json?: PayoutBreakdownJson | null;
  payout_rules_json?: PayoutRulesJson | null;
  players: EventPlayer[];
  teams_json?: Record<string, string> | null;
  locked_holes?: number[];
  hole_leaders: HoleLeader[]; // live low-score holder per hole; length 18
}

export interface MeResponse {
  playerId: number | null;
  isAdmin?: boolean;
}

export type GameSetupScoringType = "gross_stroke" | "net_stroke" | "stableford";
export type GameSetupHandicapSource = "usga" | "game_points";
export type GameSetupScoringScope = "overall" | "front_back" | "front_back_overall";

export interface StablefordPointsJson {
  eagle?: number;
  birdie?: number;
  par?: number;
  bogey?: number;
  double_or_worse?: number;
  [key: string]: number | undefined;
}

export interface GameSetupPayoutRulesJson {
  firstPlacePct?: number;
  secondPlacePct?: number;
  thirdPlacePct?: number;
  fourthPlacePct?: number;
  placePcts?: number[];
  skinsPct?: number;
  ctpsPct?: number;
  otherPct?: number;
}

export interface PointsRulesJson {
  winPoints?: number;
  topThreePoints?: number;
  participationPoints?: number;
  [key: string]: number | undefined;
}

export interface GameSetup {
  id: number;
  user_id?: number;
  name: string;
  entry_fee?: number | null;
  scoring_type: GameSetupScoringType | string;
  handicap_source?: GameSetupHandicapSource | string;
  scoring_scope?: GameSetupScoringScope | string;
  stableford_points_json?: StablefordPointsJson | null;
  payout_rules_json?: GameSetupPayoutRulesJson | null;
  points_rules_json?: PointsRulesJson | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserSettings {
  user_id: number;
  defaultGameSetupId: number | null;
  updated_at?: string;
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
