import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listEvents } from "@/lib/api/events";
import { useMe } from "@/hooks/useMe";
import { isAuthenticated } from "@/lib/api/auth";

export const Route = createFileRoute("/my-events")({
  head: () => ({ meta: [{ title: "My Events — The Board" }] }),
  component: MyEventsPage,
});

const ACTIVE_EVENT_KEY = "activeEventId";

function MyEventsPage() {
  const router = useRouter();
  const { meId } = useMe();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: listEvents,
    enabled: isAuthenticated(),
  });

  const myEvents = events.filter(
    (e) =>
      e.status === "draft" &&
      e.players.some((p) => String(p.player_id) === String(meId)),
  );

  const enter = (id: number) => {
    localStorage.setItem(ACTIVE_EVENT_KEY, String(id));
    void router.navigate({ to: "/" });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Your Events</h1>
      <p className="mb-6 text-sm text-muted-foreground">Open events you're enrolled in</p>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {!isLoading && myEvents.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="font-semibold">No open events</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You'll appear here once the admin adds you to an event.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {myEvents.map((e) => {
          const dateLabel = e.event_date
            ? new Date(e.event_date + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })
            : null;

          return (
            <button
              key={e.id}
              onClick={() => enter(e.id)}
              className="w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition-opacity active:opacity-70"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-2xl font-extrabold tracking-widest text-foreground">
                  {e.event_code ?? e.name}
                </span>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Open
                </span>
              </div>
              {dateLabel && (
                <p className="mt-0.5 text-sm text-muted-foreground">{dateLabel}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {e.players.length} player{e.players.length !== 1 ? "s" : ""} · {
                  e.scoring_type === "stableford" ? "Stableford" :
                  e.scoring_type === "net_stroke" ? "Net Stroke" : "Gross Stroke"
                } · ${e.total_pot} pot
              </p>
            </button>
          );
        })}
      </div>
    </main>
  );
}
