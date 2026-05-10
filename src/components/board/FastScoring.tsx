import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check, Undo2, Flag, Cloud, CloudOff, Loader2, Zap, Lock, ListChecks, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useBoardData } from "@/lib/board/context";
import { useMe } from "@/hooks/useMe";
import { useHoleScoreSync } from "@/hooks/useHoleScoreSync";
import { useHoleLocks } from "@/lib/board/holeLocks";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { WhereDoIStand } from "./WhereDoIStand";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { listGroups } from "@/lib/api/groups";
import type { Player } from "@/data/board";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4];

type Scores = Record<string, Record<number, number | undefined>>;

export function FastScoring() {
  const { players: seedPlayers, event, rawEvent, eventId, refresh } = useBoardData();
  const PARS = (rawEvent?.hole_pars && rawEvent.hole_pars.length === 18) ? rawEvent.hole_pars : DEFAULT_PARS;

  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId!),
    enabled: eventId != null,
    staleTime: 30_000,
  });

  const playerToGroup = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of groupsQ.data ?? []) {
      for (const m of g.members) map.set(Number(m.player_id), g.id);
    }
    return map;
  }, [groupsQ.data]);

  const { queue, clear, status, savedTick, pendingCount, online } = useHoleScoreSync(
    eventId,
    (pid) => playerToGroup.get(pid) ?? null,
  );

  // Local overlay for mock/offline mode where the queue can't write to the API.
  // Keyed by player id, then hole number.
  const [localScores, setLocalScores] = useState<Scores>({});

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
    } else {
      for (const p of seedPlayers) {
        map[p.id] = {};
        for (let h = 1; h <= p.thru; h++)
          map[p.id][h] = PARS[h - 1] + (h === p.lastHole?.hole ? p.lastHole.score - p.lastHole.par : 0);
      }
    }
    // Merge local overrides on top
    for (const [pid, holes] of Object.entries(localScores)) {
      map[pid] = { ...(map[pid] ?? {}), ...holes };
    }
    return map;
  }, [rawEvent, seedPlayers, PARS, localScores]);

  const { meId, isAdmin } = useMe();
  const [hole, setHole] = useState(event.hole);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lastEntry, setLastEntry] = useState<{ pid: string; hole: number; prev?: number } | null>(null);
  const [roundOpen, setRoundOpen] = useState<string | null>(null);

  const { locked: lockedHoles } = useHoleLocks();
  const isLocked = lockedHoles.includes(hole);
  const par = PARS[hole - 1];

  // Compute the active group's players. Prefer the group containing the
  // authenticated player; admins fall back to the first group; otherwise
  // show all players (mock or no-groups mode).
  const groupPlayers: Player[] = useMemo(() => {
    const groups = groupsQ.data ?? [];
    if (groups.length === 0) return seedPlayers;
    const byId = new Map(seedPlayers.map((p) => [String(p.id), p]));
    const myGroup = meId
      ? groups.find((g) => g.members.some((m) => String(m.player_id) === String(meId)))
      : null;
    const target = myGroup ?? (isAdmin ? groups[0] : null);
    if (!target) return seedPlayers;
    const list = target.members
      .map((m) => byId.get(String(m.player_id)))
      .filter((p): p is Player => Boolean(p));
    return list.length > 0 ? list : seedPlayers;
  }, [groupsQ.data, seedPlayers, meId, isAdmin]);

  // Quick options anchored to par
  const options = useMemo(() => {
    const make = (offset: number) => {
      const stroke = par + offset;
      return { stroke, offset, label: labelFor(stroke, par) };
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

  const enter = (pid: string, stroke: number) => {
    if (isLocked) {
      toast.error(`Hole ${hole} is locked`, { description: "Ask an admin to unlock it before editing." });
      return;
    }
    const prev = scores[pid]?.[hole];
    setLastEntry({ pid, hole, prev });
    setLocalScores((m) => ({ ...m, [pid]: { ...(m[pid] ?? {}), [hole]: stroke } }));
    if (eventId != null) {
      queue({ playerId: pid, holeNumber: hole, grossScore: stroke, prevScore: prev ?? 0 });
    } else {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 700);
    }
  };

  const submitNext = () => {
    // Pull fresh hole_leaders / side-bets so the Skins strip reflects the
    // scores just entered. The queued POSTs flush within the debounce window
    // (~500ms); kick a refetch shortly after so the board updates immediately.
    window.setTimeout(() => { void refresh(); }, 700);
    setHole((h) => Math.min(18, h + 1));
  };

  const undo = () => {
    if (!lastEntry) return;
    if (lockedHoles.includes(lastEntry.hole)) {
      toast.error(`Hole ${lastEntry.hole} is locked`);
      return;
    }
    setLocalScores((m) => {
      const cur = { ...(m[lastEntry.pid] ?? {}) };
      if (lastEntry.prev == null || lastEntry.prev < 1) delete cur[lastEntry.hole];
      else cur[lastEntry.hole] = lastEntry.prev;
      return { ...m, [lastEntry.pid]: cur };
    });
    if (eventId != null) {
      if (lastEntry.prev == null || lastEntry.prev < 1) {
        clear({ playerId: lastEntry.pid, holeNumber: lastEntry.hole });
      } else {
        queue({
          playerId: lastEntry.pid,
          holeNumber: lastEntry.hole,
          grossScore: lastEntry.prev,
          prevScore: scores[lastEntry.pid]?.[lastEntry.hole] ?? 0,
        });
      }
    }
    setLastEntry(null);
  };

  const enteredCount = groupPlayers.filter((p) => scores[p.id]?.[hole] != null).length;
  const allEntered = enteredCount === groupPlayers.length && groupPlayers.length > 0;
  const openPlayer = roundOpen ? groupPlayers.find((p) => p.id === roundOpen) ?? null : null;

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
            <SaveIndicator status={status} flash={savedFlash} pendingCount={pendingCount} online={online} />
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
          {isLocked && (
            <span className="ml-1 flex items-center gap-1 rounded-full bg-bubble/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bubble">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
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
          const filled = groupPlayers.length > 0 && groupPlayers.every((p) => scores[p.id]?.[h] != null);
          const active = h === hole;
          const lk = lockedHoles.includes(h);
          return (
            <button
              key={h}
              onClick={() => setHole(h)}
              className={cn(
                "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-tabular text-[11px] font-bold",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_50%,transparent)]"
                  : filled
                    ? "bg-surface-2 text-foreground"
                    : "bg-surface text-muted-foreground",
              )}
            >
              {h}
              {lk && (
                <Lock className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-bubble" />
              )}
            </button>
          );
        })}
      </div>

      {/* Group scoring — one row per player */}
      <section className="mx-4 mt-3 select-none rounded-3xl border border-border bg-card p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Group · {groupPlayers.length} {groupPlayers.length === 1 ? "player" : "players"}
          </div>
          <div className="font-tabular text-[11px] font-bold text-muted-foreground">
            {enteredCount}/{groupPlayers.length} entered
          </div>
        </div>

        <ul className={cn("flex flex-col gap-2", isLocked && "opacity-60")}>
          {groupPlayers.map((p) => {
            const cur = scores[p.id]?.[hole];
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-border bg-surface/60 p-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                      p.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
                    )}
                  >
                    {p.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold leading-tight">{p.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Thru {p.thru} · {fmtToPar(p.toPar)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div
                      className={cn(
                        "flex h-9 w-12 items-center justify-center rounded-lg border font-tabular text-base font-extrabold",
                        cur != null
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-dashed border-border bg-surface text-muted-foreground",
                      )}
                    >
                      {cur ?? "—"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRoundOpen(p.id)}
                      aria-label={`View ${p.name}'s round`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground"
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-6 gap-1.5">
                  {options.map((o) => {
                    const active = cur === o.stroke;
                    return (
                      <button
                        key={o.stroke}
                        onClick={() => enter(p.id, o.stroke)}
                        disabled={isLocked}
                        className={cn(
                          "relative flex h-12 flex-col items-center justify-center rounded-xl border text-foreground transition-all active:scale-[0.97]",
                          isLocked && "cursor-not-allowed",
                          active
                            ? "border-transparent bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] text-primary-foreground shadow-[0_4px_14px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                            : "border-border bg-surface hover:bg-surface-2",
                        )}
                      >
                        <span className="font-tabular text-base font-extrabold leading-none">{o.stroke}</span>
                        <span
                          className={cn(
                            "mt-0.5 text-[8px] font-bold uppercase tracking-wider leading-none",
                            active ? "text-primary-foreground/85" : colorForLabel(o.label),
                          )}
                        >
                          {o.label}
                        </span>
                        {active && (
                          <Check className="absolute right-1 top-1 h-2.5 w-2.5 text-primary-foreground/90" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        {isLocked && (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-bubble/30 bg-bubble/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-bubble">
            <Lock className="h-3 w-3" /> Hole {hole} finalized — edits disabled
          </div>
        )}

        {/* Submit / next-hole action */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!lastEntry}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[11px] font-bold uppercase tracking-wider text-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            onClick={submitNext}
            disabled={hole >= 18}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40",
              allEntered
                ? "bg-gradient-to-r from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                : "border border-border bg-surface text-foreground",
            )}
          >
            {hole >= 18 ? "Finish round" : `Submit · Hole ${hole + 1}`}
            {hole < 18 && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Tap a score for each player · Submit advances to the next hole
        </p>
      </section>

      <RoundDrawer
        open={openPlayer != null}
        onOpenChange={(o) => !o && setRoundOpen(null)}
        playerName={openPlayer?.name ?? ""}
        playerTeam={openPlayer?.team ?? "Eagles"}
        pars={PARS}
        scores={openPlayer ? scores[openPlayer.id] ?? {} : {}}
        lockedHoles={lockedHoles}
        currentHole={hole}
        onJump={(h) => {
          setHole(h);
          setRoundOpen(null);
        }}
        onClear={(h) => {
          if (!openPlayer) return;
          if (lockedHoles.includes(h)) {
            toast.error(`Hole ${h} is locked`);
            return;
          }
          const pid = openPlayer.id;
          const prev = scores[pid]?.[h];
          setLastEntry({ pid, hole: h, prev });
          setLocalScores((m) => {
            const cur = { ...(m[pid] ?? {}) };
            delete cur[h];
            return { ...m, [pid]: cur };
          });
          if (eventId != null) clear({ playerId: pid, holeNumber: h });
        }}
      />

      <BottomNav active="score" />
    </main>
  );
}

function RoundDrawer({
  open,
  onOpenChange,
  playerName,
  playerTeam,
  pars,
  scores,
  lockedHoles,
  currentHole,
  onJump,
  onClear,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  playerName: string;
  playerTeam: string;
  pars: number[];
  scores: Record<number, number | undefined>;
  lockedHoles: number[];
  currentHole: number;
  onJump: (h: number) => void;
  onClear: (h: number) => void;
}) {
  const played = pars.filter((_, i) => scores[i + 1] != null).length;
  const totalScore = pars.reduce((s, _, i) => s + (scores[i + 1] ?? 0), 0);
  const totalToPar = pars.reduce(
    (s, p, i) => (scores[i + 1] != null ? s + ((scores[i + 1] as number) - p) : s),
    0,
  );

  const renderNine = (start: number, label: string) => {
    const slice = pars.slice(start, start + 9);
    const nineScore = slice.reduce((s, _, i) => s + (scores[start + i + 1] ?? 0), 0);
    const nineToPar = slice.reduce(
      (s, p, i) => (scores[start + i + 1] != null ? s + ((scores[start + i + 1] as number) - p) : s),
      0,
    );
    return (
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="font-tabular text-[11px] font-bold text-muted-foreground">
            {nineScore || "—"} {nineScore ? `(${fmtToPar(nineToPar)})` : ""}
          </span>
        </div>
        <div className="grid grid-cols-9 gap-1">
          {slice.map((par, i) => {
            const h = start + i + 1;
            const score = scores[h];
            const off = score != null ? score - par : null;
            const isCurrent = h === currentHole;
            const lk = lockedHoles.includes(h);
            const tone =
              off == null
                ? "bg-surface-2/40 text-muted-foreground/70"
                : off <= -1
                  ? "bg-money/15 text-money"
                  : off === 0
                    ? "bg-surface-2 text-foreground"
                    : "bg-down/10 text-down";
            return (
              <button
                key={h}
                type="button"
                onClick={() => onJump(h)}
                onDoubleClick={() => score != null && onClear(h)}
                title={score != null ? "Tap to edit · double-tap to clear" : "Tap to score"}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center rounded-lg border text-foreground transition-all active:scale-95",
                  isCurrent ? "border-primary shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_40%,transparent)]" : "border-border",
                  tone,
                )}
              >
                <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">H{h}·{par}</span>
                <span className="font-tabular text-base font-extrabold leading-none">
                  {score ?? "—"}
                </span>
                {off != null && (
                  <span className="font-tabular text-[9px] font-bold opacity-70">{fmtToPar(off)}</span>
                )}
                {lk && <Lock className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-bubble" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="flex flex-row items-start justify-between gap-3 text-left">
          <div className="min-w-0 flex-1">
            <DrawerTitle className="truncate text-base font-extrabold">{playerName}'s round</DrawerTitle>
            <DrawerDescription className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {playerTeam} · {played}/18 holes · {totalScore || "—"} {played ? `(${fmtToPar(totalToPar)})` : ""}
            </DrawerDescription>
          </div>
          <DrawerClose className="rounded-full bg-surface-2 p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </DrawerClose>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          {renderNine(0, "Front 9 · Out")}
          {renderNine(9, "Back 9 · In")}
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Tap a hole to jump &amp; edit · double-tap to clear
          </p>
        </div>
      </DrawerContent>
    </Drawer>
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

function SaveIndicator({
  status,
  flash,
  pendingCount,
  online,
}: {
  status: "idle" | "saving" | "saved" | "error" | "offline";
  flash: boolean;
  pendingCount: number;
  online: boolean;
}) {
  const isOffline = status === "offline" || !online;
  const isSaving = status === "saving";
  const isError = status === "error";
  const showSaved = flash && !isError && !isSaving && !isOffline;
  const queued = pendingCount > 0;
  const label = isOffline
    ? queued ? `Offline · ${pendingCount}` : "Offline"
    : isError
      ? queued ? `Retry · ${pendingCount}` : "Retry"
      : isSaving
        ? "Saving"
        : showSaved
          ? "Saved"
          : queued
            ? `Queued · ${pendingCount}`
            : "Auto-save";
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full border border-border bg-surface/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
        isOffline
          ? "border-bubble/40 text-bubble"
          : isError
            ? "border-down/40 text-down"
            : showSaved
              ? "text-money"
              : isSaving
                ? "text-foreground"
                : "text-muted-foreground",
      )}
    >
      {isOffline || isError ? (
        <CloudOff className="h-3 w-3" />
      ) : isSaving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Cloud className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
