import { useBoardData } from "@/lib/board/context";

export function Ticker() {
  const { tickerItems } = useBoardData();
  const items = [...tickerItems, ...tickerItems];
  return (
    <div className="ticker-mask relative overflow-hidden border-y border-border bg-surface/60">
      <div className="flex w-max animate-ticker gap-8 py-2 pr-8">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap text-xs">
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-bold uppercase tracking-wider text-primary">
              {item.tag}
            </span>
            <span className="text-foreground/80">{item.text}</span>
            <span className="text-muted-foreground/40">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
