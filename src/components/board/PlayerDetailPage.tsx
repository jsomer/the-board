import { useEffect, useMemo } from "react";
import { Link, useParams, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowDown, ArrowUp, DollarSign, Flame, Target, TrendingUp, TrendingDown, Minus, Trophy, Flag, Activity } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";

// Same constants used on the leaderboard so the views stay consistent
const QUOTAS: Record<string, number> = {
  p1: 36, p2: 34, p3: 32, p4: 30, p5: 30, p6: 28, p7: 26, p8: 24,
};

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

// Course pars per hole (par-72)
const PARS = [4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4];

const POINTS_BY_OFFSET: Record<number, number> = { [-3]: 12, [-2]: 8, [-1]: 4, 0: 2, 1: 1 };

// Deterministic per-player score generator so each row tells a story
function rngFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

type HoleRow = { hole: number; par: number; score: number | null; toPar: number | null; points: number; wonSkin: boolean; skinValue: number };

function buildHoles(p: Player): HoleRow[] {
  const rand = rngFor(p.id);
  // Bias scoring so totals roughly match p.toPar across p.thru holes
  const targetTotal = p.toPar;
  const offsets: number[] = [];
  let running = 0;
  for (let i = 0; i < p.thru; i++) {
    const remaining = p.thru - i;
    const need = targetTotal - running;
    const avg = need / remaining;
    const r = rand();
    let off: number;
    if (avg <= -0.5) off = r < 0.6 ? -1 : 0;
    else if (avg >= 0.5) off = r < 0.55 ? 1 : r < 0.85 ? 0 : 2;
    else off = r < 0.18 ? -1 : r < 0.7 ? 0 : r < 0.92 ? 1 : 2;
    offsets.push(off);
    running += off;
  }
  // Snap last hole to hit target exactly
  if (p.thru > 0) offsets[p.thru - 1] += targetTotal - running;

  return PARS.map((par, idx) => {
    const hole = idx + 1;
    const played = idx < p.thru;
    const off = played ? offsets[idx] : null;
    const score = played ? par + (off as number) : null;
    const points = played ? (POINTS_BY_OFFSET[off as number] ?? 0) : 0;
    const skin = SKIN_RESULTS.find((s) => s.hole === hole);
    const wonSkin = !!skin && skin.winner === p.id;
    return {
      hole, par, score, toPar: off, points,
      wonSkin, skinValue: skin?.value ?? 0,
    };
  });
}

