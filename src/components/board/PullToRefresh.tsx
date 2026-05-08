import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER = 70; // px pull to trigger refresh
const MAX = 110;    // visual cap

interface Props {
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
  children: ReactNode;
}

/**
 * Touch-driven pull-to-refresh. Activates only when the page is scrolled to the
 * top and the gesture starts as a downward drag — does not interfere with
 * normal scrolling, horizontal swipes, or button taps.
 */
export function PullToRefresh({ onRefresh, isRefreshing, children }: Props) {
  const [pull, setPull] = useState(0);
  const [armed, setArmed] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);
  const settling = useRef(false);

  // Auto-collapse once an external refresh completes
  useEffect(() => {
    if (!isRefreshing && settling.current) {
      settling.current = false;
      setPull(0);
      setArmed(false);
    }
  }, [isRefreshing]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || isRefreshing) return;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        // Upward — abandon gesture, let the browser scroll
        tracking.current = false;
        setPull(0);
        setArmed(false);
        return;
      }
      // Rubber-band resistance
      const eased = Math.min(MAX, dy * 0.5);
      setPull(eased);
      setArmed(eased >= TRIGGER);
      if (eased > 4) e.preventDefault(); // suppress overscroll once we own the gesture
    };

    const onTouchEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      if (armed) {
        settling.current = true;
        setPull(TRIGGER);
        Promise.resolve(onRefresh()).finally(() => {
          // Safety net if isRefreshing prop is not wired
          window.setTimeout(() => {
            if (settling.current) {
              settling.current = false;
              setPull(0);
              setArmed(false);
            }
          }, 1200);
        });
      } else {
        setPull(0);
        setArmed(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [armed, isRefreshing, onRefresh]);

  const showing = pull > 4 || isRefreshing;
  const progress = Math.min(1, pull / TRIGGER);

  return (
    <>
      {/* Indicator overlay */}
      <div
        aria-hidden={!showing}
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center transition-opacity",
          showing ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translateY(${Math.max(0, pull - 8)}px)` }}
      >
        <div className={cn(
          "mt-2 flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider shadow-card backdrop-blur",
          armed || isRefreshing ? "text-money" : "text-muted-foreground",
        )}>
          {isRefreshing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing
            </>
          ) : armed ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Release to refresh
            </>
          ) : (
            <>
              <ArrowDown
                className="h-3.5 w-3.5 transition-transform"
                style={{ transform: `rotate(${progress * 180}deg)` }}
              />
              Pull to refresh
            </>
          )}
        </div>
      </div>

      {/* Content nudges down so the gesture feels physical */}
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: tracking.current ? "none" : "transform 220ms ease-out",
        }}
      >
        {children}
      </div>
    </>
  );
}
