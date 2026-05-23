import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Clock, CircleDot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBoardData } from "@/lib/board/context";
import { getEvent } from "@/lib/api/events";
import { listGroups, unapproveGroup, approveGroup } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { EventGroup, EventPlayer, EventRecord } from "@/lib/api/types";

export function ScorecardListPage() {
  const { eventId } = useBoardData();
  const qc = useQueryClient();

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

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["groups", eventId] });
  };

  const handleUnlock = async (g: EventGroup) => {
    const names = g.members.map((m) => m.name).join(" and ");
    if (!window.confirm(`Unlock ${g.name}?\n\n${names} will all be editable until you lock the group again.`)) return;
    try {
      await unapproveGroup(eventId as number, g.id);
      toast.success(`${g.name} unlocked`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlock group");
    }
  };

  const handleApprove = async (g: EventGroup) => {
    try {
      await approveGroup(eventId as number, g.id);
      toast.success(`${g.name} locked`);
      refetch();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to lock group";
      toast.error(msg);
    }
  };

  if (eventId == null) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 pt-6">
        <p className="text-sm text-muted-foreground">No event selected.</p>
        <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
      </main>
    );
  }

  const event = eventQ.data ?? null;
  const groups = groupsQ.data ?? [];
  const playersById = new Map<number | string, EventPlayer>();
  (event?.players ?? []).forEach((p) => playersById.set(p.player_id, p));

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-24">
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Admin Hub
          </Link>
          {(eventQ.isFetching || groupsQ.isFetching) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight">Scorecards</h1>
        {event?.name && <p className="text-xs text-muted-foreground">{event.name}</p>}
      </header>

      <section className="mx-4 space-y-3">
        {groupsQ.isLoading || eventQ.isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No groups set up yet for this event.
          </div>
        ) : (
          groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              event={event}
              playersById={playersById}
              onUnlock={() => handleUnlock(g)}
              onApprove={() => handleApprove(g)}
            />
          ))
        )}
      </section>
    </main>
  );
}

function GroupCard({
  group,
  event,
  playersById,
  onUnlock,
  onApprove,
}: {
  group: EventGroup;
  event: EventRecord | null;
  playersById: Map<number | string, EventPlayer>;
  onUnlock: () => void;
  onApprove: () => void;
}) {
  const badge = statusBadge(group.status);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wider">{group.name}</h2>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", badge.cls)}>
          <badge.icon className="h-3 w-3" /> {badge.label}
        </span>
      </div>

      <ul className="space-y-1.5">
        {group.members.map((m) => {
          const p = playersById.get(m.player_id);
          const thru = p?.thru ?? 0;
          const complete = p?.round_complete ?? thru >= 18;
          return (
            <li key={m.player_id}>
              <Link
                to="/admin/scorecards/$playerId"
                params={{ playerId: String(m.player_id) }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 hover:border-primary/40 hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{m.name}</div>
                  <ProgressBar thru={thru} />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {complete ? "Complete" : `Thru ${thru}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {group.status === "approved" && (
        <div className="mt-2 flex justify-end">
          <button onClick={onUnlock} className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-card">
            Unlock Group
          </button>
        </div>
      )}
      {group.status === "needs_review" && (
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onApprove} className="rounded-full bg-money px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-background shadow-card">
            Approve &amp; Lock
          </button>
        </div>
      )}
      {event == null && group.status === "scoring" && null}
    </div>
  );
}

function ProgressBar({ thru }: { thru: number }) {
  const pct = Math.min(100, (Math.max(0, thru) / 18) * 100);
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function statusBadge(s: EventGroup["status"]) {
  if (s === "approved") return { label: "Locked", icon: Lock, cls: "bg-money/15 text-money" };
  if (s === "needs_review") return { label: "Needs Review", icon: Clock, cls: "bg-gold/15 text-gold" };
  return { label: "In Progress", icon: CircleDot, cls: "bg-surface-2 text-muted-foreground" };
}
