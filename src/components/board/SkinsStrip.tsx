import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const skins = [
  { hole: 13, status: "won", who: "Reyes", amount: 20 },
  { hole: 14, status: "carry", amount: 40 },
  { hole: 15, status: "pending", amount: 60 },
  { hole: 16, status: "open", amount: 20 },
  { hole: 17, status: "open", amount: 20 },
  { hole: 18, status: "open", amount: 20 },
] as const;

export function SkinsStrip() {
  return (
    <section className="px-4">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <Coins className="h-4 w-4 text-gold" />
            Skins
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Pot <span className="text-gold">$80</span> on hole 15
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {skins.map((s) => (
            <div
              key={s.hole}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center",
                s.status === "won" && "border-money/40 bg-money/10",
                s.status === "carry" && "border-bubble/40 bg-bubble/10",
                s.status === "pending" && "border-gold/50 bg-gold/15 animate-pulse-glow",
                s.status === "open" && "border-border bg-surface-2",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                H{s.hole}
              </span>
              <span className={cn(
                "font-tabular text-sm font-extrabold",
                s.status === "pending" ? "text-gold" :
                s.status === "won" ? "text-money" :
                s.status === "carry" ? "text-bubble" : "text-foreground/70",
              )}>
                ${s.amount}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {s.status === "won" ? s.who : s.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
