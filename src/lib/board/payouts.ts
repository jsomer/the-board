// Helpers for normalizing the two possible payout_breakdown_json shapes
// (legacy { rank, pct }[] vs the newer { firstPlaceAmt, ..., placeAmounts, skinsAmt, ctpsAmt, otherAmt })
// into a single editable model the UI can work with.
import type {
  EventRecord,
  PayoutBreakdownAmounts,
  PayoutBreakdownJson,
  PayoutBreakdownLegacy,
  PayoutRulesJson,
} from "@/lib/api/types";

export interface NormalizedPayouts {
  /** Ordered dollars per paid place (index 0 = 1st). */
  placeAmounts: number[];
  skinsAmt: number;
  ctpsAmt: number;
  otherAmt: number;
}

function isLegacy(b: PayoutBreakdownJson | null | undefined): b is PayoutBreakdownLegacy {
  return Array.isArray(b);
}

export function paidPlacesCount(b: PayoutBreakdownJson | null | undefined): number {
  if (!b) return 0;
  if (isLegacy(b)) return b.length;
  if (b.placeAmounts && b.placeAmounts.length > 0) return b.placeAmounts.length;
  // Count populated firstPlaceAmt..fourthPlaceAmt
  return [b.firstPlaceAmt, b.secondPlaceAmt, b.thirdPlaceAmt, b.fourthPlaceAmt].filter(
    (v) => typeof v === "number" && v > 0,
  ).length;
}

export function normalizePayouts(event: EventRecord): NormalizedPayouts {
  const total = event.total_pot ?? 0;
  const b = event.payout_breakdown_json;
  if (!b) {
    return { placeAmounts: [], skinsAmt: 0, ctpsAmt: 0, otherAmt: total };
  }
  if (isLegacy(b)) {
    const sorted = [...b].sort((a, c) => a.rank - c.rank);
    const placeAmounts = sorted.map((r) => Math.round(total * r.pct));
    const placeTotal = placeAmounts.reduce((s, n) => s + n, 0);
    return {
      placeAmounts,
      skinsAmt: 0,
      ctpsAmt: 0,
      otherAmt: Math.max(0, total - placeTotal),
    };
  }
  const obj = b as PayoutBreakdownAmounts;
  let placeAmounts: number[];
  if (obj.placeAmounts && obj.placeAmounts.length > 0) {
    placeAmounts = obj.placeAmounts.slice();
  } else {
    placeAmounts = [
      obj.firstPlaceAmt ?? 0,
      obj.secondPlaceAmt ?? 0,
      obj.thirdPlaceAmt ?? 0,
      obj.fourthPlaceAmt ?? 0,
    ];
    // trim trailing zeros to avoid showing empty 4th if not configured
    while (placeAmounts.length > 1 && placeAmounts[placeAmounts.length - 1] === 0) {
      placeAmounts.pop();
    }
  }
  return {
    placeAmounts,
    skinsAmt: obj.skinsAmt ?? 0,
    ctpsAmt: obj.ctpsAmt ?? 0,
    otherAmt: obj.otherAmt ?? 0,
  };
}

/** Build the PUT body — both the dollar breakdown and back-calculated percentages. */
export function buildPayoutUpdateBody(np: NormalizedPayouts, totalPot: number) {
  const safeTotal = totalPot > 0 ? totalPot : 1;
  const pct = (n: number) => Math.round((n / safeTotal) * 10000) / 10000; // 4dp
  const [a1 = 0, a2 = 0, a3 = 0, a4 = 0] = np.placeAmounts;
  const placeAmounts = np.placeAmounts.slice();

  const payoutBreakdown: PayoutBreakdownAmounts = {
    firstPlaceAmt: a1,
    secondPlaceAmt: a2,
    thirdPlaceAmt: a3,
    fourthPlaceAmt: a4,
    placeAmounts,
    skinsAmt: np.skinsAmt,
    ctpsAmt: np.ctpsAmt,
    otherAmt: np.otherAmt,
  };
  const payoutRules: PayoutRulesJson = {
    firstPlacePct: pct(a1) * 100,
    secondPlacePct: pct(a2) * 100,
    thirdPlacePct: pct(a3) * 100,
    fourthPlacePct: pct(a4) * 100,
    placePcts: placeAmounts.map((n) => pct(n) * 100),
    skinsPct: pct(np.skinsAmt) * 100,
    ctpsPct: pct(np.ctpsAmt) * 100,
    otherPct: pct(np.otherAmt) * 100,
  };
  return { payoutBreakdown, payoutRules };
}

export function sumPlaces(np: NormalizedPayouts): number {
  return np.placeAmounts.reduce((s, n) => s + n, 0);
}

/** Compute place payouts per player accounting for tied ranks (split combined pool evenly). */
export function placePayoutByRank(
  np: NormalizedPayouts,
  rows: { player_id: string | number; rank: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  // group by rank
  const groups = new Map<number, (string | number)[]>();
  for (const r of rows) {
    const a = groups.get(r.rank) ?? [];
    a.push(r.player_id);
    groups.set(r.rank, a);
  }
  groups.forEach((ids, rank) => {
    let pool = 0;
    for (let k = 0; k < ids.length; k++) {
      const slot = rank + k - 1; // 0-indexed
      pool += np.placeAmounts[slot] ?? 0;
    }
    const each = ids.length > 0 ? Math.round(pool / ids.length) : 0;
    ids.forEach((id) => out.set(String(id), each));
  });
  return out;
}
