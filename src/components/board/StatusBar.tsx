import { useEffect, useState } from "react";
import { LogOut, RefreshCw, WifiOff } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import { cn } from "@/lib/utils";

function relTime(ts: number | null, now: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function StatusBar() {
  const { lastUpdatedAt, isFetching, isMock, authed, error, refresh, logout } = useBoardData();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const stale = lastUpdatedAt != null && now - lastUpdatedAt > 30_000;

  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),8px)] pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <div className="flex items-center gap-1.5">
        {error ? (
          <span className="flex items-center gap-1 text-bubble">
            <WifiOff className="h-3 w-3" /> Offline
          </span>
        ) : isMock ? (
          <span className="text-bubble">Demo data</span>
        ) : (
          <span className={cn(stale && "text-bubble")}>
            Updated {relTime(lastUpdatedAt, now)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface active:scale-95"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
        {authed && (
          <button
            type="button"
            onClick={logout}
            aria-label="Log out"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
