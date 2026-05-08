import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Undo2, Flag, Cloud, CloudOff, Loader2, Zap, Lock } from "lucide-react";
import { toast } from "sonner";
import { useBoardData } from "@/lib/board/context";
import { useHoleScoreSync } from "@/hooks/useHoleScoreSync";
import { useHoleLocks } from "@/lib/board/holeLocks";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { WhereDoIStand } from "./WhereDoIStand";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4];

type Scores = Record<string, Record<number, number | undefined>>;

export function FastScoring() {
  const { players: seedPlayers, event, rawEvent, eventId } = useBoardData();
  const PARS = (rawEvent?.hole_pars && rawEvent.hole_pars.length === 18) ? rawEvent.hole_pars : DEFAULT_PARS;
  const { queue, status, savedTick } = useHoleScoreSync(eventId);

  // Derive scores from live event (so optimistic updates + polling reflect here);
  // fall back to seed data when not authed / mock mode.
  const scores: Scores = useMemo(() => {
    const map: Scores = {};
    if (rawEvent) {
      for (const p of rawEvent.players) {
        const pid = String(p.player_id);
        map[pid] = {};
        p.holeScores.forEach((s, i) => {
          if (s > 0) map[pid][i + 1] = s;
        });
      }
      return map;
    }
    for (const p of seedPlayers) {
      map[p.id] = {};
      for (let h = 1; h <= p.thru; h++)
        map[p.id][h] = PARS[h - 1] + (h === p.lastHole?.hole ? p.lastHole.score - p.lastHole.par : 0);
    }
    return map;
  }, [rawEvent, seedPlayers, PARS]);

  const [playerIdx, setPlayerIdx] = useState(0);
  const [hole, setHole] = useState(event.hole);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lastEntry, setLastEntry] = useState<{ pid: string; hole: number; prev?: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const player = seedPlayers[playerIdx] ?? seedPlayers[0];
  const par = PARS[hole - 1];
  const current = player ? scores[player.id]?.[hole] : undefined;
  const { locked: lockedHoles } = useHoleLocks();
  const isLocked = lockedHoles.includes(hole);

  // Quick options anchored to par
  const options = useMemo(() => {
    const make = (offset: number) => {
      const stroke = par + offset;
      const label = labelFor(stroke, par);
      return { stroke, offset, label };
    };
    return [-2, -1, 0, 1, 2, 3].map(make).filter((o) => o.stroke >= 1);
  }, [par]);

  // Flash "Saved" briefly whenever a server confirmation arrives
  useEffect(() => {
    if (savedTick === 0) return;
    setSavedFlash(true);
    const t = window.setTimeout(() => setSavedFlash(false), 900);
    return () => window.clearTimeout(t);
  }, [savedTick]);

  const enter = (stroke: number) => {
    if (!player) return;
    const prev = scores[player.id]?.[hole];
    setLastEntry({ pid: player.id, hole, prev });
    queue({
      playerId: player.id,
      holeNumber: hole,
      grossScore: stroke,
      prevScore: prev ?? 0,
    });
    // Auto-advance
    window.setTimeout(() => {
      if (playerIdx < seedPlayers.length - 1) setPlayerIdx((i) => i + 1);
      else {
        setPlayerIdx(0);
        setHole((h) => Math.min(18, h + 1));
      }
    }, 220);
  };

  const undo = () => {
    if (!lastEntry) return;
    queue({
      playerId: lastEntry.pid,
      holeNumber: lastEntry.hole,
      grossScore: lastEntry.prev ?? 0,
      prevScore: scores[lastEntry.pid]?.[lastEntry.hole] ?? 0,
    });
    setLastEntry(null);
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPlayerIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setPlayerIdx((i) => Math.min(seedPlayers.length - 1, i + 1));
      else if (e.key === "ArrowUp") setHole((h) => Math.min(18, h + 1));
      else if (e.key === "ArrowDown") setHole((h) => Math.max(1, h - 1));
      else if (/^[1-9]$/.test(e.key)) enter(parseInt(e.key, 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - s.t;
    if (dt > 500) return;
    if (adx > 50 && adx > ady) {
      if (dx < 0) setPlayerIdx((i) => Math.min(seedPlayers.length - 1, i + 1));
      else setPlayerIdx((i) => Math.max(0, i - 1));
    } else if (ady > 50 && ady > adx) {
      if (dy < 0) setHole((h) => Math.min(18, h + 1));
      else setHole((h) => Math.max(1, h - 1));
    }
    swipeRef.current = null;
  };

  const completed = Object.values(scores[player.id] ?? {}).filter((v) => v != null).length;

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      {/* Header */}
      <header className="px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Fast Scoring
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={status} flash={savedFlash} />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Where You Stand — live competitive context */}
      <WhereDoIStand currentHole={hole} scores={scores} pars={PARS} />

      {/* Hole pager */}
      <div className="mx-4 mt-3 flex items-stretch overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-card">
        <button
          aria-label="Previous hole"
          onClick={() => setHole((h) => Math.max(1, h - 1))}
          className="flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-3 py-3">
          <Flag className="h-4 w-4 text-gold" />
          <div className="font-tabular text-3xl font-extrabold leading-none">{hole}</div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Par</span>
            <span className="font-tabular text-lg font-bold leading-none">{par}</span>
          </div>
        </div>
        <button
          aria-label="Next hole"
          onClick={() => setHole((h) => Math.min(18, h + 1))}
          className="flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Hole strip */}
      <div className="mt-2 flex gap-1 overflow-x-auto px-4 pb-1">
        {PARS.map((_, i) => {
          const h = i + 1;
          const filled = scores[player.id]?.[h] != null;
          const active = h === hole;
          return (
            <button
              key={h}
              onClick={() => setHole(h)}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-tabular text-[11px] font-bold",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_50%,transparent)]"
                  : filled
                    ? "bg-surface-2 text-foreground"
                    : "bg-surface text-muted-foreground",
              )}
            >
              {h}
            </button>
          );
        })}
      </div>

      {/* Player card (swipe area) */}
      <section
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="mx-4 mt-3 select-none rounded-3xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-center justify-between">
          <button
            aria-label="Previous player"
            onClick={() => setPlayerIdx((i) => Math.max(0, i - 1))}
            disabled={playerIdx === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center px-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full text-base font-extrabold",
                player.team === "Eagles"
                  ? "bg-primary/15 text-primary"
                  : "bg-bubble/15 text-bubble",
              )}
            >
              {player.initials}
            </div>
            <div className="mt-2 truncate text-base font-bold">{player.name}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {player.team} · Thru {player.thru} · {fmtToPar(player.toPar)}
            </div>
          </div>
          <button
            aria-label="Next player"
            onClick={() => setPlayerIdx((i) => Math.min(seedPlayers.length - 1, i + 1))}
            disabled={playerIdx === seedPlayers.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {seedPlayers.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === playerIdx ? "w-6 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>

        {/* Giant score buttons */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {options.map((o) => {
            const active = current === o.stroke;
            return (
              <button
                key={o.stroke}
                onClick={() => enter(o.stroke)}
                className={cn(
                  "group relative flex h-24 flex-col items-center justify-center rounded-2xl border text-foreground transition-all active:scale-[0.97]",
                  active
                    ? "border-transparent bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span className="font-tabular text-3xl font-extrabold leading-none">{o.stroke}</span>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-bold uppercase tracking-wider",
                    active ? "text-primary-foreground/85" : colorForLabel(o.label),
                  )}
                >
                  {o.label}
                </span>
                {active && (
                  <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary-foreground/90" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer row */}
        <div className="mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{completed}/18 holes scored</span>
          <button
            onClick={undo}
            disabled={!lastEntry}
            className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Swipe ← → players · Swipe ↑ ↓ holes · Tap a score to auto-save
        </p>
      </section>

      <BottomNav active="score" />
    </main>
  );
}

function labelFor(stroke: number, par: number): string {
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

function colorForLabel(label: string) {
  switch (label) {
    case "Ace":
    case "Albatross":
    case "Eagle":
      return "text-gold";
    case "Birdie":
      return "text-money";
    case "Par":
      return "text-muted-foreground";
    case "Bogey":
      return "text-bubble";
    default:
      return "text-down";
  }
}

function fmtToPar(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

function SaveIndicator({ status, flash }: { status: "idle" | "saving" | "saved" | "error"; flash: boolean }) {
  const isSaving = status === "saving";
  const isError = status === "error";
  const showSaved = flash && !isError && !isSaving;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border border-border bg-surface/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
        isError
          ? "border-down/40 text-down"
          : showSaved
            ? "text-money"
            : isSaving
              ? "text-foreground"
              : "text-muted-foreground",
      )}
    >
      {isError ? (
        <CloudOff className="h-3 w-3" />
      ) : isSaving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Cloud className="h-3 w-3" />
      )}
      {isError ? "Retry" : isSaving ? "Saving" : showSaved ? "Saved" : "Auto-save"}
    </span>
  );
}
