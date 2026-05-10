import { Flame } from "lucide-react";
import { useMemo } from "react";
import { useBoardData } from "@/lib/board/context";
import { skinRowsFromHoleLeaders, skinRowsFromState, type HoleSkin } from "@/lib/board/quotaSkins";

function scoreToParLabel(score: number | null | undefined, par: number | null | undefined): string | null {
  if (score == null || par == null) return null;
  const d = score - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  return `+${d}`;
}

export function SkinsStrip() {
  const { rawEvent, skins } = useBoardData();

  const skinResults: HoleSkin[] = useMemo(() => {
    const fromLeaders = skinRowsFromHoleLeaders(rawEvent);
    return fromLeaders.length > 0 ? fromLeaders : skinRowsFromState(skins);
  }, [rawEvent, skins]);

  const winners = useMemo(
    () => skinResults.filter((s) => s.winner).slice().sort((a, b) => a.hole - b.hole),
    [skinResults],
  );

  return (
    <section className="px-4">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-wide">
          <Flame className="h-4 w-4 text-gold" />
          Skins
        </div>

        {winners.length === 0 ? (
          <div className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            No skins yet
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {winners.map((s) => {
              const total = s.totalPlayers ?? 0;
              const played = s.playedCount ?? 0;
              const left = Math.max(0, total - played);
              const locked = total > 0 && left === 0;
              const label = scoreToParLabel(s.score, s.par);
              return (
                <li key={s.hole} className="flex items-center gap-2 px-1 py-2">
                  <span className="font-tabular w-10 shrink-0 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    H{s.hole}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                      <span className="truncate">{s.winnerName ?? "—"}</span>
                      {label && (
                        <span className="font-tabular rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">
                          {label}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      {locked ? (
                        <span className="text-money">Skin locked in</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {left} player{left === 1 ? "" : "s"} left to post
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-tabular text-sm font-extrabold text-foreground">
                    {s.score ?? "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
