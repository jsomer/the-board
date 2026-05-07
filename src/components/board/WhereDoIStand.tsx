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

// Mirror of leaderboard quota config
const QUOTAS: Record<string, number> = {
  p1: 36, p2: 34, p3: 32, p4: 30, p5: 30, p6: 28, p7: 26, p8: 24,
};

function pointsFor(p: { thru: number; toPar: number; skins: number }): number {
  return Math.max(0, p.thru * 2 - p.toPar * 2 + p.skins);
}

export function WhereDoIStand({ currentHole }: { currentHole: number }) {
  const me = seedPlayers.find((p) => p.id === ME_ID)!;

  // ── Skins math ─────────────────────────────────────────────
  const mySkins = SKIN_RESULTS.filter((s) => s.winner === ME_ID);
  const mySkinValue = mySkins.reduce((sum, s) => sum + s.value, 0);

  const carryFromBack = SKIN_RESULTS
    .filter((s) => s.hole < currentHole && s.winner === null)
    .reduce((sum, s) => sum + s.value, 0);

  const liveHole = SKIN_RESULTS.find((s) => s.hole === currentHole);
  const liveValue = liveHole?.value ?? 5;
  const livePot = liveValue + carryFromBack;

  // ── Quota math ─────────────────────────────────────────────
  const myPoints = pointsFor(me);
  const myQuota = QUOTAS[ME_ID] ?? 30;
  const pacedTarget = Math.max(1, Math.round((myQuota * me.thru) / 18));
  const quotaDiff = myPoints - pacedTarget;
  const projectedPoints = me.thru > 0 ? Math.round((myPoints / me.thru) * 18) : 0;
  const projectedDiff = projectedPoints - myQuota;
  const beatingQuota = quotaDiff >= 0;
  const pct = Math.min(120, Math.round((myPoints / pacedTarget) * 100));

  // Pressure copy — combine skins + quota
  const pressure = useMemo(() => {
    if (projectedDiff >= 3 && mySkins.length >= 2)
      return { tone: "leader" as const, text: `Crushing — pacing +${projectedDiff} on quota with ${mySkins.length} skins` };
    if (beatingQuota && projectedDiff >= 0)
      return { tone: "leader" as const, text: `Beating quota by ${quotaDiff} — protect the run` };
    if (quotaDiff === 0)
      return { tone: "bubble" as const, text: `Right on quota pace — birdie this hole to pull ahead` };
    return { tone: "down" as const, text: `${Math.abs(quotaDiff)} pts under pace — need to ignite a run` };
  }, [beatingQuota, quotaDiff, projectedDiff, mySkins.length]);

  // Pulse the live pot
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
      {/* Top status bar */}
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
          label="Pts / Quota"
          value={`${myPoints}/${myQuota}`}
          sub={beatingQuota ? `+${quotaDiff} vs pace` : `${quotaDiff} vs pace`}
          icon={beatingQuota ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          tone={beatingQuota ? "money" : "down"}
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

      {/* Quota progress bar */}
      <div className="px-3 pt-2.5">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Quota pace · thru {me.thru}</span>
          <span className={cn("font-tabular", beatingQuota ? "text-money" : "text-down")}>
            Proj {projectedPoints} ({projectedDiff >= 0 ? `+${projectedDiff}` : projectedDiff})
          </span>
        </div>
        <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          {/* 100% pace marker */}
          <div className="absolute inset-y-0 left-[83.3%] w-px bg-foreground/30" aria-hidden />
          <div
            className={cn(
              "h-full rounded-full transition-all",
              beatingQuota ? "bg-money" : "bg-bubble",
            )}
            style={{ width: `${Math.min(100, (pct / 120) * 100)}%` }}
          />
        </div>
      </div>

      {/* Pressure callout */}
      <div className={cn(
        "mt-2 flex items-center gap-2 px-3 py-2 text-[12px] font-bold",
        pressure.tone === "leader" && "bg-gold/10 text-gold",
        pressure.tone === "bubble" && "bg-bubble/10 text-bubble",
        pressure.tone === "down" && "bg-down/10 text-down",
      )}>
        {pressure.tone === "leader" ? <Trophy className="h-4 w-4 shrink-0" /> :
         pressure.tone === "bubble" ? <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" /> :
         <TrendingDown className="h-4 w-4 shrink-0" />}
        <span className="truncate">{pressure.text}</span>
      </div>

      {/* Carries on board */}
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Carries on board
          </span>
          <span className="font-tabular text-xs font-extrabold text-gold">{carries}</span>
          <span className="text-[10px] font-semibold text-muted-foreground">holes open</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
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
              H{s.hole} · ${s.value}
            </span>
          ))}
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
  tone: "gold" | "primary" | "down" | "money";
  pulse?: boolean;
}) {
  const toneCls =
    tone === "gold" ? "text-gold" :
    tone === "primary" ? "text-primary" :
    tone === "money" ? "text-money" :
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

void event;
