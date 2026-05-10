import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Flame, TrendingUp, TrendingDown, Minus, Flag, Trophy } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { quotasFromEvent, skinRowsFromHoleLeaders, skinRowsFromState, type HoleSkin } from "@/lib/board/quotaSkins";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";

// Fallback quota when the event doesn't list this player (mock-data path only)
const DEFAULT_QUOTA = 30;

function pointsFor(p: Player): number {
  // Approximate: average points-per-hole based on toPar across thru
  // Use a deterministic synthetic distribution per player so totals look real
  const base = Math.max(0, p.thru * 2 - p.toPar * 2 + p.skins);
  return base;
}

type Row = {
  player: Player;
  points: number;
  quota: number;
  diff: number;       // points - quota (positive = beating quota)
  pace: number;       // projected final points at current rate
  skinsWon: number;
  skinsValue: number;
};

export function QuotaLeaderboardPage() {
  const { players: seedPlayers, event: boardEvent, rawEvent, skins } = useBoardData();
  const event = boardEvent;

  const quotas = useMemo(() => quotasFromEvent(rawEvent), [rawEvent]);
  const skinResults: HoleSkin[] = useMemo(() => {
    const fromLeaders = skinRowsFromHoleLeaders(rawEvent);
    return fromLeaders.length > 0 ? fromLeaders : skinRowsFromState(skins);
  }, [rawEvent, skins]);

  const rows: Row[] = useMemo(() => {
    const skinsByPid = skinResults.reduce<Record<string, { count: number; value: number }>>((acc, s) => {
      if (!s.winner) return acc;
      acc[s.winner] = acc[s.winner] ?? { count: 0, value: 0 };
      acc[s.winner].count += 1;
      acc[s.winner].value += s.value;
      return acc;
    }, {});

    return seedPlayers
      .map<Row>((p) => {
        // Prefer real per-player numbers from the event when available
        const ep = rawEvent?.players.find((rp) => String(rp.player_id) === p.id);
        const points = ep ? ep.achieved + (ep.adjustment ?? 0) : pointsFor(p);
        const quota = ep?.quota ?? quotas[p.id] ?? DEFAULT_QUOTA;
        const pace = p.thru > 0 ? Math.round((points / p.thru) * 18) : 0;
        const s = skinsByPid[p.id] ?? { count: 0, value: 0 };
        return {
          player: p,
          points,
          quota,
          diff: points - Math.round((quota * p.thru) / 18),
          pace,
          skinsWon: s.count,
          skinsValue: s.value,
        };
      })
      .sort((a, b) => b.diff - a.diff || b.points - a.points);
  }, [seedPlayers, rawEvent, quotas, skinResults]);

  const skinWinners = useMemo(() => {
    return skinResults
      .filter((s) => s.winner)
      .map((s) => ({ ...s, player: seedPlayers.find((p) => p.id === s.winner)! }))
      .filter((s) => s.player);
  }, [skinResults, seedPlayers]);

  const carries = skinResults.filter((s) => !s.winner);

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      {/* Header */}
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Board
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-money/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-money">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-money" /> Live · H{event.hole}
            </span>
            <ThemeSwitcher />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-gold" />
          <h1 className="text-xl font-extrabold tracking-tight">Leaderboard</h1>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Points vs Quota
          </span>
        </div>
      </header>

      {/* Column header */}
      <div className="mx-4 mt-1 grid grid-cols-[28px_1fr_44px_56px_52px_44px] items-center gap-2 px-2 pb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Thru</span>
        <span className="text-right">Pts/Quota</span>
        <span className="text-right">vs Pace</span>
        <span className="text-right">Skins</span>
      </div>

      {/* Player rows */}
      <ul className="mx-4 space-y-1.5">
        {rows.map((r, i) => {
          const leader = i === 0;
          const beating = r.diff > 0;
          return (
          <li key={r.player.id}>
            <Link
              to="/player/$playerId"
              params={{ playerId: r.player.id }}
              className={cn(
                "grid grid-cols-[28px_1fr_44px_56px_52px_44px] items-center gap-2 rounded-2xl border px-2 py-2.5 transition-all active:scale-[0.99] hover:border-primary/40",
                leader
                  ? "border-transparent bg-gradient-to-r from-gold/15 via-gold/5 to-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--gold)_35%,transparent)]"
                  : "border-border bg-card",
              )}
            >
              <span className={cn(
                "font-tabular text-center text-[13px] font-extrabold",
                leader ? "text-gold" : "text-muted-foreground",
              )}>
                {i + 1}
              </span>

              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "h-7 w-1 rounded-full",
                  r.player.team === "Eagles" ? "bg-primary" : "bg-bubble",
                )} />
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold",
                  r.player.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
                )}>
                  {r.player.initials}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold leading-tight">{r.player.name}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {fmtToPar(r.player.toPar)} · pace {r.pace}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="font-tabular text-sm font-extrabold leading-none">{r.player.thru}</span>
                <Flag className="mt-0.5 h-2.5 w-2.5 text-muted-foreground" />
              </div>

              <div className="flex flex-col items-end">
                <span className="font-tabular text-base font-extrabold leading-none">
                  {r.points}<span className="text-muted-foreground/60">/{r.quota}</span>
                </span>
                <QuotaBar points={r.points} quota={r.quota} thru={r.player.thru} />
              </div>

              <div className="flex flex-col items-end">
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-tabular text-[11px] font-extrabold",
                  beating
                    ? "bg-money/15 text-money"
                    : r.diff < 0
                      ? "bg-down/15 text-down"
                      : "bg-surface-2 text-muted-foreground",
                )}>
                  {beating ? <TrendingUp className="h-2.5 w-2.5" /> : r.diff < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </span>
              </div>

              <div className="flex items-center justify-end gap-0.5">
                <Flame className={cn("h-3.5 w-3.5", r.skinsWon > 0 ? "text-gold" : "text-muted-foreground/30")} />
                <span className={cn(
                  "font-tabular text-sm font-extrabold",
                  r.skinsWon > 0 ? "text-gold" : "text-muted-foreground/40",
                )}>
                  {r.skinsWon}
                </span>
              </div>
            </Link>
            </li>
          );
        })}
      </ul>

      {/* Skin winners */}
      <section className="mx-4 mt-5">
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-4 w-4 text-gold" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Skins
          </h2>
        </div>

        <div className="rounded-2xl border border-border bg-card p-2 shadow-card">
          {skinWinners.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              No skins yet
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {skinWinners
                .slice()
                .sort((a, b) => a.hole - b.hole)
                .map((s) => {
                  const total = s.totalPlayers ?? 0;
                  const played = s.playedCount ?? 0;
                  const left = Math.max(0, total - played);
                  const locked = total > 0 && left === 0;
                  const scoreLabel = scoreToParLabel(s.score, s.par);
                  return (
                    <li key={s.hole} className="flex items-center gap-2 px-2 py-2">
                      <span className="font-tabular w-10 shrink-0 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        H{s.hole}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                          <span className="truncate">{s.player.name}</span>
                          {scoreLabel && (
                            <span className="font-tabular rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">
                              {scoreLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider">
                          {locked ? (
                            <span className="text-money">Skin locked in</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {left} player{left === 1 ? "" : "s"} left to post
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-tabular text-sm font-extrabold text-foreground">
                        {s.score ?? "—"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </section>

      <BottomNav active="cards" />
    </main>
  );
}

function QuotaBar({ points, quota, thru }: { points: number; quota: number; thru: number }) {
  const target = Math.max(1, Math.round((quota * thru) / 18));
  const pct = Math.min(120, Math.round((points / target) * 100));
  const beating = pct >= 100;
  return (
    <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-surface-2">
      <div
        className={cn("h-full rounded-full", beating ? "bg-money" : "bg-bubble")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function fmtToPar(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}
