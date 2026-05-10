import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardData } from "@/lib/board/context";
import type { HoleLeader } from "@/lib/api/types";

const FALLBACK: Strip[] = [
  { hole: 13, status: "clear", low: 3, who: "Reyes", played: 4 },
  { hole: 14, status: "tied", low: 4, played: 3 },
  { hole: 15, status: "clear", low: 2, who: "Park", played: 2 },
  { hole: 16, status: "unplayed", low: null, played: 0 },
  { hole: 17, status: "unplayed", low: null, played: 0 },
  { hole: 18, status: "unplayed", low: null, played: 0 },
];

type Status = "unplayed" | "clear" | "tied";
type Strip = { hole: number; status: Status; low: number | null; who?: string; played: number };

function lastName(name: string): string {
  return name.trim().split(/\s+/).slice(-1)[0] ?? name;
}

export function SkinsStrip() {
  const { rawEvent, event, isMock } = useBoardData();

  const strip: Strip[] = (() => {
    const leaders: HoleLeader[] = Array.isArray(rawEvent?.hole_leaders)
      ? rawEvent!.hole_leaders
      : [];
    // Only show seeded fallback when running on mock data (logged out demo).
    // For a real event with no leaders yet, render an "open" strip so we never
    // show bogus winners.
    if (!rawEvent && isMock) return FALLBACK;

    const liveHole = event.hole;
    const start = Math.max(1, Math.min(13, liveHole - 2));
    const holes = Array.from({ length: 6 }, (_, i) => start + i);

    return holes.map((h) => {
      const rec = leaders.find((x) => x.hole === h);
      if (!rec) return { hole: h, status: "unplayed", low: null, played: 0 };
      const holder = Array.isArray(rec.holders) ? rec.holders[0] : undefined;
      return {
        hole: h,
        status: rec.status,
        low: rec.low_score,
        who: holder ? lastName(holder.name) : undefined,
        played: rec.played_count ?? 0,
      };
    });
  })();

  const liveSkins = strip.filter((s) => s.status === "clear").length;

  return (
    <section className="px-4">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <Coins className="h-4 w-4 text-gold" />
            Skins
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            <span className="text-gold">{liveSkins}</span> live · target = low score to beat
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {strip.map((s) => (
            <div
              key={s.hole}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center",
                s.status === "clear" && "border-money/40 bg-money/10",
                s.status === "tied" && "border-border bg-surface-2 opacity-70",
                s.status === "unplayed" && "border-border bg-surface-2",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                H{s.hole}
              </span>
              <span
                className={cn(
                  "font-tabular text-sm font-extrabold",
                  s.status === "clear" && "text-money",
                  s.status === "tied" && "text-foreground/60 line-through",
                  s.status === "unplayed" && "text-foreground/40",
                )}
              >
                {s.low != null ? s.low : "—"}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate max-w-full">
                {s.status === "clear"
                  ? s.who ?? "live"
                  : s.status === "tied"
                    ? "dead"
                    : "open"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
