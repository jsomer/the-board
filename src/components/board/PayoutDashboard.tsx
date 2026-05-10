import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, DollarSign, Trophy, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBoardData } from "@/lib/board/context";
import { listGroups, type EventGroup } from "@/lib/api/groups";
import { finalizeEvent, type FinalizeError } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventPlayer, EventRecord, SkinsState } from "@/lib/api/types";
import { scoreVsField, holeSkinValue } from "@/lib/board/derive";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RankedRow {
  rank: number;        // 1-based, ties share rank
  player: EventPlayer;
  payout: number;      // place payout only (excl. skins)
}

function formatScoreCell(p: EventPlayer, pars: number[], scoring: EventRecord["scoring_type"]): string {
  if (scoring === "stableford") {
    const diff = p.achieved + (p.adjustment ?? 0) - p.quota;
    return diff > 0 ? `+${diff}` : `${diff}`;
  }
  let s = 0;
  for (let i = 0; i < p.holeScores.length; i++) {
    if (p.holeScores[i] > 0) s += p.holeScores[i] - (pars[i] ?? 4);
  }
  if (s === 0) return "E";
  return s > 0 ? `+${s}` : `${s}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Rank players with shared ranks for ties on the sort score.
function rankPlayers(event: EventRecord): RankedRow[] {
  const pars = event.hole_pars;
  const scored = [...event.players].map((p) => ({
    p,
    s: scoreVsField(p, pars, event.scoring_type),
  }));
  scored.sort((a, b) => a.s - b.s);

  const rows: { player: EventPlayer; rank: number; sortScore: number }[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  scored.forEach((row, i) => {
    const rank = lastScore !== null && row.s === lastScore ? lastRank : i + 1;
    rows.push({ player: row.p, rank, sortScore: row.s });
    lastScore = row.s;
    lastRank = rank;
  });

  // Compute payouts with tie-splitting across ranks contained in payout_breakdown_json.
  const breakdown = Array.isArray(event.payout_breakdown_json) ? event.payout_breakdown_json : [];
  const pctByRank = new Map<number, number>();
  breakdown.forEach((b) => pctByRank.set(b.rank, b.pct));

  // Group by shared rank
  const groups = new Map<number, EventPlayer[]>();
  rows.forEach((r) => {
    const arr = groups.get(r.rank) ?? [];
    arr.push(r.player);
    groups.set(r.rank, arr);
  });

  const payoutByPlayer = new Map<string, number>();
  groups.forEach((players, rank) => {
    const occupiedRanks: number[] = [];
    for (let k = 0; k < players.length; k++) {
      const r = rank + k;
      if (pctByRank.has(r)) occupiedRanks.push(r);
    }
    const totalPct = occupiedRanks.reduce((s, r) => s + (pctByRank.get(r) ?? 0), 0);
    const totalDollars = Math.round(event.total_pot * totalPct);
    const each = players.length > 0 ? Math.round(totalDollars / players.length) : 0;
    players.forEach((p) => payoutByPlayer.set(String(p.player_id), each));
  });

  return rows.map(({ player, rank }) => ({
    rank,
    player,
    payout: payoutByPlayer.get(String(player.player_id)) ?? 0,
  }));
}

interface SkinRow {
  hole: number;
  label: string; // winner name | "carried" | "tied — dead" | "—"
  value: number; // dollars on this hole; 0 if not a paid winner
  winnerId: string | null;
}

function buildSkinRows(event: EventRecord, skins: SkinsState | null): SkinRow[] {
  if (!skins) return [];
  const playerName = new Map<string, string>(
    event.players.map((p) => [String(p.player_id), p.name]),
  );
  const holes = Array.isArray(skins.holes) ? skins.holes : [];
  const byHole = new Map(holes.map((h) => [h.hole, h]));
  const out: SkinRow[] = [];
  for (let h = 1; h <= 18; h++) {
    const sh = byHole.get(h);
    const leader = event.hole_leaders?.find((l) => l.hole === h);
    if (sh?.winner != null) {
      out.push({
        hole: h,
        label: playerName.get(String(sh.winner)) ?? `Player ${sh.winner}`,
        value: holeSkinValue(skins, h),
        winnerId: String(sh.winner),
      });
    } else if (leader && leader.status === "tied") {
      out.push({ hole: h, label: "tied — dead", value: 0, winnerId: null });
    } else if (sh && sh.carryIn > 0) {
      out.push({ hole: h, label: "carried", value: 0, winnerId: null });
    } else {
      out.push({ hole: h, label: "—", value: 0, winnerId: null });
    }
  }
  return out;
}

export function PayoutDashboard() {
  const { rawEvent, skins, eventId, refresh } = useBoardData();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [blockerError, setBlockerError] = useState<string | null>(null);

  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId!),
    enabled: eventId != null,
    refetchInterval: 8000,
  });
  const groups: EventGroup[] = groupsQ.data ?? [];

  const ranked = useMemo<RankedRow[]>(
    () => (rawEvent ? rankPlayers(rawEvent) : []),
    [rawEvent],
  );

  if (!rawEvent) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Load a live event to view the payout dashboard.
      </div>
    );
  }

  const isFinal = rawEvent.status === "final";
  const allApproved = groups.length > 0 && groups.every((g) => g.status === "approved");
  const incompleteGroups = groups.filter((g) => g.status !== "approved");
  const incompletePlayers = rawEvent.players.filter((p) => !p.round_complete);
  const allComplete = incompletePlayers.length === 0 && rawEvent.players.length > 0;
  const ready = allApproved && allComplete && !isFinal;

  const placeTotal = ranked.reduce((s, r) => s + r.payout, 0);
  const skinsPot = skins?.pot ?? 0;
  const remainder = Math.max(0, rawEvent.total_pot - placeTotal - skinsPot);

  const cashLine = rawEvent.payout_breakdown_json?.length ?? 0;
  const skinRows = buildSkinRows(rawEvent, skins);

  const handleFinalize = async () => {
    if (!eventId) return;
    setFinalizing(true);
    setBlockerError(null);
    try {
      await finalizeEvent(eventId);
      toast.success("Event finalized");
      setConfirmOpen(false);
      refresh();
    } catch (e) {
      const err = e as FinalizeError & ApiError;
      if (err.status === 409) {
        toast.error("This event is already finalized");
        refresh();
        setConfirmOpen(false);
      } else if (err.status === 400 && err.incomplete?.length) {
        const names = err.incomplete.map((p) => p.name).join(", ");
        setBlockerError(`Finalization failed — incomplete scores: ${names}`);
        setConfirmOpen(false);
      } else {
        toast.error("Could not finalize event", { description: err.message });
        setConfirmOpen(false);
      }
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-3">
      {isFinal && (
        <div className="flex items-center gap-2 rounded-2xl border border-money/40 bg-money/10 px-3 py-2 text-sm font-semibold text-money">
          <Lock className="h-4 w-4" /> Event finalized — results are locked.
        </div>
      )}

      {blockerError && (
        <div className="flex items-start gap-2 rounded-2xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{blockerError}</span>
        </div>
      )}

      {/* Section A — Readiness */}
      {!isFinal && (
        <div
          className={cn(
            "rounded-2xl border p-3.5 shadow-card",
            ready ? "border-money/40 bg-money/5" : "border-gold/40 bg-gold/5",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            {ready ? (
              <CheckCircle2 className="h-4 w-4 text-money" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-gold" />
            )}
            <h3 className="text-sm font-extrabold">
              {ready ? "Ready to finalize" : "Not ready to finalize"}
            </h3>
          </div>
          <ul className="space-y-1.5 text-[12px]">
            <ChecklistRow ok={allApproved} label="All groups approved">
              {!allApproved && incompleteGroups.length > 0 && (
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-muted-foreground">
                  {incompleteGroups.map((g) => (
                    <li key={g.id}>
                      {g.name} — <span className="capitalize">{g.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {groups.length === 0 && (
                <div className="ml-4 mt-0.5 text-muted-foreground">No groups defined yet.</div>
              )}
            </ChecklistRow>
            <ChecklistRow ok={allComplete} label="All scores complete">
              {!allComplete && (
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-muted-foreground">
                  {incompletePlayers.map((p) => (
                    <li key={p.player_id}>
                      {p.name} — {p.thru} hole{p.thru === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              )}
            </ChecklistRow>
          </ul>
        </div>
      )}

      {/* Section B — Final Standings */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-extrabold">
            {isFinal ? "Final standings" : "Projected standings"}
          </h3>
        </div>
        {ranked.length === 0 ? (
          <div className="text-sm text-muted-foreground">No players in this event.</div>
        ) : !rawEvent.payout_breakdown_json?.length ? (
          <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
            No payout structure configured.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Player</th>
                  <th className="px-2 py-1.5 text-right">Score</th>
                  <th className="px-2 py-1.5 text-right">Thru</th>
                  {isFinal && rawEvent.scoring_type === "stableford" && (
                    <th className="px-2 py-1.5 text-right">Δ</th>
                  )}
                  <th className="px-2 py-1.5 text-right">$</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, idx) => {
                  const showDivider = !isFinal && idx + 1 === cashLine;
                  const tied = ranked.filter((r) => r.rank === row.rank).length > 1;
                  const dollars = isFinal ? row.player.winnings ?? 0 : row.payout;
                  return (
                    <tr
                      key={row.player.player_id}
                      className={cn(
                        "border-t border-border",
                        showDivider && "border-b-2 border-b-primary/40",
                      )}
                    >
                      <td className="px-2 py-1.5 font-tabular font-bold">
                        {tied ? `T${row.rank}` : row.rank}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{row.player.name}</td>
                      <td className="px-2 py-1.5 text-right font-tabular">
                        {formatScoreCell(row.player, rawEvent.hole_pars, rawEvent.scoring_type)}
                        {rawEvent.scoring_type === "stableford" ? " pts" : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right font-tabular text-muted-foreground">
                        {row.player.thru}/18
                      </td>
                      {isFinal && rawEvent.scoring_type === "stableford" && (
                        <td className="px-2 py-1.5 text-right font-tabular text-muted-foreground">
                          {(row.player.adjustment ?? 0) > 0
                            ? `+${row.player.adjustment}`
                            : row.player.adjustment ?? 0}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right font-tabular font-extrabold text-money">
                        {dollars > 0 ? `$${dollars}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C — Skins */}
      {skins && (
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-extrabold">Skins</h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Pot ${skins.pot}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            {skinRows.map((r) => (
              <div key={r.hole} className="flex items-center justify-between">
                <span className="text-muted-foreground">Hole {r.hole}</span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-semibold",
                      r.winnerId ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.label}
                  </span>
                  {r.value > 0 && (
                    <span className="font-tabular font-bold text-money">${r.value}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section D — Pot Breakdown */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-money" />
          <h3 className="text-sm font-extrabold">Pot breakdown</h3>
        </div>
        <ul className="space-y-1.5 text-sm">
          <Row label="Total pot" value={`$${rawEvent.total_pot}`} bold />
          <Row label="Place payouts" value={`$${placeTotal}`} muted />
          {skins && <Row label="Skins" value={`$${skinsPot}`} muted />}
          <li className="border-t border-border pt-1.5">
            <Row
              label={remainder > 0 ? "Remainder — award manually" : "Remainder"}
              value={`$${remainder}`}
            />
          </li>
        </ul>
      </div>

      {/* Section E — Finalize */}
      {!isFinal && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!ready || finalizing}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider shadow-card transition-all",
            ready
              ? "bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] text-primary-foreground"
              : "bg-surface-2 text-muted-foreground",
            "disabled:opacity-50",
          )}
        >
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Finalize event
        </button>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !finalizing && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize this event?</DialogTitle>
            <DialogDescription>
              Once finalized, scores are locked and payouts are set. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {ranked.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-[12px]">
              <div className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">
                Awarding
              </div>
              {ranked
                .filter((r) => r.payout > 0)
                .map((r) => (
                  <div key={r.player.player_id} className="flex justify-between py-0.5">
                    <span>
                      {ordinal(r.rank)} — {r.player.name}
                    </span>
                    <span className="font-tabular font-bold text-money">${r.payout}</span>
                  </div>
                ))}
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={finalizing}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {finalizing && <Loader2 className="h-4 w-4 animate-spin" />}
              Yes, finalize
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecklistRow({
  ok,
  label,
  children,
}: {
  ok: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-money" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-gold" />
        )}
        <span className={cn("font-semibold", ok ? "text-foreground" : "text-foreground")}>
          {label}
        </span>
      </div>
      {children}
    </li>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(muted ? "text-muted-foreground" : "text-foreground", bold && "font-bold")}>
        {label}
      </span>
      <span className={cn("font-tabular", bold ? "font-extrabold" : "font-semibold")}>{value}</span>
    </div>
  );
}
