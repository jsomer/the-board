import { Radio, ArrowLeftRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBoardData } from "@/lib/board/context";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { StatusBar } from "./StatusBar";

export function EventHeader() {
  const { event, players, isMock } = useBoardData();
  const onCourse = players.filter((p) => p.thru > 0 && p.thru < 18).length || players.length;
  return (
    <header className="pb-3">
      <StatusBar />
      <div className="flex items-start justify-between gap-3 px-4 pt-1">

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              Live · Hole {event.hole}/{event.totalHoles}
            </span>
          </div>
          <h1 className="mt-1 font-mono text-[26px] font-extrabold leading-tight tracking-widest">
            {event.eventCode ?? event.name}
          </h1>
          {event.eventDate && (
            <p className="text-[11px] font-semibold text-muted-foreground">
              {new Date(event.eventDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {event.format}
            {isMock && <span className="ml-1.5 rounded bg-bubble/15 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-bubble">Demo</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/events"
            className="flex items-center gap-1 rounded-full border border-border bg-surface/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            aria-label="Switch event"
          >
            <ArrowLeftRight className="h-3 w-3" />
            Switch
          </Link>
          <ThemeSwitcher />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 px-4">
        <Stat label="Pot" value={`$${event.pot}`} accent="money" />
        <Stat label="Skins" value={`$${event.skinsPot}`} accent="gold" />
        <Stat label="On Course" value={String(onCourse)} accent="muted" icon={<Radio className="h-3 w-3" />} />
      </div>
    </header>
  );
}

function Stat({
  label, value, accent, icon,
}: { label: string; value: string; accent: "money" | "gold" | "muted"; icon?: React.ReactNode }) {
  const color =
    accent === "money" ? "text-money" : accent === "gold" ? "text-gold" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface/70 px-3 py-2 shadow-card">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`font-tabular text-lg font-extrabold ${color}`}>{value}</div>
    </div>
  );
}
