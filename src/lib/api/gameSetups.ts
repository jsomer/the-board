import { z } from "zod";
import { api } from "./client";
import type {
  GameSetup,
  GameSetupHandicapSource,
  GameSetupPayoutRulesJson,
  GameSetupScoringScope,
  GameSetupScoringType,
  PointsRulesJson,
  StablefordPointsJson,
  UserSettings,
} from "./types";

// ---------- Enums ----------

export const SCORING_TYPES: GameSetupScoringType[] = [
  "gross_stroke",
  "net_stroke",
  "stableford",
];
export const HANDICAP_SOURCES: GameSetupHandicapSource[] = ["usga", "game_points"];
export const SCORING_SCOPES: GameSetupScoringScope[] = [
  "overall",
  "front_back",
  "front_back_overall",
];

// ---------- Validation (camelCase request bodies) ----------

const stablefordPointsSchema = z
  .object({
    eagle: z.number().finite().optional(),
    birdie: z.number().finite().optional(),
    par: z.number().finite().optional(),
    bogey: z.number().finite().optional(),
    double_or_worse: z.number().finite().optional(),
  })
  .partial()
  .passthrough();

const payoutRulesSchema = z
  .object({
    firstPlacePct: z.number().min(0).max(100).optional(),
    secondPlacePct: z.number().min(0).max(100).optional(),
    thirdPlacePct: z.number().min(0).max(100).optional(),
    fourthPlacePct: z.number().min(0).max(100).optional(),
    placePcts: z.array(z.number().min(0).max(100)).optional(),
    skinsPct: z.number().min(0).max(100).optional(),
    ctpsPct: z.number().min(0).max(100).optional(),
    otherPct: z.number().min(0).max(100).optional(),
  })
  .strict();

const pointsRulesSchema = z
  .object({
    winPoints: z.number().finite().optional(),
    topThreePoints: z.number().finite().optional(),
    participationPoints: z.number().finite().optional(),
  })
  .partial()
  .passthrough();

export const createGameSetupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  entryFee: z.number({ invalid_type_error: "entryFee must be a number" }).min(0, "entryFee must be >= 0"),
  scoringType: z.enum(["gross_stroke", "net_stroke", "stableford"]),
  handicapSource: z.enum(["usga", "game_points"]),
  scoringScope: z.enum(["overall", "front_back", "front_back_overall"]),
  stablefordPoints: stablefordPointsSchema.optional(),
  payoutRules: payoutRulesSchema.optional(),
  pointsRules: pointsRulesSchema.optional(),
});

export const updateGameSetupSchema = createGameSetupSchema.partial();

export type CreateGameSetupInput = z.infer<typeof createGameSetupSchema>;
export type UpdateGameSetupInput = z.infer<typeof updateGameSetupSchema>;

// ---------- API error ----------

export interface GameSetupLockedDetail {
  code?: string;
  finalized_event_ids?: number[];
}

// ---------- Endpoints ----------

export function listGameSetups() {
  return api<GameSetup[]>("/game-setups");
}

export function getGameSetup(id: number | string) {
  return api<GameSetup>(`/game-setups/${id}`);
}

export function createGameSetup(input: CreateGameSetupInput) {
  const body = createGameSetupSchema.parse(input);
  return api<GameSetup>("/game-setups", { method: "POST", body });
}

export function updateGameSetup(id: number | string, input: UpdateGameSetupInput) {
  const body = updateGameSetupSchema.parse(input);
  return api<GameSetup>(`/game-setups/${id}`, { method: "PUT", body });
}

export function makeDefaultGameSetup(id: number | string) {
  return api<{ success: boolean; defaultGameSetupId: number }>(
    `/game-setups/${id}/make-default`,
    { method: "POST", body: {} },
  );
}

export function deleteGameSetup(id: number | string) {
  return api<{ success: boolean }>(`/game-setups/${id}`, { method: "DELETE" });
}

// ---------- Related ----------

export function getUserSettings() {
  return api<UserSettings>("/user/settings");
}

// ---------- Defaults (mirror server-side merge for client previews) ----------

export const DEFAULT_STABLEFORD_POINTS: StablefordPointsJson = {
  eagle: 8,
  birdie: 4,
  par: 2,
  bogey: 1,
  double_or_worse: 0,
};

export const DEFAULT_PAYOUT_RULES: GameSetupPayoutRulesJson = {
  firstPlacePct: 50,
  secondPlacePct: 30,
  thirdPlacePct: 20,
  skinsPct: 0,
  ctpsPct: 0,
  otherPct: 0,
};

export const DEFAULT_POINTS_RULES: PointsRulesJson = {
  winPoints: 10,
  topThreePoints: 5,
  participationPoints: 1,
};
