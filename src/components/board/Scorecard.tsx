import { useBoardData } from "@/lib/board/context";
import { cn } from "@/lib/utils";

export function Scorecard() {
  const { rawEvent } = useBoardData();

  if (!rawEvent) {
    return (
      <section className="px-4 text-sm text-muted-foreground">
        No event loaded.
      </section>
    );
  }

  const pars = rawEvent.hole_pars ?? [];
  const players = rawEvent.players ?? [];

  return (
    <section className="space-y-6 px-4">
      <NineTable
        title="Front Nine"
        label="Front"
        holes={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
        pars={pars.slice(0, 9)}
        players={players}
        sliceStart={0}
        sliceEnd={9}
      />
      <NineTable
        title="Back Nine"
        label="Back"
        holes={[10, 11, 12, 13, 14, 15, 16, 17, 18]}
        pars={pars.slice(9, 18)}
        players={players}
        sliceStart={9}
        sliceEnd={18}
      />
    </section>
  );
}

interface NineTableProps {
  title: string;
  label: string;
  holes: number[];
  pars: number[];
  players: ReturnType<typeof useBoardData>["rawEvent"] extends infer R
    ? R extends { players: infer P }
      ? P
      : never
    : never;
  sliceStart: number;
  sliceEnd: number;
}

function NineTable({ title, label, holes, pars, players, sliceStart, sliceEnd }: NineTableProps) {
  const parTotal = pars.reduce((s, p) => s + (p ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-tabular text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="sticky left-0 z-10 bg-muted/20 px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">
                Hole
              </th>
              {holes.map((h) => (
                <th key={h} className="px-2 py-2 text-center font-bold text-foreground">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </th>
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <th className="sticky left-0 z-10 bg-muted/10 px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                Par
              </th>
              {pars.map((p, i) => (
                <th key={i} className="px-2 py-1.5 text-center font-semibold text-muted-foreground">
                  {p ?? "—"}
                </th>
              ))}
              <th className="px-3 py-1.5 text-center font-semibold text-muted-foreground">
                {parTotal || "—"}
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const segScores = (player.holeScores ?? []).slice(sliceStart, sliceEnd);
              const segTotal = segScores.reduce((s, v) => s + (v > 0 ? v : 0), 0);
              return (
                <PlayerBlock
                  key={player.player_id}
                  name={player.name}
                  scores={segScores}
                  pars={pars}
                  segTotal={segTotal}
                />
              );
            })}
            {players.length === 0 && (
              <tr>
                <td colSpan={holes.length + 2} className="px-3 py-6 text-center text-muted-foreground">
                  No players in this event.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlayerBlock({
  name,
  scores,
  pars,
  segTotal,
}: {
  name: string;
  scores: number[];
  pars: number[];
  segTotal: number;
}) {
  const colSpan = scores.length + 2;
  return (
    <>
      <tr className="border-t border-border bg-background/40">
        <td colSpan={colSpan} className="sticky left-0 z-10 bg-background/40 px-3 py-2 text-left text-[13px] font-bold tracking-tight text-foreground">
          {name}
        </td>
      </tr>
      <tr className="border-t border-border/60">
        <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">
          Score
        </td>
        {scores.map((s, i) => {
          const par = pars[i];
          return (
            <td
              key={i}
              className={cn(
                "px-2 py-1.5 text-center font-bold",
                s > 0 && par ? scoreColor(s - par) : "text-muted-foreground/50",
              )}
            >
              {s > 0 ? s : "·"}
            </td>
          );
        })}
        <td className="px-3 py-1.5 text-center font-bold text-foreground">
          {segTotal || "—"}
        </td>
      </tr>
    </>
  );
}

function scoreColor(diff: number): string {
  if (diff <= -2) return "text-money";
  if (diff === -1) return "text-money/90";
  if (diff === 0) return "text-foreground";
  if (diff === 1) return "text-down/80";
  return "text-down";
}
