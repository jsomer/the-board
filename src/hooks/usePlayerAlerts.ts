import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";

const CASH_LINE = 3;

type Snap = { pos: number; skins: number; projected: number };

/**
 * Watches the logged-in player's standing and fires push-style toasts when:
 *  - they get passed (position drops),
 *  - they win a skin (skins count increases),
 *  - they drop off the cash line (were ≤3, now >3).
 *
 * "Me" defaults to the first player until real auth is wired in.
 */
export function usePlayerAlerts(meId?: string) {
  const { players } = useBoardData();
  const prev = useRef<Map<string, Snap> | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    if (!players.length) return;
    const sorted = [...players].sort((a, b) => a.toPar - b.toPar);
    const snap = new Map<string, Snap>();
    sorted.forEach((p, i) => {
      snap.set(p.id, { pos: i + 1, skins: p.skins, projected: p.projected });
    });

    // First pass: just record the baseline; never toast on initial mount.
    if (!armed.current) {
      prev.current = snap;
      armed.current = true;
      return;
    }

    const me = meId ?? sorted[0]?.id;
    if (!me) {
      prev.current = snap;
      return;
    }
    const mePlayer = players.find((p) => p.id === me);
    const before = prev.current?.get(me);
    const after = snap.get(me);

    if (before && after && mePlayer) {
      // 1) Got passed — at least one player moved ahead of you
      if (after.pos > before.pos) {
        const passedBy = findPassers(prev.current!, snap, me);
        const who =
          passedBy.length === 1
            ? players.find((p) => p.id === passedBy[0])?.name ?? "Someone"
            : `${passedBy.length} players`;
        toast.error(`Passed by ${who}`, {
          description: `You dropped to ${ordinal(after.pos)}. Hole ${mePlayer.thru}.`,
          icon: "↓",
        });
      }

      // 2) Won a skin
      if (after.skins > before.skins) {
        const delta = after.skins - before.skins;
        toast.success(delta > 1 ? `Won ${delta} skins!` : "Skin won!", {
          description: `Total skins: ${after.skins}. Keep it rolling.`,
          icon: "🔥",
        });
      }

      // 3) Dropped off the cash line
      if (before.pos <= CASH_LINE && after.pos > CASH_LINE) {
        toast.warning("Off the cash line", {
          description: `Now ${ordinal(after.pos)} — projected $${after.projected}.`,
          icon: "⚠",
        });
      }

      // Bonus: moved onto the cash line (positive feedback loop)
      if (before.pos > CASH_LINE && after.pos <= CASH_LINE) {
        toast.success("Into the money!", {
          description: `Up to ${ordinal(after.pos)} — projected $${after.projected}.`,
          icon: "💰",
        });
      }
    }

    prev.current = snap;
  }, [players, meId]);
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function findPassers(
  before: Map<string, Snap>,
  after: Map<string, Snap>,
  meId: string,
): string[] {
  const beforeMe = before.get(meId)!;
  const afterMe = after.get(meId)!;
  const passers: string[] = [];
  for (const [id, b] of before.entries()) {
    if (id === meId) continue;
    const a = after.get(id);
    if (!a) continue;
    // They were behind you, now ahead.
    if (b.pos > beforeMe.pos && a.pos < afterMe.pos) passers.push(id);
  }
  return passers;
}

export type { Player };
