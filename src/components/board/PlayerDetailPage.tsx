import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowDown, ArrowUp, DollarSign, Flame, Target, TrendingUp, TrendingDown, Minus, Trophy, Flag, Activity, Ruler, X, Lock, Pencil, Check, Loader2, CloudOff } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { quotasFromEvent, skinRowsFromState, type HoleSkin } from "@/lib/board/quotaSkins";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { useHoleScoreSync, type SyncStatus } from "@/hooks/useHoleScoreSync";
import { useHoleLocks } from "@/lib/board/holeLocks";
import { listGroups } from "@/lib/api/groups";

// Default quota when nothing is on the event yet
const DEFAULT_QUOTA = 30;

// Hole yardages (white tees) — mock distances per hole (no API field for this yet)
const DISTANCES = [402, 388, 521, 168, 415, 376, 196, 538, 431, 410, 182, 549, 433, 369, 421, 154, 506, 447];

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

const DEFAULT_PARS = [4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4];

/** Build hole rows. Uses real per-hole gross scores when present, else falls
 * back to a deterministic distribution that hits p.toPar across p.thru holes. */
function buildHoles(
  p: Player,
  pars: number[],
  skinResults: HoleSkin[],
  realScores?: number[],
): HoleRow[] {
  let offsets: (number | null)[];
  if (realScores && realScores.some((s) => s > 0)) {
    offsets = pars.map((par, idx) => {
      const s = realScores[idx];
      return s && s > 0 ? s - par : null;
    });
  } else {
    const rand = rngFor(p.id);
    const targetTotal = p.toPar;
    const synth: number[] = [];
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
      synth.push(off);
      running += off;
    }
    if (p.thru > 0) synth[p.thru - 1] += targetTotal - running;
    offsets = pars.map((_par, idx) => (idx < p.thru ? synth[idx] : null));
  }

  return pars.map((par, idx) => {
    const hole = idx + 1;
    const off = offsets[idx];
    const played = off != null;
    const score = played ? par + off : null;
    const points = played ? (POINTS_BY_OFFSET[off] ?? 0) : 0;
    const skin = skinResults.find((s) => s.hole === hole);
    const wonSkin = !!skin && skin.winner === p.id;
    return { hole, par, score, toPar: off, points, wonSkin, skinValue: skin?.value ?? 0 };
  });
}

export function PlayerDetailPage() {
  const { players: seedPlayers, event: boardEvent, rawEvent, skins, eventId, isMock } = useBoardData();
  const event = boardEvent;
  const { playerId } = useParams({ from: "/player/$playerId" });
  const player = seedPlayers.find((p) => p.id === playerId);
  const { meId, isAdmin } = useMe();
  const { locked } = useHoleLocks();

  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId!),
    enabled: eventId != null && !isMock,
    staleTime: 30_000,
  });
  const playerToGroup = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of groupsQ.data ?? []) {
      for (const m of g.members) map.set(Number(m.player_id), g.id);
    }
    return map;
  }, [groupsQ.data]);

  const { queue, clear, status, savedTick } = useHoleScoreSync(
    eventId,
    (pid) => playerToGroup.get(pid) ?? null,
  );

  const pars = rawEvent?.hole_pars && rawEvent.hole_pars.length === 18 ? rawEvent.hole_pars : DEFAULT_PARS;
  const skinResults = useMemo(() => skinRowsFromState(skins), [skins]);
  const quotas = useMemo(() => quotasFromEvent(rawEvent), [rawEvent]);

  if (!player) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <Trophy className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-extrabold">Player not found</h1>
        <Link to="/leaderboard" className="text-sm font-semibold text-primary">Back to leaderboard</Link>
      </main>
    );
  }

  const realPlayer = rawEvent?.players.find((rp) => String(rp.player_id) === player.id);
  const holes = useMemo(
    () => buildHoles(player, pars, skinResults, realPlayer?.holeScores),
    [player, pars, skinResults, realPlayer],
  );
  const totalPoints = realPlayer
    ? realPlayer.achieved + (realPlayer.adjustment ?? 0)
    : holes.reduce((sum, h) => sum + h.points, 0);
  const quota = realPlayer?.quota ?? quotas[player.id] ?? DEFAULT_QUOTA;
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
  const priorProjected = Math.max(0, player.projected - player.movement * 20);
  const projectedDelta = player.projected - priorProjected;

  // Field-wide hole-by-hole results for distribution + skin attribution
  const fieldHoles = useMemo(
    () => seedPlayers.map((p) => {
      const rp = rawEvent?.players.find((x) => String(x.player_id) === p.id);
      return { player: p, rows: buildHoles(p, pars, skinResults, rp?.holeScores) };
    }),
    [seedPlayers, pars, skinResults, rawEvent],
  );

  const [openHole, setOpenHole] = useState<number | null>(null);

  // Editing capability: real event, signed in, and either own player or admin.
  const canEditPlayer = !isMock && !!rawEvent && !!realPlayer && (isAdmin || (meId != null && meId === player.id));
  const setHoleScore = (hole: number, gross: number) => {
    if (!canEditPlayer || !realPlayer) return;
    if (locked.includes(hole)) return;
    const prev = realPlayer.holeScores[hole - 1] ?? 0;
    if (gross === prev) return;
    queue({ playerId: realPlayer.player_id, holeNumber: hole, grossScore: gross, prevScore: prev });
  };
  const clearHoleScore = (hole: number) => {
    if (!canEditPlayer || !realPlayer) return;
    if (locked.includes(hole)) return;
    clear({ playerId: realPlayer.player_id, holeNumber: hole });
  };

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
                <li key={h.hole}>
                  <button
                    type="button"
                    onClick={() => setOpenHole(h.hole)}
                    aria-label={`Edit hole ${h.hole}`}
                    className={cn("w-full rounded-xl border p-2 text-left transition-all active:scale-[0.97]", toneCls)}
                  >
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
                  </button>
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
                onClick={() => { setOpenHole(h.hole); jumpToHole(h.hole); }}
                aria-label={`Open hole ${h.hole}`}
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
          <NineRow label="OUT" holes={holes.slice(0, 9)} onOpen={setOpenHole} />
          <div className="my-2 h-px bg-border" />
          <NineRow label="IN" holes={holes.slice(9, 18)} onOpen={setOpenHole} />
        </div>
        <p className="mt-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tap any hole for details
        </p>
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

      <HoleDetailSheet
        holeNumber={openHole}
        onClose={() => setOpenHole(null)}
        playerRow={openHole ? holes[openHole - 1] : null}
        playerName={player.name}
        fieldHoles={fieldHoles}
        skinResults={skinResults}
        canEdit={canEditPlayer}
        isLocked={openHole != null && locked.includes(openHole)}
        syncStatus={status}
        savedTick={savedTick}
        onSetScore={setHoleScore}
        onClearScore={clearHoleScore}
      />
    </main>
  );
}

