import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Flame, Minus, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { cn } from "@/lib/utils";

function fmtPar(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

export function Leaderboard() {
  const { players } = useBoardData();
  const sorted = [...players].sort((a, b) => a.toPar - b.toPar);

  // Restore selection state when returning from a player scorecard.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem("board:lastPlayerId"); } catch {}
    if (!id) return;
    setSelectedId(id);
    // Scroll the row into view after layout settles, without fighting router scrollRestoration.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`lb-row-${id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const offscreen = rect.top < 80 || rect.bottom > window.innerHeight - 120;
        if (offscreen) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 120);
    // Clear highlight after a brief moment so it acts as a focus cue, not permanent state.
    const clear = window.setTimeout(() => {
      setSelectedId(null);
      try { sessionStorage.removeItem("board:lastPlayerId"); } catch {}
    }, 2400);
    return () => { window.clearTimeout(t); window.clearTimeout(clear); };
  }, []);

  return (
    <section className="px-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Live Leaderboard
        </h2>
        <span className="text-[10px] font-semibold text-muted-foreground">
          POS · PLAYER · THRU · TOTAL · $
        </span>
      </div>

      <ol className="space-y-1.5">
        {sorted.map((p, i) => (
          <Row key={p.id} player={p} pos={i + 1} highlighted={p.id === selectedId} />
        ))}
      </ol>
    </section>
  );
}

function Row({ player, pos, highlighted }: { player: Player; pos: number; highlighted?: boolean }) {
  const isLeader = pos === 1;
  const cashLine = pos <= 3;
  const teamColor = player.team === "Eagles" ? "bg-money/80" : "bg-bubble/80";

  return (
    <li id={`lb-row-${player.id}`} className="scroll-mt-24">
      <Link
        to="/player/$playerId"
        params={{ playerId: String(player.id) }}
        aria-label={`Open scorecard for ${player.name}`}
        className={cn(
          "group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card transition-all hover:bg-surface/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isLeader && "gradient-leader border-money/40",
          player.bubble && !isLeader && "gradient-pressure border-bubble/40",
          highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse",
        )}
      >
      {/* Position */}
      <div className="flex w-8 flex-col items-center">
        <span className={cn(
          "font-tabular text-lg font-black leading-none",
          isLeader ? "text-gold" : "text-foreground",
        )}>
          {pos}
        </span>
        <Movement value={player.movement} />
      </div>

      {/* Team color bar */}
      <span className={cn("h-10 w-1 rounded-full", teamColor)} />

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-bold tracking-tight">
            {player.name}
          </span>
          {isLeader && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />}
          {player.skins > 0 && (
            <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold">
              {player.skins}🟡
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground/70">{player.team}</span>
          <span>·</span>
          <span className="font-tabular">Thru {player.thru}</span>
          {player.lastHole && (
            <>
              <span>·</span>
              <LastHole p={player} />
            </>
          )}
        </div>
        {player.pressure && (
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-bubble">
            <Flame className="h-3 w-3" />
            <span className="truncate">{player.pressure}</span>
          </div>
        )}
      </div>

      {/* Score + payout */}
      <div className="text-right">
        <div className={cn(
          "font-tabular text-2xl font-black leading-none tracking-tight",
          player.toPar < 0 ? "text-money" : player.toPar > 0 ? "text-foreground" : "text-foreground",
        )}>
          {fmtPar(player.toPar)}
        </div>
        <div className={cn(
          "mt-1 font-tabular text-xs font-bold",
          player.projected > 0 ? "text-money" : "text-muted-foreground",
          cashLine && "text-money",
        )}>
          {player.projected > 0 ? `+$${player.projected}` : "—"}
        </div>
      </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function Movement({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="mt-0.5 inline-flex items-center text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  const up = value > 0;
  return (
    <span className={cn(
      "mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold",
      up ? "text-up" : "text-down",
    )}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}
    </span>
  );
}

function LastHole({ p }: { p: Player }) {
  if (!p.lastHole) return null;
  const diff = p.lastHole.score - p.lastHole.par;
  const label =
    diff <= -2 ? "EAGLE" :
    diff === -1 ? "BIRDIE" :
    diff === 0 ? "PAR" :
    diff === 1 ? "BOGEY" : "DBL";
  const cls =
    diff < 0 ? "text-money" :
    diff === 0 ? "text-muted-foreground" : "text-down";
  return (
    <span className={cn("font-bold uppercase tracking-wider", cls)}>
      H{p.lastHole.hole} {label}
    </span>
  );
}
