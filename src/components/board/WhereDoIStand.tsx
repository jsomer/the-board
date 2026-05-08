import { useEffect, useMemo, useState } from "react";
import { Flame, TrendingUp, TrendingDown, Zap, Trophy, AlertTriangle, ChevronDown } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import { cn } from "@/lib/utils";

// Mirror of leaderboard skin results (mock fallback)
type HoleSkin = { hole: number; winner: string | null; value: number };
const FALLBACK_SKINS: HoleSkin[] = [
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

const FALLBACK_QUOTAS: Record<string, number> = {
  p1: 36, p2: 34, p3: 32, p4: 30, p5: 30, p6: 28, p7: 26, p8: 24,
};

function pointsForFallback(p: { thru: number; toPar: number; skins: number }): number {
  return Math.max(0, p.thru * 2 - p.toPar * 2 + p.skins);
}

export function WhereDoIStand({
  currentHole,
  scores,
  pars,
}: {
  currentHole: number;
  scores?: Record<string, Record<number, number | undefined>>;
  pars?: number[];
}) {
  const { players: livePlayers, skins: skinsState, rawEvent } = useBoardData();
  const [expanded, setExpanded] = useState(false);

  // "me" — first player as a sensible default (TODO: wire to current user)
  const ME_ID = livePlayers[0]?.id ?? "p1";
  const me = livePlayers.find((p) => p.id === ME_ID) ?? livePlayers[0];

  // Build per-hole skin records: from real SkinsState if present, else fallback
  const skinResults: HoleSkin[] = useMemo(() => {
    if (skinsState && rawEvent) {
      const perHoleBase = skinsState.participants.length > 0 ? skinsState.pot / 18 : 5;
      return skinsState.holes.map((h) => ({
        hole: h.hole,
        winner: h.winner != null ? String(h.winner) : null,
        value: Math.round((h.carryIn + 1) * perHoleBase),
      }));
    }
    return FALLBACK_SKINS;
  }, [skinsState, rawEvent]);

  // ── Live skin lead on the current hole ─────────────────────
  const liveLead = useMemo(() => {
    if (!scores || !pars) return null;
    const par = pars[currentHole - 1];
    const entries = livePlayers
      .map((p) => ({ p, stroke: scores[p.id]?.[currentHole] }))
      .filter((e): e is { p: typeof livePlayers[number]; stroke: number } => e.stroke != null);
    if (entries.length === 0) return null;
    const lowest = Math.min(...entries.map((e) => e.stroke));
    const leaders = entries.filter((e) => e.stroke === lowest);
    const myStroke = scores[ME_ID]?.[currentHole];
    return { leaders, stroke: lowest, par, tied: leaders.length > 1, myStroke };
  }, [scores, pars, currentHole, livePlayers, ME_ID]);

  // ── Single-line action hint (merged skin lead + next change) ─
  const action = useMemo(() => {
    if (!pars) return null;
    const par = pars[currentHole - 1];
    if (!liveLead) {
      return { tone: "neutral" as const, headline: `H${currentHole} open`, detail: `${labelForScore(par - 1, par)} sets the bar` };
    }
    const { stroke, tied, myStroke, leaders } = liveLead;
    const lead = tied
      ? `Tied @ ${labelForScore(stroke, par)}`
      : `${leaders[0].p.initials} ${labelForScore(stroke, par)}`;
    const meLeadsAlone = !tied && leaders[0].p.id === ME_ID;
    if (myStroke == null) {
      const toTake = stroke - 1;
      if (toTake < 1) return { tone: "down" as const, headline: lead, detail: `Locked — skin gone` };
      return { tone: "primary" as const, headline: lead, detail: `Need ${labelForScore(toTake, par)} to steal` };
    }
    if (meLeadsAlone) return { tone: "gold" as const, headline: `You lead — ${labelForScore(stroke, par)}`, detail: `Lower steals, match = carry` };
    if (tied && leaders.some((l) => l.p.id === ME_ID))
      return { tone: "bubble" as const, headline: `You're tied`, detail: `Lower flips the skin` };
    const need = stroke - 1;
    if (need < 1) return { tone: "down" as const, headline: lead, detail: `Skin locked` };
    return { tone: "down" as const, headline: lead, detail: `Need ${labelForScore(need, par)} to flip` };
  }, [liveLead, pars, currentHole, ME_ID]);

  // ── Skins math ─────────────────────────────────────────────
  const mySkins = skinResults.filter((s) => s.winner === ME_ID);
  const mySkinValue = mySkins.reduce((sum, s) => sum + s.value, 0);

  const carryFromBack = skinResults
    .filter((s) => s.hole < currentHole && s.winner === null)
    .reduce((sum, s) => sum + s.value, 0);

  const liveHoleSkin = skinResults.find((s) => s.hole === currentHole);
  const liveValue = liveHoleSkin?.value ?? 5;
  const livePot = liveValue + carryFromBack;

  // ── Quota math ─────────────────────────────────────────────
  const realMe = rawEvent?.players.find((p) => String(p.player_id) === ME_ID);
  const myPoints = realMe
    ? realMe.achieved + (realMe.adjustment ?? 0)
    : me ? pointsForFallback(me) : 0;
  const myQuota = realMe?.quota ?? FALLBACK_QUOTAS[ME_ID] ?? 30;
  const meThru = me?.thru ?? 0;
  const pacedTarget = Math.max(1, Math.round((myQuota * meThru) / 18));
  const quotaDiff = myPoints - pacedTarget;
  const projectedPoints = meThru > 0 ? Math.round((myPoints / meThru) * 18) : 0;
  const projectedDiff = projectedPoints - myQuota;
  const beatingQuota = quotaDiff >= 0;
  const pct = Math.min(120, Math.round((myPoints / pacedTarget) * 100));

  const pressure = useMemo(() => {
    if (projectedDiff >= 3 && mySkins.length >= 2)
      return { tone: "leader" as const, text: `Crushing · +${projectedDiff} pace, ${mySkins.length} skins` };
    if (beatingQuota && projectedDiff >= 0)
      return { tone: "leader" as const, text: `Beating quota by ${quotaDiff}` };
    if (quotaDiff === 0)
      return { tone: "bubble" as const, text: `On pace — birdie to pull ahead` };
    return { tone: "down" as const, text: `${Math.abs(quotaDiff)} under pace` };
  }, [beatingQuota, quotaDiff, projectedDiff, mySkins.length]);

  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 800);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  const carries = skinResults.filter((s) => !s.winner).length;

  const actionToneText =
    action?.tone === "gold" ? "text-gold"
    : action?.tone === "primary" ? "text-primary"
    : action?.tone === "bubble" ? "text-bubble"
    : action?.tone === "down" ? "text-down"
    : "text-foreground";

  return (
    <section className="mx-4 mt-3 overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      {/* Hero row — three big stats, glanceable */}
      <div className="grid grid-cols-3 divide-x divide-border">
        <Stat
          label="Skins"
          value={String(mySkins.length)}
          sub={`$${mySkinValue}`}
          tone="gold"
          icon={<Flame className="h-4 w-4" />}
        />
        <Stat
          label="Pts/Quota"
          value={`${myPoints}/${myQuota}`}
          sub={beatingQuota ? `+${quotaDiff}` : `${quotaDiff}`}
          tone={beatingQuota ? "money" : "down"}
          icon={beatingQuota ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        />
        <Stat
          label={`H${currentHole} Pot`}
          value={`$${livePot}`}
          sub={carryFromBack > 0 ? `+$${carryFromBack}` : `base`}
          tone="primary"
          icon={<Zap className="h-4 w-4" />}
          pulse={pulse}
        />
      </div>

      {/* Single action line — what to do RIGHT NOW */}
      {action && (
        <div className={cn(
          "flex items-center gap-3 border-t border-border px-4 py-3",
          action.tone === "gold" && "bg-gold/10",
          action.tone === "primary" && "bg-primary/10",
          action.tone === "bubble" && "bg-bubble/10",
          action.tone === "down" && "bg-down/10",
          action.tone === "neutral" && "bg-surface-2",
        )}>
          <Flame className={cn("h-5 w-5 shrink-0", actionToneText)} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className={cn("text-base font-extrabold tracking-tight", actionToneText)}>
              {action.headline}
            </div>
            <div className="text-[13px] font-semibold text-foreground/80">
              {action.detail}
            </div>
          </div>
        </div>
      )}

      {/* Pressure callout — bold, single line */}
      <div className={cn(
        "flex items-center gap-2 border-t border-border px-4 py-3 text-base font-extrabold",
        pressure.tone === "leader" && "bg-gold/15 text-gold",
        pressure.tone === "bubble" && "bg-bubble/15 text-bubble",
        pressure.tone === "down" && "bg-down/15 text-down",
      )}>
        {pressure.tone === "leader" ? <Trophy className="h-5 w-5 shrink-0" /> :
         pressure.tone === "bubble" ? <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" /> :
         <TrendingDown className="h-5 w-5 shrink-0" />}
        <span className="truncate">{pressure.text}</span>
      </div>

      {/* Expand toggle — thumb target */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-surface/50 py-3 text-sm font-bold uppercase tracking-wider text-muted-foreground active:bg-surface-2"
        aria-expanded={expanded}
      >
        {expanded ? "Hide details" : `Pace & ${carries} carries`}
        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Quota progress bar */}
          <div className="px-4 pb-3 pt-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted-foreground">Pace · thru {me.thru}</span>
              <span className={cn("font-tabular", beatingQuota ? "text-money" : "text-down")}>
                Proj {projectedPoints} ({projectedDiff >= 0 ? `+${projectedDiff}` : projectedDiff})
              </span>
            </div>
            <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="absolute inset-y-0 left-[83.3%] w-px bg-foreground/40" aria-hidden />
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  beatingQuota ? "bg-money" : "bg-bubble",
                )}
                style={{ width: `${Math.min(100, (pct / 120) * 100)}%` }}
              />
            </div>
          </div>

          {/* Carries on board */}
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Carries · {carries} open
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skinResults.filter((s) => !s.winner).map((s) => (
                <span
                  key={s.hole}
                  className={cn(
                    "rounded-lg px-2 py-1 font-tabular text-sm font-extrabold",
                    s.hole === currentHole
                      ? "bg-gold text-background animate-pulse"
                      : "bg-gold/15 text-gold",
                  )}
                >
                  H{s.hole}·${s.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
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
    <div className="flex flex-col items-center justify-center px-2 py-4">
      <div className={cn("flex items-center gap-1 text-xs font-bold uppercase tracking-wider", toneCls)}>
        {icon}<span>{label}</span>
      </div>
      <div className={cn(
        "mt-1 font-tabular text-3xl font-black leading-none transition-transform",
        toneCls,
        pulse && "scale-110",
      )}>
        {value}
      </div>
      <div className="mt-1 text-sm font-bold text-foreground/70">{sub}</div>
    </div>
  );
}

void event;

function labelForScore(stroke: number, par: number): string {
  const off = stroke - par;
  if (stroke === 1) return "Ace";
  if (off <= -3) return "Albatross";
  if (off === -2) return "Eagle";
  if (off === -1) return "Birdie";
  if (off === 0) return "Par";
  if (off === 1) return "Bogey";
  if (off === 2) return "Double";
  return `+${off}`;
}
