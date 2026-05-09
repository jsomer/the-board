import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardData } from "@/lib/board/context";

const FALLBACK = [
  { hole: 13, status: "won" as const, who: "Reyes", amount: 20 },
  { hole: 14, status: "carry" as const, amount: 40 },
  { hole: 15, status: "pending" as const, amount: 60 },
  { hole: 16, status: "open" as const, amount: 20 },
  { hole: 17, status: "open" as const, amount: 20 },
  { hole: 18, status: "open" as const, amount: 20 },
];

type Strip = { hole: number; status: "won" | "carry" | "pending" | "open"; amount: number; who?: string };

export function SkinsStrip() {
  const { skins, rawEvent, players, event } = useBoardData();

  const strip: Strip[] = (() => {
    if (!skins || !rawEvent) return FALLBACK;
    const safePlayers = Array.isArray(players) ? players : [];
    const skinHoles = Array.isArray(skins.holes) ? skins.holes : [];
    const participants = Array.isArray(skins.participants) ? skins.participants : [];
    const playerName = (id: string | number) => safePlayers.find((p) => p.id === String(id))?.name.split(" ").slice(-1)[0] ?? String(id);
    const perHoleBase = participants.length > 0 ? skins.pot / 18 : 5;
    const liveHole = event.hole;

    const start = Math.max(1, Math.min(13, liveHole - 2));
    const holes = Array.from({ length: 6 }, (_, i) => start + i);
    return holes.map((h) => {
      const rec = skinHoles.find((x) => x.hole === h);
      const carry = rec?.carryIn ?? 0;
      const amount = Math.round((carry + 1) * perHoleBase);
      if (rec?.winner != null) return { hole: h, status: "won", amount, who: playerName(rec.winner) };
      if (h === liveHole) return { hole: h, status: "pending", amount };
      if (carry > 0) return { hole: h, status: "carry", amount };
      return { hole: h, status: "open", amount };
    });
  })();

  const liveSkinHole = strip.find((s) => s.status === "pending");

  return (
    <section className="px-4">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <Coins className="h-4 w-4 text-gold" />
            Skins
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Pot <span className="text-gold">${event.skinsPot || liveSkinHole?.amount || 0}</span>
            {liveSkinHole ? ` on hole ${liveSkinHole.hole}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {strip.map((s) => (
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
