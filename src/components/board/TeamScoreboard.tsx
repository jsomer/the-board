import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import { cn } from "@/lib/utils";

export function TeamScoreboard() {
  const { teams } = useBoardData();
  if (!Array.isArray(teams) || teams.length < 2) return null;
  const [a, b] = teams;
  const lead = Math.abs(a.score - b.score);
  const leader = a.score < b.score ? a : b;

  return (
    <section className="px-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Team Match
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {leader.name} lead by <span className="text-gold">{lead}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border">
          {teams.map((t) => {
            const isLeader = t.id === leader.id;
            return (
              <div key={t.id} className={cn("relative p-3", isLeader && "gradient-leader")}>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-sm font-bold tracking-wide",
                    isLeader ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {t.name}
                  </span>
                  <span className={cn(
                    "flex items-center gap-0.5 text-[11px] font-bold",
                    t.trend === "up" ? "text-up" : "text-down",
                  )}>
                    {t.trend === "up"
                      ? <ArrowUpRight className="h-3 w-3" />
                      : <ArrowDownRight className="h-3 w-3" />}
                    {t.trend === "up" ? "+1" : "-1"}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-tabular text-3xl font-black tracking-tight">
                    {t.score === 0 ? "E" : t.score > 0 ? `+${t.score}` : t.score}
                  </span>
                  <span className="text-[11px] text-muted-foreground">thru {t.thru}</span>
                </div>
                <div className="mt-1 text-[11px] font-semibold text-money">
                  ${t.projected} projected
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
