import { useEffect, useMemo, useState } from "react";
import { Flame, TrendingUp, TrendingDown, Target, Zap, Trophy, AlertTriangle } from "lucide-react";
import { players as seedPlayers, event } from "@/data/board";
import { cn } from "@/lib/utils";

// Mirror of leaderboard skin results so the strip is consistent
type HoleSkin = { hole: number; winner: string | null; value: number };
const SKIN_RESULTS: HoleSkin[] = [
  { hole: 1,  winner: "p1", value: 5 },
  { hole: 2,  winner: null, value: 5 },
  { hole: 3,  winner: "p3", value: 10 },
  { hole: 4,  winner: "p2", value: 5 },
  { hole: 5,  winner: null, value: 5 },
  { hole: 6,  winner: "p1", value: 10 },
  { hole: 7,  winner: "p2", value: 5 },
  { hole: 8,  winner: null, value: 5 },
  { hole: 9,  winner: "p1", value: 10 },
  { hole: 10, winner: "p3", value: 5 },
  { hole: 11, winner: null, value: 5 },
  { hole: 12, winner: "p2", value: 10 },
  { hole: 13, winner: "p1", value: 5 },
  { hole: 14, winner: null, value: 5 },
  { hole: 15, winner: "p3", value: 10 },
  { hole: 16, winner: "p1", value: 5 },
];

const ME_ID = "p1";

