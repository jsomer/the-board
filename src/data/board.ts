export type Trend = "up" | "down" | "flat";

export type Player = {
  id: string;
  name: string;
  initials: string;
  team: "Eagles" | "Hawks";
  thru: number;          // holes completed (0-18)
  toPar: number;         // current score relative to par
  lastHole?: { hole: number; score: number; par: number };
  trend: Trend;
  movement: number;      // positions changed since last refresh
  projected: number;     // projected payout in $
  skins: number;
  pressure?: string;     // e.g. "Needs birdie on 18 to cash"
  bubble?: boolean;
};

export type Team = {
  id: string;
  name: "Eagles" | "Hawks";
  score: number;         // team to-par
  thru: number;
  projected: number;
  trend: Trend;
};

export const players: Player[] = [
  {
    id: "p1", name: "Jordan Reyes", initials: "JR", team: "Eagles",
    thru: 16, toPar: -6, lastHole: { hole: 16, score: 3, par: 4 },
    trend: "up", movement: 1, projected: 184, skins: 3,
  },
  {
    id: "p2", name: "Mason Cole", initials: "MC", team: "Hawks",
    thru: 16, toPar: -4, lastHole: { hole: 16, score: 4, par: 4 },
    trend: "flat", movement: 0, projected: 96, skins: 2,
  },
  {
    id: "p3", name: "Devin Park", initials: "DP", team: "Eagles",
    thru: 15, toPar: -3, lastHole: { hole: 15, score: 4, par: 5 },
    trend: "up", movement: 2, projected: 64, skins: 1,
    pressure: "Skin pending on 15",
  },
  {
    id: "p4", name: "Trey Walker", initials: "TW", team: "Hawks",
    thru: 16, toPar: -1, lastHole: { hole: 16, score: 5, par: 4 },
    trend: "down", movement: -2, projected: 24, skins: 0,
    bubble: true, pressure: "On the bubble — +$42 if holds",
  },
  {
    id: "p5", name: "Sam Ortiz", initials: "SO", team: "Eagles",
    thru: 15, toPar: 0, lastHole: { hole: 15, score: 5, par: 5 },
    trend: "flat", movement: 0, projected: 12, skins: 0,
    bubble: true, pressure: "Needs birdie on 18 to cash",
  },
  {
    id: "p6", name: "Kai Lin", initials: "KL", team: "Hawks",
    thru: 15, toPar: 2, lastHole: { hole: 15, score: 6, par: 5 },
    trend: "down", movement: -1, projected: 0, skins: 0,
  },
  {
    id: "p7", name: "Eli Brooks", initials: "EB", team: "Eagles",
    thru: 14, toPar: 4, lastHole: { hole: 14, score: 5, par: 4 },
    trend: "down", movement: 0, projected: 0, skins: 0,
  },
  {
    id: "p8", name: "Ryan Vega", initials: "RV", team: "Hawks",
    thru: 14, toPar: 5, lastHole: { hole: 14, score: 6, par: 4 },
    trend: "down", movement: -1, projected: 0, skins: 0,
  },
];

export const teams: Team[] = [
  { id: "t1", name: "Eagles", score: -9, thru: 16, projected: 320, trend: "up" },
  { id: "t2", name: "Hawks",  score: -2, thru: 16, projected: 120, trend: "down" },
];

export const tickerItems = [
  { tag: "BIRDIE", text: "Reyes drains a 14-footer on 16 — +$28 projected" },
  { tag: "SKIN",   text: "Skin carries on 15 — pot now $80" },
  { tag: "BUBBLE", text: "Walker drops to the bubble after bogey on 16" },
  { tag: "PRESSURE", text: "Ortiz needs birdie on 18 to cash" },
  { tag: "TEAM", text: "Eagles extend team lead to 7 strokes" },
];

export const event = {
  name: "Saturday Skins @ Pinehurst",
  format: "Stroke + Skins • $20 entry",
  pot: 320,
  skinsPot: 80,
  hole: 16,
  totalHoles: 18,
};
