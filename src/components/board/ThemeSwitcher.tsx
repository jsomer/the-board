import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ThemeKey = "dk" | "espn" | "apple";

const THEMES: { key: ThemeKey; label: string; sub: string }[] = [
  { key: "dk",    label: "Vegas",   sub: "Sportsbook" },
  { key: "espn",  label: "Network", sub: "Broadcast" },
  { key: "apple", label: "Minimal", sub: "Clean" },
];

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeKey>("dk");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dk", "theme-espn", "theme-apple");
    root.classList.add(`theme-${theme}`);
  }, [theme]);

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface/80 p-1 backdrop-blur">
      {THEMES.map((t) => {
        const active = t.key === theme;
        return (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