export function WhereDoIStand({ currentHole }: { currentHole: number }) {
  const me = seedPlayers.find((p) => p.id === ME_ID)!;

  // ── Skins math ─────────────────────────────────────────────
  const mySkins = SKIN_RESULTS.filter((s) => s.winner === ME_ID);
  const mySkinValue = mySkins.reduce((sum, s) => sum + s.value, 0);

  // Carry pot rolling forward into the next hole that has not yet been decided.
  // Anything before currentHole that has no winner contributes; the next live
  // hole holds that pot.
  const carryFromBack = SKIN_RESULTS
    .filter((s) => s.hole < currentHole && s.winner === null)
    .reduce((sum, s) => sum + s.value, 0);

  const liveHole = SKIN_RESULTS.find((s) => s.hole === currentHole);
  const liveValue = liveHole?.value ?? 5;
  const livePot = liveValue + carryFromBack;

  // Rivals — closest skin leaders by count
  const skinsByPid = SKIN_RESULTS.reduce<Record<string, { count: number; value: number }>>((acc, s) => {
    if (!s.winner) return acc;
    acc[s.winner] = acc[s.winner] ?? { count: 0, value: 0 };
    acc[s.winner].count += 1;
    acc[s.winner].value += s.value;
    return acc;
  }, {});
  const ranking = Object.entries(skinsByPid)
    .map(([pid, v]) => ({ pid, ...v }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const myRank = Math.max(1, ranking.findIndex((r) => r.pid === ME_ID) + 1);
  const leadingSkins = ranking[0];
  const closestRival = ranking.find((r) => r.pid !== ME_ID);
  const isLeader = leadingSkins?.pid === ME_ID;
  const gapToLeader = isLeader ? 0 : (leadingSkins?.count ?? 0) - mySkins.length;
  const gapToRival = closestRival ? mySkins.length - closestRival.count : 0;

  // Pressure copy
  const pressure = useMemo(() => {
    if (isLeader && gapToRival >= 2)
      return { tone: "leader" as const, text: `Skins lead by ${gapToRival} — defend the pot` };
    if (isLeader)
      return { tone: "leader" as const, text: `Skins leader by 1 — one slip and ${initials(closestRival?.pid)} ties you` };
    if (gapToLeader === 1)
      return { tone: "bubble" as const, text: `1 skin back of ${initials(leadingSkins?.pid)} — birdie this hole to tie` };
    return { tone: "down" as const, text: `${gapToLeader} skins back — need a run to catch up` };
  }, [isLeader, gapToRival, gapToLeader, leadingSkins?.pid, closestRival?.pid]);

  // Pulse the live pot every few seconds for that sportsbook feel
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 800);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  const carries = SKIN_RESULTS.filter((s) => !s.winner).length;

  return (
    <section className="mx-4 mt-3 overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      {/* Top status bar — gradient sportsbook strip */}
      <div className="relative bg-gradient-to-r from-[color-mix(in_oklab,var(--gold)_18%,var(--card))] via-card to-[color-mix(in_oklab,var(--primary)_15%,var(--card))] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-money/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-money">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-money" /> Live
          </span>
          <Target className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Where You Stand
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-extrabold",
              me.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble")}>
              {me.initials}
            </span>
            You
          </span>
        </div>
      </div>

      {/* Hero row — three big stats */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <Stat
          label="Your Skins"
          value={String(mySkins.length)}
          sub={`$${mySkinValue} won`}
          icon={<Flame className="h-3.5 w-3.5" />}
          tone="gold"
        />
        <Stat
          label="Skins Rank"
          value={`#${myRank}`}
          sub={isLeader ? "Leading" : `${gapToLeader} back`}
          icon={isLeader ? <Trophy className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          tone={isLeader ? "gold" : "down"}
        />
        <Stat
          label={`Hole ${currentHole} Pot`}
          value={`$${livePot}`}
          sub={carryFromBack > 0 ? `+$${carryFromBack} carry` : `${liveValue} base`}
          icon={<Zap className="h-3.5 w-3.5" />}
          tone="primary"
          pulse={pulse}
        />
      </div>

      {/* Pressure callout */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 text-[12px] font-bold",
        pressure.tone === "leader" && "bg-gold/10 text-gold",
        pressure.tone === "bubble" && "bg-bubble/10 text-bubble",
        pressure.tone === "down" && "bg-down/10 text-down",
      )}>
        {pressure.tone === "leader" ? <Trophy className="h-4 w-4 shrink-0" /> :
         pressure.tone === "bubble" ? <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" /> :
         <TrendingDown className="h-4 w-4 shrink-0" />}
        <span className="truncate">{pressure.text}</span>
      </div>

      {/* Carries & rival watch */}
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="px-3 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Carries on board
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-tabular text-lg font-extrabold text-gold">{carries}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">holes open</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {SKIN_RESULTS.filter((s) => !s.winner).map((s) => (
              <span
                key={s.hole}
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-tabular text-[9px] font-extrabold",
                  s.hole === currentHole
                    ? "bg-gold text-background animate-pulse"
                    : "bg-gold/15 text-gold",
                )}
              >
                H{s.hole}
              </span>
            ))}
          </div>
        </div>

        <div className="px-3 py-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Rival watch
          </div>
          {closestRival ? (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-extrabold",
                  rivalPlayer(closestRival.pid)?.team === "Eagles"
                    ? "bg-primary/15 text-primary"
                    : "bg-bubble/15 text-bubble",
                )}>
                  {initials(closestRival.pid)}
                </span>
                <span className="truncate text-[12px] font-bold">{rivalPlayer(closestRival.pid)?.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] font-bold">
                <Flame className="h-3 w-3 text-gold" />
                <span className="font-tabular text-gold">{closestRival.count} skins</span>
                <span className={cn(
                  "ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-tabular text-[10px] font-extrabold",
                  gapToRival > 0 ? "bg-money/15 text-money" :
                  gapToRival < 0 ? "bg-down/15 text-down" :
                  "bg-surface-2 text-muted-foreground",
                )}>
                  {gapToRival > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {gapToRival > 0 ? `+${gapToRival}` : gapToRival}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-muted-foreground">No rivals yet</div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label, value, sub, icon, tone, pulse,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode;
  tone: "gold" | "primary" | "down";
  pulse?: boolean;
}) {
  const toneCls =
    tone === "gold" ? "text-gold" :
    tone === "primary" ? "text-primary" :
    "text-down";
  return (
    <div className="flex flex-col items-center justify-center px-2 py-3">
      <div className={cn("flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider", toneCls)}>
        {icon}<span>{label}</span>
      </div>
      <div className={cn(
        "font-tabular text-2xl font-black leading-none transition-transform",
        toneCls,
        pulse && "scale-110",
      )}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{sub}</div>
    </div>
  );
}

function rivalPlayer(pid: string) {
  return seedPlayers.find((p) => p.id === pid);
}

function initials(pid?: string) {
  if (!pid) return "—";
  return seedPlayers.find((p) => p.id === pid)?.initials ?? "—";
}

void event;
