import { Trophy, Zap, Swords, Target, Settings2, LogOut } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useBoardData } from "@/lib/board/context";
import { useMe } from "@/hooks/useMe";
import { getStoredIsAdmin } from "@/lib/api/auth";

const BASE_ITEMS = [
  { key: "board",    label: "Board",    icon: Trophy,     to: "/" as const },
  { key: "score",    label: "Score",    icon: Zap,        to: "/score" as const },
  { key: "matchups", label: "Matchups", icon: Swords,     to: "/matchups" as const },
  { key: "cards",    label: "Quota",    icon: Target,     to: "/leaderboard" as const },
];
const ADMIN_ITEM = { key: "admin", label: "Admin", icon: Settings2, to: "/admin" as const };

export function BottomNav({ active = "board" }: { active?: string }) {
  const { logout, authed } = useBoardData();
  const { isAdmin } = useMe();
  const showAdmin = isAdmin || getStoredIsAdmin();
  const ITEMS = showAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  const handleLogout = () => {
    if (window.confirm("Sign out of The Board?")) logout();
  };

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
        {authed && (
          <button
            type="button"
            onClick={handleLogout}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Sign out"
          >
            <span className="flex h-9 w-12 items-center justify-center rounded-xl transition-all">
              <LogOut className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="tracking-wide">Sign out</span>
          </button>
        )}
      </div>
    </nav>
  );
}
