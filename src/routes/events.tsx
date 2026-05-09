import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, LogOut, Calendar, Users, DollarSign, Loader2, Trophy, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listEvents } from "@/lib/api/events";
import { requireAuth } from "@/lib/board/entryGuard";
import { isAuthenticated, getStoredIsAdmin, logout as apiLogout } from "@/lib/api/auth";
import { useMe } from "@/hooks/useMe";
import { CreateEventDialog } from "@/components/board/CreateEventDialog";
import { ThemeSwitcher } from "@/components/board/ThemeSwitcher";
import { cn } from "@/lib/utils";
import type { EventRecord } from "@/lib/api/types";

export const Route = createFileRoute("/events")({
  beforeLoad: () => requireAuth(),
  head: () => ({ meta: [{ title: "Choose Event — The Board" }] }),
  component: EventsPickerPage,
});

const ACTIVE_EVENT_KEY = "activeEventId";

function scoringLabel(t: EventRecord["scoring_type"]) {
  return t === "stableford" ? "Stableford" : t === "net_stroke" ? "Net Stroke" : "Gross Stroke";
}

function statusGroup(e: EventRecord): "active" | "draft" | "final" {
  if (e.status === "final") return "final";
  // We treat any non-final event as eligible to enter; "draft" covers active rounds today.
  return "draft";
}

function EventsPickerPage() {
  const router = useRouter();
  const isAdmin = getStoredIsAdmin();
  const { meId } = useMe();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [showAllFinished, setShowAllFinished] = useState(false);

  const { data: events = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["events"],
    queryFn: listEvents,
    enabled: isAuthenticated(),
    staleTime: 30_000,
  });

  // Non-admins only see events they're enrolled in. Admins see everything.
  const visible = isAdmin
    ? events
    : events.filter((e) => meId != null && e.players.some((p) => String(p.player_id) === String(meId)));

  const open = visible.filter((e) => statusGroup(e) === "draft").sort((a, b) => b.id - a.id);

  const finishedAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible
      .filter((e) => statusGroup(e) === "final")
      .filter((e) => {
        if (!q) return true;
        return (
          (e.event_code ?? "").toLowerCase().includes(q) ||
          (e.name ?? "").toLowerCase().includes(q) ||
          (e.course_name ?? "").toLowerCase().includes(q)
        );
      })
      .filter((e) => (dateFilter ? e.event_date === dateFilter : true))
      .sort((a, b) => b.id - a.id);
  }, [visible, search, dateFilter]);

  const filtersActive = search.trim().length > 0 || dateFilter.length > 0;
  const finished = showAllFinished || filtersActive ? finishedAll : finishedAll.slice(0, 5);

  const enter = (id: number) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_EVENT_KEY, String(id));
      // Hard navigation: forces BoardDataProvider to re-read activeEventId on mount.
      window.location.href = `/?eventId=${id}`;
      return;
    }
    void router.navigate({ to: "/" });
  };

  const handleLogout = () => {
    apiLogout();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_EVENT_KEY);
      window.location.href = "/login";
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-12 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            <Trophy className="h-3 w-3" /> The Board
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Choose an event</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Pick an event to open, or create a new one."
              : "Open an event you're enrolled in."}
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      {isAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-card"
        >
          <Plus className="h-4 w-4" /> Create event
        </button>
      )}

      {isAdmin && <CreateEventDialog open={showCreate} onOpenChange={setShowCreate} />}

      {isLoading && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load events. <button onClick={() => refetch()} className="ml-1 underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && visible.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="font-semibold">No events available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Create your first event to get started."
              : "You'll appear here once an admin adds you to an event."}
          </p>
        </div>
      )}

      {open.length > 0 && (
        <Section title="Open" count={open.length}>
          {open.map((e) => <EventCard key={e.id} event={e} onPick={enter} highlight />)}
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="Finished" count={finished.length}>
          {finished.map((e) => <EventCard key={e.id} event={e} onPick={enter} />)}
        </Section>
      )}

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <button onClick={() => refetch()} disabled={isFetching} className="font-semibold uppercase tracking-wider hover:text-foreground disabled:opacity-50">
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
        <button onClick={handleLogout} className="flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-destructive">
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </main>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{count}</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EventCard({ event, onPick, highlight }: { event: EventRecord; onPick: (id: number) => void; highlight?: boolean }) {
  const dateLabel = event.event_date
    ? new Date(event.event_date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric",
      })
    : null;

  return (
    <button
      onClick={() => onPick(event.id)}
      className={cn(
        "w-full rounded-2xl border p-3.5 text-left shadow-card transition-all active:opacity-70",
        highlight ? "border-primary/40 bg-primary/5 hover:border-primary/70" : "border-border bg-surface hover:border-border/80",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-extrabold tracking-widest">{event.event_code ?? event.name}</span>
            <StatusBadge status={event.status} />
          </div>
          {event.course_name && (
            <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{event.course_name}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
        {dateLabel && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dateLabel}</span>}
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{event.players.length}</span>
        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-money" />{event.total_pot}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{scoringLabel(event.scoring_type)}</span>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: EventRecord["status"] }) {
  if (status === "final") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Final
      </span>
    );
  }
  return (
    <span className="rounded-full bg-money/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-money">
      Open
    </span>
  );
}
