import { Trophy, Zap, Swords, ClipboardList, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "board",    label: "Board",    icon: Trophy },
  { key: "score",    label: "Score",    icon: Zap },
  { key: "matchups", label: "Matchups", icon: Swords },
  { key: "cards",    label: "Cards",    icon: ClipboardList },
  { key: "admin",    label: "Admin",    icon: Settings2 },
];

export function BottomNav({ active = "board" }: { active?: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex h-9 w-12 items-center justify-center rounded-xl transition-all",
                  isActive && "bg-primary/15 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent)]",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2.4} />
              </span>
              <span className="tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