export function PlayerDetailPage() {
  const { players: seedPlayers, event: boardEvent } = useBoardData();
  const event = boardEvent;
  const { playerId } = useParams({ from: "/player/$playerId" });
  const player = seedPlayers.find((p) => p.id === playerId);

  if (!player) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <Trophy className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-extrabold">Player not found</h1>
        <Link to="/leaderboard" className="text-sm font-semibold text-primary">Back to leaderboard</Link>
      </main>
    );
  }

  const holes = useMemo(() => buildHoles(player), [player]);
  const totalPoints = holes.reduce((sum, h) => sum + h.points, 0);
  const quota = QUOTAS[player.id] ?? 30;
  const pacedTarget = Math.max(1, Math.round((quota * player.thru) / 18));
  const diff = totalPoints - pacedTarget;
  const pace = player.thru > 0 ? Math.round((totalPoints / player.thru) * 18) : 0;
  const skinsWon = holes.filter((h) => h.wonSkin);
  const skinsValue = skinsWon.reduce((sum, h) => sum + h.skinValue, 0);
  const beating = diff > 0;

  // Recent deltas (last 3 played holes, most recent first)
  const recent = holes.filter((h) => h.score !== null).slice(-3).reverse();

  // Position vs field + payout movement
  const sorted = [...seedPlayers].sort((a, b) => a.toPar - b.toPar);
  const position = sorted.findIndex((p) => p.id === player.id) + 1;
  const fieldSize = sorted.length;
  // Approximate prior projected from movement (each position ≈ ~$20 swing)
  const priorProjected = Math.max(0, player.projected - player.movement * 20);
  const projectedDelta = player.projected - priorProjected;

  const jumpToHole = (hole: number) => {
    const el = document.getElementById(`hole-${hole}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }],
        { duration: 450, easing: "ease-out" },
      );
    }
  };

  // Remember which player was opened so the Live Board can highlight + scroll to the row on return.
  useEffect(() => {
    try {
      sessionStorage.setItem("board:lastPlayerId", player.id);
    } catch {}
  }, [player.id]);

  const router = useRouter();
  const handleBack = () => {
    // Prefer browser back so router scrollRestoration restores the leaderboard scroll position.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      {/* Sticky prominent back bar */}
      <div className="sticky top-0 z-30 -mx-0 border-b border-border/60 bg-background/85 px-4 pb-2 pt-[max(env(safe-area-inset-top),10px)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back to Live Board"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-foreground shadow-card transition-all hover:bg-surface/80 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Live Board
          </button>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-money/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-money">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-money" /> Live · H{event.hole}
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="px-4 pb-3 pt-3">

        {/* Player hero */}
        <div className={cn(
          "mt-3 flex items-center gap-3 rounded-2xl border p-3",
          player.team === "Eagles"
            ? "border-primary/25 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent"
            : "border-bubble/25 bg-gradient-to-r from-bubble/15 via-bubble/5 to-transparent",
        )}>
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl text-base font-extrabold",
            player.team === "Eagles" ? "bg-primary/20 text-primary" : "bg-bubble/20 text-bubble",
          )}>
            {player.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-extrabold leading-tight">{player.name}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {player.team} · {fmtToPar(player.toPar)} thru {player.thru}
            </div>
          </div>
          <div className="text-right">
            <div className="font-tabular text-2xl font-extrabold leading-none">
              {totalPoints}
              <span className="text-base text-muted-foreground/60">/{quota}</span>
            </div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Points / Quota
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat
            label="vs Pace"
            value={`${diff > 0 ? "+" : ""}${diff}`}
            icon={beating ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            tone={beating ? "money" : diff < 0 ? "down" : "muted"}
          />
          <Stat label="Projected" value={String(pace)} icon={<Target className="h-3 w-3" />} tone="primary" />
          <Stat label="Skins" value={`${skinsWon.length} · $${skinsValue}`} icon={<Flame className="h-3 w-3" />} tone="gold" />
        </div>
      </header>

      {/* Projected payout */}
      <section className="mx-4 mt-3">
        <div className="mb-2 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-money" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Projected payout</h2>
          <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Pos {position}/{fieldSize}
          </span>
        </div>
        <div className={cn(
          "flex items-center gap-3 rounded-2xl border p-3 shadow-card",
          player.projected > 0
            ? "border-money/30 bg-gradient-to-r from-money/10 via-money/5 to-transparent"
            : "border-border bg-card",
        )}>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn(
                "font-tabular text-3xl font-extrabold leading-none",
                player.projected > 0 ? "text-money" : "text-muted-foreground",
              )}>
                {player.projected > 0 ? `$${player.projected}` : "—"}
              </span>
              {projectedDelta !== 0 && player.projected > 0 && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-tabular text-[11px] font-bold",
                  projectedDelta > 0 ? "bg-money/15 text-money" : "bg-down/15 text-down",
                )}>
                  {projectedDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  ${Math.abs(projectedDelta)}
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {player.movement > 0
                ? `Moved up ${player.movement} since last hole`
                : player.movement < 0
                  ? `Dropped ${Math.abs(player.movement)} since last hole`
                  : "Position holding steady"}
            </div>
          </div>
          {player.bubble && (
            <div className="rounded-xl border border-bubble/40 bg-bubble/10 px-2.5 py-1.5 text-right">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-bubble">
                <Flame className="h-3 w-3" /> Bubble
              </div>
              {player.pressure && (
                <div className="mt-0.5 max-w-[140px] text-[10px] font-semibold leading-tight text-bubble/90">
                  {player.pressure}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Recent deltas */}
      <section className="mx-4 mt-3">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Recent holes</h2>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Last {recent.length}
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            No holes played yet
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {recent.map((h) => {
              const off = h.toPar ?? 0;
              const label = off <= -2 ? "Eagle" : off === -1 ? "Birdie" : off === 0 ? "Par" : off === 1 ? "Bogey" : "Double";
              const tone = off < 0 ? "money" : off === 0 ? "muted" : "down";
              const toneCls = tone === "money" ? "border-money/30 bg-money/10 text-money" : tone === "down" ? "border-down/25 bg-down/10 text-down" : "border-border bg-card text-foreground";
              return (
                <li key={h.hole} className={cn("rounded-xl border p-2", toneCls)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">H{h.hole} · P{h.par}</span>
                    {h.wonSkin && <Flame className="h-3 w-3 text-gold" />}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-tabular text-xl font-extrabold leading-none">{h.score}</span>
                    <span className="font-tabular text-[10px] font-bold opacity-70">{fmtToPar(off)}</span>
                  </div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-70">
                    {label} · {h.points}p
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Jump to hole */}
      <section className="mx-4 mt-3">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Jump to hole</h2>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Thru {player.thru}/18
          </span>
        </div>
        <div className="grid grid-cols-9 gap-1 rounded-2xl border border-border bg-card p-2 shadow-card">
          {holes.map((h) => {
            const played = h.score !== null;
            const isCurrent = h.hole === player.thru;
            return (
              <button
                key={h.hole}
                type="button"
                onClick={() => jumpToHole(h.hole)}
                aria-label={`Jump to hole ${h.hole}`}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded-lg font-tabular text-[12px] font-extrabold transition-all active:scale-95",
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
                    : played
                      ? (h.toPar ?? 0) <= -1
                        ? "bg-money/15 text-money hover:bg-money/25"
                        : (h.toPar ?? 0) === 0
                          ? "bg-surface-2 text-foreground hover:bg-surface-2/70"
                          : "bg-down/10 text-down hover:bg-down/20"
                      : "bg-surface-2/40 text-muted-foreground/60 hover:bg-surface-2",
                )}
              >
                {h.hole}
                {h.wonSkin && (
                  <Flame className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-gold" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Hole-by-hole */}
      <section className="mx-4 mt-3">
        <div className="mb-2 flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Hole by hole</h2>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Front · Back
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-2 shadow-card">
          <NineRow label="OUT" holes={holes.slice(0, 9)} />
          <div className="my-2 h-px bg-border" />
          <NineRow label="IN" holes={holes.slice(9, 18)} />
        </div>
      </section>

      {/* Skins won */}
      <section className="mx-4 mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-4 w-4 text-gold" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Skins won</h2>
          {skinsWon.length > 0 && (
            <span className="ml-auto rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              ${skinsValue}
            </span>
          )}
        </div>

        {skinsWon.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            No skins claimed yet
          </div>
        ) : (
          <ul className="space-y-1.5">
            {skinsWon.map((h) => (
              <li key={h.hole} className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/20 font-tabular text-sm font-extrabold text-gold">
                  {h.hole}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-bold">Hole {h.hole} · Par {h.par}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Scored {h.score} ({fmtToPar(h.toPar ?? 0)}) · {h.points} pts
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-tabular text-base font-extrabold text-gold">+${h.skinValue}</div>
                  <Flame className="ml-auto h-3.5 w-3.5 text-gold" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav active="cards" />
    </main>
  );
}

function NineRow({ label, holes }: { label: string; holes: HoleRow[] }) {
  const totalScore = holes.reduce((s, h) => s + (h.score ?? 0), 0);
  const totalPar = holes.filter((h) => h.score !== null).reduce((s, h) => s + h.par, 0);
  const totalPts = holes.reduce((s, h) => s + h.points, 0);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-tabular text-[10px] font-bold text-muted-foreground">
          {totalScore || "—"} {totalPar ? `(${fmtToPar(totalScore - totalPar)})` : ""} · <span className="text-primary">{totalPts} pts</span>
        </span>
      </div>
      <div className="grid grid-cols-9 gap-1">
        {holes.map((h) => (
          <HoleCell key={h.hole} h={h} />
        ))}
      </div>
    </div>
  );
}

function HoleCell({ h }: { h: HoleRow }) {
  const played = h.score !== null;
  const tone = !played
    ? "border-border bg-surface-2/40 text-muted-foreground/50"
    : (h.toPar ?? 0) <= -1
      ? "border-money/30 bg-money/10 text-money"
      : (h.toPar ?? 0) === 0
        ? "border-border bg-card text-foreground"
        : "border-down/25 bg-down/5 text-down";
  return (
    <div id={`hole-${h.hole}`} className={cn("relative flex flex-col items-center rounded-lg border px-1 py-1.5 scroll-mt-24", tone)}>
      <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">H{h.hole}</span>
      <span className="font-tabular text-sm font-extrabold leading-none">
        {played ? h.score : "—"}
      </span>
      <span className="mt-0.5 text-[8px] font-semibold opacity-60">
        {played ? `${h.points}p` : `p${h.par}`}
      </span>
      {h.wonSkin && (
        <Flame className="absolute -right-0.5 -top-0.5 h-3 w-3 text-gold drop-shadow" />
      )}
    </div>
  );
}

function Stat({
  label, value, icon, tone,
}: { label: string; value: string; icon: React.ReactNode; tone: "money" | "down" | "muted" | "primary" | "gold" }) {
  const toneCls: Record<typeof tone, string> = {
    money: "bg-money/12 text-money",
    down: "bg-down/12 text-down",
    muted: "bg-surface-2 text-muted-foreground",
    primary: "bg-primary/12 text-primary",
    gold: "bg-gold/12 text-gold",
  };
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-2">
      <div className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", toneCls[tone])}>
        {icon}{label}
      </div>
      <div className="mt-1 font-tabular text-base font-extrabold leading-none">{value}</div>
    </div>
  );
}

function fmtToPar(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}
