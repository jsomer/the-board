import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBoardData } from "@/lib/board/context";
import { getEvent } from "@/lib/api/events";
import { listGroups, unapproveGroup, approveGroup, postGroupScore } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { EventGroup, EventPlayer, EventRecord } from "@/lib/api/types";

export function ScorecardDetailPage() {
  const { playerId } = useParams({ from: "/admin_/scorecards/$playerId" });
  const { eventId } = useBoardData();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const eventQ = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => getEvent(eventId as number),
    enabled: eventId != null,
    refetchInterval: 10_000,
  });
  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId as number),
    enabled: eventId != null,
    refetchInterval: 10_000,
  });

  const event: EventRecord | null = eventQ.data ?? null;
  const groups: EventGroup[] = groupsQ.data ?? [];

  const player: EventPlayer | undefined = useMemo(
    () => event?.players.find((p) => String(p.player_id) === String(playerId)),
    [event, playerId],
  );
  const group: EventGroup | undefined = useMemo(
    () => groups.find((g) => g.members.some((m) => String(m.player_id) === String(playerId))),
    [groups, playerId],
  );

  const isUnlocked = group?.status !== "approved";
  const [editingHole, setEditingHole] = useState<number | null>(null);
  // Optimistic local overrides (hole -> score)
  const [pending, setPending] = useState<Record<number, number>>({});

  useEffect(() => {
    // Clear pending overrides when fresh event data arrives matching them
    if (!player) return;
    setPending((prev) => {
      const next: Record<number, number> = {};
      for (const [h, v] of Object.entries(prev)) {
        const idx = Number(h) - 1;
        if (player.holeScores[idx] !== v) next[Number(h)] = v;
      }
      return next;
    });
  }, [player]);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["groups", eventId] });
  };

  if (eventId == null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">No event selected.</p>
      </Shell>
    );
  }
  if (eventQ.isLoading || groupsQ.isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Shell>
    );
  }
  if (!player) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Player not found in this event.</p>
      </Shell>
    );
  }
  if (!group) {
    return (
      <Shell name={player.name}>
        <p className="text-sm text-muted-foreground">This player is not assigned to a group.</p>
      </Shell>
    );
  }

  const pars = event?.hole_pars ?? Array(18).fill(4);
  const scores = player.holeScores.map((s, i) => pending[i + 1] ?? s);

  const handleUnlock = async () => {
    const names = group.members.map((m) => m.name).join(" and ");
    if (!window.confirm(`Unlock ${group.name}?\n\n${names} will all be editable until you lock the group again.`)) return;
    try {
      await unapproveGroup(eventId, group.id);
      toast.success(`${group.name} unlocked`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlock");
    }
  };

  const handleSaveScore = async (hole: number, score: number) => {
    const idx = hole - 1;
    const prev = player.holeScores[idx];
    setPending((p) => ({ ...p, [hole]: score }));
    setEditingHole(null);
    try {
      await postGroupScore(eventId, group.id, {
        playerId: Number(playerId),
        holeNumber: hole,
        grossScore: score,
      });
      qc.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (e) {
      // revert
      setPending((p) => {
        const n = { ...p };
        if (prev === 0) delete n[hole];
        else n[hole] = prev;
        return n;
      });
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Group is locked — unlock first");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to save — try again");
      }
    }
  };

  const handleLock = async () => {
    try {
      await approveGroup(eventId, group.id);
      toast.success(`${group.name} locked`);
      refetch();
      navigate({ to: "/admin/scorecards" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to lock";
      toast.error(msg);
    }
  };

  const handleDiscard = () => {
    if (Object.keys(pending).length && !window.confirm("Discard changes?")) return;
    navigate({ to: "/admin/scorecards" });
  };

  const thru = scores.filter((s) => s > 0).length;
  const editing = isUnlocked;

  return (
    <Shell name={player.name}>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
          {group.name} ·
          {editing ? (
            <span className="inline-flex items-center gap-1 text-gold"><Pencil className="h-3 w-3" /> Editing</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-money"><Lock className="h-3 w-3" /> Locked</span>
          )}
        </span>
        <span className="font-semibold text-muted-foreground">
          Thru {thru} · Quota {player.quota}
        </span>
      </div>

      {editing && (
        <div className="mb-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] text-gold">
          ⚠️ {group.name} is unlocked. All players in this group can be edited.
        </div>
      )}

      <HoleRow start={1} end={9} pars={pars} scores={scores} editing={editing} onCellTap={setEditingHole} />
      <div className="h-3" />
      <HoleRow start={10} end={18} pars={pars} scores={scores} editing={editing} onCellTap={setEditingHole} />

      <div className="mt-5 flex justify-center gap-2">
        {!editing ? (
          <button onClick={handleUnlock} className="rounded-full bg-primary px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-primary-foreground shadow-card">
            Unlock to Edit
          </button>
        ) : (
          <>
            <button onClick={handleDiscard} className="rounded-full border border-border bg-surface px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Discard
            </button>
            <button onClick={handleLock} className="rounded-full bg-money px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-background shadow-card">
              Lock Group
            </button>
          </>
        )}
      </div>

      {editingHole != null && (
        <ScoreInputSheet
          hole={editingHole}
          par={pars[editingHole - 1]}
          current={scores[editingHole - 1]}
          onCancel={() => setEditingHole(null)}
          onSave={(s) => handleSaveScore(editingHole, s)}
        />
      )}
    </Shell>
  );
}

function Shell({ name, children }: { name?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl pb-24">
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin/scorecards" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Scorecards
          </Link>
        </div>
        {name && <h1 className="mt-2 text-xl font-extrabold tracking-tight">{name}</h1>}
      </header>
      <section className="mx-4">{children}</section>
    </main>
  );
}

function HoleRow({
  start,
  end,
  pars,
  scores,
  editing,
  onCellTap,
}: {
  start: number;
  end: number;
  pars: number[];
  scores: number[];
  editing: boolean;
  onCellTap: (h: number) => void;
}) {
  const holes = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-9 border-b border-border bg-surface-2/60 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {holes.map((h) => (
          <div key={h} className="py-1.5">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-9 border-b border-border text-center text-[11px] font-semibold text-muted-foreground">
        {holes.map((h) => (
          <div key={h} className="py-1">{pars[h - 1]}</div>
        ))}
      </div>
      <div className="grid grid-cols-9 text-center">
        {holes.map((h) => {
          const score = scores[h - 1];
          const par = pars[h - 1];
          const color = scoreColor(score, par);
          return (
            <button
              key={h}
              type="button"
              disabled={!editing}
              onClick={() => editing && onCellTap(h)}
              className={cn(
                "border-r border-border py-2.5 text-sm font-extrabold last:border-r-0",
                color,
                editing && "hover:opacity-80 active:scale-95",
                !editing && "cursor-default",
              )}
            >
              {score > 0 ? score : "–"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scoreColor(score: number, par: number): string {
  if (!score) return "bg-surface-2/40 text-muted-foreground";
  const diff = score - par;
  if (diff <= -2) return "bg-primary/25 text-primary";
  if (diff === -1) return "bg-gold/25 text-gold";
  if (diff === 0) return "bg-card text-foreground";
  if (diff === 1) return "bg-bubble/20 text-bubble";
  return "bg-destructive/20 text-destructive";
}

function ScoreInputSheet({
  hole,
  par,
  current,
  onCancel,
  onSave,
}: {
  hole: number;
  par: number;
  current: number;
  onCancel: () => void;
  onSave: (s: number) => void;
}) {
  const [value, setValue] = useState<string>(current > 0 ? String(current) : "");

  const press = (d: string) => {
    if (d === "back") {
      setValue((v) => v.slice(0, -1));
      return;
    }
    setValue((v) => (v.length >= 2 ? v : v + d));
  };

  const submit = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      toast.error("Enter a score between 1 and 20");
      return;
    }
    onSave(n);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hole {hole} — Par {par}</div>
          <div className="mt-2 text-4xl font-extrabold tabular-nums">{value || "–"}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <PadBtn key={n} onClick={() => press(String(n))}>{n}</PadBtn>
          ))}
          <PadBtn onClick={() => press("back")}>⌫</PadBtn>
          <PadBtn onClick={() => press("0")}>0</PadBtn>
          <PadBtn onClick={submit} primary>OK</PadBtn>
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-border bg-surface py-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
            Cancel
          </button>
          <button onClick={submit} className="flex-1 rounded-full bg-primary py-2 text-[12px] font-bold uppercase tracking-wider text-primary-foreground">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function PadBtn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl py-4 text-xl font-extrabold transition-all active:scale-95",
        primary ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}