type FieldHoles = { player: Player; rows: HoleRow[] }[];

function HoleDetailSheet({
  holeNumber, onClose, playerRow, playerName, fieldHoles, skinResults,
  canEdit, isLocked, syncStatus, savedTick, onSetScore, onClearScore,
}: {
  holeNumber: number | null;
  onClose: () => void;
  playerRow: HoleRow | null;
  playerName: string;
  fieldHoles: FieldHoles;
  skinResults: HoleSkin[];
  canEdit: boolean;
  isLocked: boolean;
  syncStatus: SyncStatus;
  savedTick: number;
  onSetScore: (hole: number, gross: number) => void;
  onClearScore: (hole: number) => void;
}) {
  const open = holeNumber !== null && playerRow !== null;
  const par = playerRow?.par ?? 0;
  const distance = holeNumber ? DISTANCES[holeNumber - 1] : 0;
  const skin = holeNumber ? skinResults.find((s) => s.hole === holeNumber) : undefined;
  const skinWinner = skin?.winner ? fieldHoles.find((f) => f.player.id === skin.winner)?.player : null;

  // Field distribution across all players for this hole
  const buckets = useMemo(() => {
    const b = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, unscored: 0 };
    if (!holeNumber) return b;
    for (const f of fieldHoles) {
      const r = f.rows[holeNumber - 1];
      if (!r || r.score === null) { b.unscored++; continue; }
      const off = r.toPar ?? 0;
      if (off <= -2) b.eagle++;
      else if (off === -1) b.birdie++;
      else if (off === 0) b.par++;
      else if (off === 1) b.bogey++;
      else b.double++;
    }
    return b;
  }, [fieldHoles, holeNumber]);

  const playedCount = buckets.eagle + buckets.birdie + buckets.par + buckets.bogey + buckets.double;
  const dist: { key: keyof typeof buckets; label: string; tone: string }[] = [
    { key: "eagle",  label: "Eagle+", tone: "bg-money/80" },
    { key: "birdie", label: "Birdie", tone: "bg-money/50" },
    { key: "par",    label: "Par",    tone: "bg-surface-2" },
    { key: "bogey",  label: "Bogey",  tone: "bg-down/40" },
    { key: "double", label: "Double+", tone: "bg-down/70" },
  ];

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0 pt-2 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DrawerTitle className="text-xl font-extrabold">
                Hole {holeNumber} <span className="ml-1 text-muted-foreground">·</span>{" "}
                <span className="text-primary">Par {par}</span>
              </DrawerTitle>
              <DrawerDescription className="mt-0.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Ruler className="h-3 w-3" /> {distance} yds
                </span>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">{playerName}</span>
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        {/* Player's result on this hole */}
        {playerRow && (
          <div className={cn(
            "rounded-2xl border p-3",
            playerRow.score === null
              ? "border-border bg-card"
              : (playerRow.toPar ?? 0) < 0
                ? "border-money/30 bg-money/10"
                : (playerRow.toPar ?? 0) === 0
                  ? "border-border bg-card"
                  : "border-down/25 bg-down/5",
          )}>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your score</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-tabular text-3xl font-extrabold leading-none">
                    {playerRow.score ?? "—"}
                  </span>
                  {playerRow.score !== null && (
                    <span className="font-tabular text-sm font-bold text-muted-foreground">
                      {fmtToPar(playerRow.toPar ?? 0)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Points</div>
                <div className="mt-0.5 font-tabular text-2xl font-extrabold text-primary">{playerRow.points}</div>
              </div>
            </div>
          </div>
        )}

        {/* Skin */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold">
            <Flame className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Skin</div>
            <div className="text-sm font-extrabold">
              {skinWinner
                ? `${skinWinner.name} won this skin`
                : skin
                  ? "Carried — no outright winner"
                  : "Pending"}
            </div>
          </div>
          {skin && (
            <div className="font-tabular text-lg font-extrabold text-gold">${skin.value}</div>
          )}
        </div>

        {/* Field distribution */}
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Field scoring</h3>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {playedCount}/{fieldHoles.length} played
            </span>
          </div>
          {playedCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              No one through this hole yet
            </div>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-surface-2">
                {dist.map((d) => {
                  const v = buckets[d.key];
                  if (!v) return null;
                  const pct = (v / playedCount) * 100;
                  return <div key={d.key} className={cn("h-full", d.tone)} style={{ width: `${pct}%` }} />;
                })}
              </div>
              <ul className="mt-2 grid grid-cols-5 gap-1">
                {dist.map((d) => (
                  <li key={d.key} className="flex flex-col items-center rounded-lg border border-border bg-card px-1 py-1.5">
                    <span className={cn("mb-0.5 h-1.5 w-6 rounded-full", d.tone)} />
                    <span className="font-tabular text-sm font-extrabold leading-none">{buckets[d.key]}</span>
                    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{d.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* All players on this hole */}
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">All players</h3>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {playedCount} of {fieldHoles.length} completed hole {holeNumber}
            </span>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-card">
            {[...fieldHoles]
              .map((f) => ({ p: f.player, row: holeNumber ? f.rows[holeNumber - 1] : null }))
              .sort((a, b) => {
                const av = a.row?.score ?? Infinity;
                const bv = b.row?.score ?? Infinity;
                return av - bv;
              })
              .map(({ p, row }) => {
                const isMe = p.name === playerName;
                const isWinner = !!skinWinner && p.id === skinWinner.id;
                const off = row?.toPar ?? 0;
                const played = row && row.score !== null;
                const tone = !played
                  ? "text-muted-foreground"
                  : off < 0 ? "text-money" : off === 0 ? "text-foreground" : "text-down";
                const label = !played ? "—" : off <= -2 ? "Eagle" : off === -1 ? "Birdie" : off === 0 ? "Par" : off === 1 ? "Bogey" : "Double";
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-2.5 py-2",
                      isMe ? "border-primary/40 bg-primary/5" : "border-transparent",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-extrabold",
                      p.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
                    )}>
                      {p.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-bold">{p.name}</span>
                        {isMe && (
                          <span className="rounded-md bg-primary/15 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-primary">You</span>
                        )}
                        {isWinner && <Flame className="h-3 w-3 shrink-0 text-gold" />}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {p.team} · {played ? `${row!.points} pts` : "Not played"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("font-tabular text-lg font-extrabold leading-none", tone)}>
                        {played ? row!.score : "—"}
                      </div>
                      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        {played ? `${label} · ${fmtToPar(off)}` : "Pending"}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function NineRow({ label, holes, onOpen }: { label: string; holes: HoleRow[]; onOpen: (h: number) => void }) {
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
          <HoleCell key={h.hole} h={h} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function HoleCell({ h, onOpen }: { h: HoleRow; onOpen: (h: number) => void }) {
  const played = h.score !== null;
  const tone = !played
    ? "border-border bg-surface-2/40 text-muted-foreground/50 hover:bg-surface-2/70"
    : (h.toPar ?? 0) <= -1
      ? "border-money/30 bg-money/10 text-money hover:bg-money/20"
      : (h.toPar ?? 0) === 0
        ? "border-border bg-card text-foreground hover:bg-surface-2/60"
        : "border-down/25 bg-down/5 text-down hover:bg-down/15";
  return (
    <button
      type="button"
      onClick={() => onOpen(h.hole)}
      id={`hole-${h.hole}`}
      aria-label={`Hole ${h.hole} details`}
      className={cn(
        "relative flex flex-col items-center rounded-lg border px-1 py-1.5 scroll-mt-24 transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone,
      )}
    >
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
    </button>
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
