import { Trophy, Zap, Swords, ClipboardList, Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "board",    label: "Board",    icon: Trophy,         to: "/" as const },
  { key: "score",    label: "Score",    icon: Zap,            to: "/score" as const },
  { key: "matchups", label: "Matchups", icon: Swords,         to: "/" as const },
  { key: "cards",    label: "Cards",    icon: ClipboardList,  to: "/" as const },
  { key: "admin",    label: "Admin",    icon: Settings2,      to: "/admin" as const },
];

export function BottomNav({ active = "board" }: { active?: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {ITEMS.map(({ key, label, icon: Icon, to }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              to={to}
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
