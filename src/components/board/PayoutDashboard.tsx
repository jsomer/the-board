import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Trophy,
  Lock,
  Loader2,
  Save,
  Target,
  Coins,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBoardData } from "@/lib/board/context";
import { listGroups, type EventGroup } from "@/lib/api/groups";
import { finalizeEvent, updateEventPayouts, type FinalizeError } from "@/lib/api/events";
import { ApiError } from "@/lib/api/client";
import type { EventPlayer, EventRecord, SkinsState } from "@/lib/api/types";
import { scoreVsField } from "@/lib/board/derive";
import {
  normalizePayouts,
  buildPayoutUpdateBody,
  placePayoutByRank,
  sumPlaces,
  type NormalizedPayouts,
} from "@/lib/board/payouts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RankedRow {
  rank: number; // 1-based, ties share rank
  player: EventPlayer;
  payout: number;
}

function formatScoreCell(
  p: EventPlayer,
  pars: number[],
  scoring: EventRecord["scoring_type"],
): string {
  if (scoring === "stableford") {
    const diff = p.achieved + (p.adjustment ?? 0) - p.quota;
    return diff > 0 ? `+${diff}` : `${diff}`;
  }
  let s = 0;
  for (let i = 0; i < p.holeScores.length; i++) {
    if (p.holeScores[i] > 0) s += p.holeScores[i] - (pars[i] ?? 4);
  }
  if (s === 0) return "E";
  return s > 0 ? `+${s}` : `${s}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rankPlayers(event: EventRecord, np: NormalizedPayouts): RankedRow[] {
  const pars = event.hole_pars;
  const scored = event.players.map((p) => ({
    p,
    s: scoreVsField(p, pars, event.scoring_type),
  }));
  scored.sort((a, b) => a.s - b.s);
  const rows: { player: EventPlayer; rank: number }[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  scored.forEach((row, i) => {
    const rank = lastScore !== null && row.s === lastScore ? lastRank : i + 1;
    rows.push({ player: row.p, rank });
    lastScore = row.s;
    lastRank = rank;
  });
  const payoutMap = placePayoutByRank(
    np,
    rows.map((r) => ({ player_id: r.player.player_id, rank: r.rank })),
  );
  return rows.map(({ player, rank }) => ({
    rank,
    player,
    payout: payoutMap.get(String(player.player_id)) ?? 0,
  }));
}

interface SkinHoleRow {
  hole: number;
  status: "unplayed" | "won" | "tied" | "carried";
  winnerName: string | null;
  carryIn: number;
  payout: number;
}

function buildSkinRows(event: EventRecord, skins: SkinsState | null): SkinHoleRow[] {
  if (!skins) return [];
  const playerName = new Map<string, string>(
    event.players.map((p) => [String(p.player_id), p.name]),
  );
  const holes = Array.isArray(skins.holes) ? skins.holes : [];
  const byHole = new Map(holes.map((h) => [h.hole, h]));
  const perHoleBase = skins.pot > 0 ? skins.pot / 18 : 0;
  const out: SkinHoleRow[] = [];
  for (let h = 1; h <= 18; h++) {
    const sh = byHole.get(h);
    const leader = event.hole_leaders?.find((l) => l.hole === h);
    if (sh?.winner != null) {
      out.push({
        hole: h,
        status: "won",
        winnerName: playerName.get(String(sh.winner)) ?? `Player ${sh.winner}`,
        carryIn: sh.carryIn ?? 0,
        payout: Math.round(((sh.carryIn ?? 0) + 1) * perHoleBase),
      });
    } else if (leader && leader.status === "tied") {
      out.push({ hole: h, status: "tied", winnerName: null, carryIn: sh?.carryIn ?? 0, payout: 0 });
    } else if (sh && sh.carryIn > 0) {
      out.push({ hole: h, status: "carried", winnerName: null, carryIn: sh.carryIn, payout: 0 });
    } else {
      out.push({ hole: h, status: "unplayed", winnerName: null, carryIn: 0, payout: 0 });
    }
  }
  return out;
}

export function PayoutDashboard() {
  const { rawEvent, skins, eventId, refresh } = useBoardData();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [ackOther, setAckOther] = useState(false);

  // Editable breakdown state, seeded from event when it loads/changes.
  const [draft, setDraft] = useState<NormalizedPayouts | null>(null);
  const [savedDraft, setSavedDraft] = useState<NormalizedPayouts | null>(null);
  const [saving, setSaving] = useState(false);
  const [ctpNotes, setCtpNotes] = useState({ holes: "", winners: "" });

  // Reseed when the event identity (id) changes — don't clobber edits on poll.
  const seedKey = rawEvent?.id ?? null;
  useEffect(() => {
    if (!rawEvent) return;
    const np = normalizePayouts(rawEvent);
    setDraft(np);
    setSavedDraft(np);
  }, [seedKey, rawEvent]);

  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId!),
    enabled: eventId != null,
    refetchInterval: 8000,
  });
  const groups: EventGroup[] = groupsQ.data ?? [];

  const ranked = useMemo<RankedRow[]>(() => {
    if (!rawEvent || !draft) return [];
    return rankPlayers(rawEvent, draft);
  }, [rawEvent, draft]);

  if (!rawEvent || !draft) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Load a live event to view the payout dashboard.
      </div>
    );
  }

  const isFinal = rawEvent.status === "final";
  const allApproved = groups.length > 0 && groups.every((g) => g.status === "approved");
  const incompleteGroups = groups.filter((g) => g.status !== "approved");
  const incompletePlayers = rawEvent.players.filter((p) => !p.round_complete);
  const allComplete = incompletePlayers.length === 0 && rawEvent.players.length > 0;
  const placesPaid = sumPlaces(draft);
  const computedOther = Math.max(
    0,
    rawEvent.total_pot - placesPaid - draft.skinsAmt - draft.ctpsAmt,
  );
  // keep otherAmt always in sync (read-only)
  const draftWithOther: NormalizedPayouts = { ...draft, otherAmt: computedOther };
  const overage =
    placesPaid + draft.skinsAmt + draft.ctpsAmt > rawEvent.total_pot
      ? placesPaid + draft.skinsAmt + draft.ctpsAmt - rawEvent.total_pot
      : 0;

  const dirty =
    !!savedDraft &&
    (savedDraft.skinsAmt !== draft.skinsAmt ||
      savedDraft.ctpsAmt !== draft.ctpsAmt ||
      savedDraft.placeAmounts.length !== draft.placeAmounts.length ||
      savedDraft.placeAmounts.some((v, i) => v !== draft.placeAmounts[i]));

  const otherOk = computedOther === 0 || ackOther;
  const ready = allApproved && allComplete && !isFinal && overage === 0 && otherOk && !dirty;

  // Skins reconciliation
  const skinRows = buildSkinRows(rawEvent, skins);
  const skinsPaidTotal = skinRows.reduce((s, r) => s + r.payout, 0);
  const skinsUnawarded = Math.max(0, draft.skinsAmt - skinsPaidTotal);

  const updatePlace = (idx: number, value: number) => {
    setDraft((d) => {
      if (!d) return d;
      const arr = d.placeAmounts.slice();
      arr[idx] = Math.max(0, Math.floor(value || 0));
      return { ...d, placeAmounts: arr };
    });
  };

  const handleSave = async () => {
    if (!eventId || !rawEvent) return;
    if (overage > 0) {
      toast.error("Total exceeds the pot — reduce amounts before saving.");
      return;
    }
    setSaving(true);
    try {
      const body = buildPayoutUpdateBody(draftWithOther, rawEvent.total_pot);
      await updateEventPayouts(eventId, body);
      toast.success("Payout structure saved");
      setSavedDraft(draftWithOther);
      refresh();
    } catch (e) {
      const err = e as ApiError;
      toast.error("Could not save payouts", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!eventId) return;
    setFinalizing(true);
    setBlockerError(null);
    try {
      await finalizeEvent(eventId);
      toast.success("Event finalized");
      setConfirmOpen(false);
      refresh();
    } catch (e) {
      const err = e as FinalizeError & ApiError;
      if (err.status === 409) {
        toast.error("This event is already finalized");
        refresh();
        setConfirmOpen(false);
      } else if (err.status === 400 && err.incomplete?.length) {
        const names = err.incomplete
          .map((p) => `${p.name} (${rawEvent.players.find((x) => Number(x.player_id) === p.player_id)?.thru ?? "?"} holes)`)
          .join(", ");
        setBlockerError(`Finalization blocked — missing scores: ${names}`);
        setConfirmOpen(false);
      } else {
        toast.error("Could not finalize event", { description: err.message });
        setConfirmOpen(false);
      }
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-3">
      {isFinal && (
        <div className="flex items-center gap-2 rounded-2xl border border-money/40 bg-money/10 px-3 py-2 text-sm font-semibold text-money">
          <Lock className="h-4 w-4" /> Event finalized — results are locked.
        </div>
      )}

      {blockerError && (
        <div className="flex items-start gap-2 rounded-2xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{blockerError}</span>
        </div>
      )}

      {/* Section 1 — Pot Summary (editable) */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-money" />
            <h3 className="text-sm font-extrabold">Pot summary</h3>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Total ${rawEvent.total_pot}
          </span>
        </div>

        <div className="space-y-1.5">
          {draft.placeAmounts.map((amt, i) => (
            <PayoutLine
              key={i}
              label={`${ordinal(i + 1)} place`}
              value={amt}
              disabled={isFinal}
              onChange={(v) => updatePlace(i, v)}
            />
          ))}
          <PayoutLine
            label="Skins"
            value={draft.skinsAmt}
            disabled={isFinal}
            onChange={(v) =>
              setDraft((d) => (d ? { ...d, skinsAmt: Math.max(0, Math.floor(v || 0)) } : d))
            }
          />
          <PayoutLine
            label="Closest-to-Pin"
            value={draft.ctpsAmt}
            disabled={isFinal}
            onChange={(v) =>
              setDraft((d) => (d ? { ...d, ctpsAmt: Math.max(0, Math.floor(v || 0)) } : d))
            }
          />
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border px-3 py-2 text-sm",
              computedOther > 0
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-border bg-surface-2/50 text-muted-foreground",
            )}
          >
            <span className="font-semibold">Other / Remainder</span>
            <span className="font-tabular font-extrabold">${computedOther}</span>
          </div>
          {computedOther > 0 && (
            <p className="px-1 text-[11px] text-muted-foreground">
              Distribute manually or adjust amounts above.
            </p>
          )}
          {overage > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-down/40 bg-down/10 px-3 py-1.5 text-[12px] font-semibold text-down">
              <AlertTriangle className="h-3.5 w-3.5" /> Total exceeds pot by ${overage}
            </div>
          )}
        </div>

        {!isFinal && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving || overage > 0}
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-primary-foreground shadow-card",
                "disabled:opacity-40",
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </div>
        )}
      </div>

      {/* Section A — Readiness */}
      {!isFinal && (
        <div
          className={cn(
            "rounded-2xl border p-3.5 shadow-card",
            ready ? "border-money/40 bg-money/5" : "border-gold/40 bg-gold/5",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            {ready ? (
              <CheckCircle2 className="h-4 w-4 text-money" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-gold" />
            )}
            <h3 className="text-sm font-extrabold">
              {ready ? "Ready to finalize" : "Not ready to finalize"}
            </h3>
          </div>
          <ul className="space-y-1.5 text-[12px]">
            <ChecklistRow ok={allApproved} label="All groups approved">
              {!allApproved && incompleteGroups.length > 0 && (
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-muted-foreground">
                  {incompleteGroups.map((g) => (
                    <li key={g.id}>
                      {g.name} — <span className="capitalize">{g.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {groups.length === 0 && (
                <div className="ml-4 mt-0.5 text-muted-foreground">No groups defined yet.</div>
              )}
            </ChecklistRow>
            <ChecklistRow ok={allComplete} label="All scores complete">
              {!allComplete && (
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-muted-foreground">
                  {incompletePlayers.map((p) => (
                    <li key={p.player_id}>
                      {p.name} — {p.thru} hole{p.thru === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              )}
            </ChecklistRow>
            <ChecklistRow ok={!dirty} label="Payout structure saved" />
            <ChecklistRow ok={overage === 0} label="Amounts within total pot" />
          </ul>

          {computedOther > 0 && (
            <label className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[12px]">
              <input
                type="checkbox"
                checked={ackOther}
                onChange={(e) => setAckOther(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I will distribute the ${computedOther} remainder manually.
              </span>
            </label>
          )}
        </div>
      )}

      {/* Section 2 — Place Payout Review */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-extrabold">
            {isFinal ? "Final standings" : "Projected standings"}
          </h3>
        </div>
        {ranked.length === 0 ? (
          <div className="text-sm text-muted-foreground">No players in this event.</div>
        ) : draft.placeAmounts.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
            No payout structure configured.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Player</th>
                  <th className="px-2 py-1.5 text-right">Score</th>
                  <th className="px-2 py-1.5 text-right">Thru</th>
                  <th className="px-2 py-1.5 text-right">$</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, idx) => {
                  const showDivider = !isFinal && idx + 1 === draft.placeAmounts.length;
                  const tied = ranked.filter((r) => r.rank === row.rank).length > 1;
                  const dollars = isFinal ? row.player.winnings ?? 0 : row.payout;
                  const incomplete = !row.player.round_complete;
                  return (
                    <tr
                      key={row.player.player_id}
                      className={cn(
                        "border-t border-border",
                        showDivider && "border-b-2 border-b-primary/40",
                        incomplete && !isFinal && "bg-gold/5",
                      )}
                    >
                      <td className="px-2 py-1.5 font-tabular font-bold">
                        {tied ? `T${row.rank}` : row.rank}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">
                        {row.player.name}
                        {tied && (
                          <span
                            title="Holes ranked by handicap difficulty; lower gross score on hardest hole wins."
                            className="ml-1.5 rounded bg-gold/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold"
                          >
                            T · tiebreak
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-tabular">
                        {formatScoreCell(row.player, rawEvent.hole_pars, rawEvent.scoring_type)}
                        {rawEvent.scoring_type === "stableford" ? " pts" : ""}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-tabular",
                          incomplete ? "text-gold font-bold" : "text-muted-foreground",
                        )}
                      >
                        {row.player.thru}/18
                      </td>
                      <td className="px-2 py-1.5 text-right font-tabular font-extrabold text-money">
                        {dollars > 0 ? `$${dollars}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isFinal && incompletePlayers.length > 0 && (
          <p className="mt-2 text-[11px] font-semibold text-gold">
            Scores incomplete — cannot finalize.
          </p>
        )}
      </div>

      {/* Section 3 — Skins Review */}
      {skins && (
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-money" />
              <h3 className="text-sm font-extrabold">Skins</h3>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Pot ${draft.skinsAmt || skins.pot}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Hole</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Winner</th>
                  <th className="px-2 py-1.5 text-right">$</th>
                </tr>
              </thead>
              <tbody>
                {skinRows.map((r) => (
                  <tr key={r.hole} className="border-t border-border">
                    <td className="px-2 py-1.5 font-tabular text-muted-foreground">{r.hole}</td>
                    <td className="px-2 py-1.5 capitalize">
                      {r.status === "won" ? (
                        <span className="text-money font-semibold">Won</span>
                      ) : r.status === "tied" ? (
                        <span className="text-down">Tied / Dead</span>
                      ) : r.status === "carried" ? (
                        <span className="text-gold">Carried</span>
                      ) : (
                        <span className="text-muted-foreground">Unplayed</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.winnerName ? (
                        <>
                          <span className="font-semibold">{r.winnerName}</span>
                          {r.carryIn > 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (+{r.carryIn} carry)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-tabular font-bold text-money">
                      {r.payout > 0 ? `$${r.payout}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-2/50">
                  <td colSpan={3} className="px-2 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Paid out
                  </td>
                  <td className="px-2 py-1.5 text-right font-tabular font-extrabold text-money">
                    ${skinsPaidTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {skinsUnawarded > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-[12px] text-gold">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Skins paid (${skinsPaidTotal}) ≠ skins pot (${draft.skinsAmt || skins.pot}) — $
                {skinsUnawarded} unawarded. Unresolved skins carry to "Other".
              </span>
            </div>
          )}
        </div>
      )}

      {/* Section 4 — Closest-to-Pin */}
      {draft.ctpsAmt > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-bubble" />
              <h3 className="text-sm font-extrabold">Closest-to-Pin</h3>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Pool ${draft.ctpsAmt}
            </span>
          </div>
          <div className="space-y-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Holes</span>
              <input
                value={ctpNotes.holes}
                onChange={(e) => setCtpNotes((s) => ({ ...s, holes: e.target.value }))}
                placeholder="e.g. 3, 8, 12, 17"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Winners</span>
              <input
                value={ctpNotes.winners}
                onChange={(e) => setCtpNotes((s) => ({ ...s, winners: e.target.value }))}
                placeholder="e.g. Smith, Jones, Walker, Davis"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              Distribute ${draft.ctpsAmt} in cash at the course. Notes are local — not saved to the API.
            </p>
          </div>
        </div>
      )}

      {/* Section 5 — Other / Remainder explainer */}
      {computedOther > 0 && (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 p-3.5 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <Info className="h-4 w-4 text-gold" />
            <h3 className="text-sm font-extrabold">Other / Remainder — ${computedOther}</h3>
          </div>
          <p className="text-[12px] text-muted-foreground">
            ${computedOther} to distribute at admin discretion — typically added to 1st place or
            split among winners. Common sources: rounding residual, manually designated pot, or
            unresolved skins that carried past hole 18.
          </p>
        </div>
      )}

      {/* Section 6 — Finalize */}
      {!isFinal && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!ready || finalizing}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wider shadow-card transition-all",
            ready
              ? "bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] text-primary-foreground"
              : "bg-surface-2 text-muted-foreground",
            "disabled:opacity-50",
          )}
        >
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Approve & Finalize
        </button>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !finalizing && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize payouts?</DialogTitle>
            <DialogDescription>
              This locks all scores and sets final winnings. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-[12px]">
            {ranked
              .filter((r) => r.payout > 0)
              .map((r) => {
                const tied = ranked.filter((x) => x.rank === r.rank).length > 1;
                return (
                  <div key={r.player.player_id} className="flex justify-between py-0.5">
                    <span>
                      {tied ? `T${r.rank}` : ordinal(r.rank)} — {r.player.name}
                    </span>
                    <span className="font-tabular font-bold text-money">${r.payout}</span>
                  </div>
                );
              })}
            {draft.skinsAmt > 0 && (
              <div className="flex justify-between py-0.5 border-t border-border mt-1 pt-1">
                <span>Skins — see breakdown</span>
                <span className="font-tabular font-bold text-money">${draft.skinsAmt}</span>
              </div>
            )}
            {draft.ctpsAmt > 0 && (
              <div className="flex justify-between py-0.5">
                <span>CTP — manual</span>
                <span className="font-tabular font-bold text-money">${draft.ctpsAmt}</span>
              </div>
            )}
            {computedOther > 0 && (
              <div className="flex justify-between py-0.5">
                <span>Other / Remainder</span>
                <span className="font-tabular font-bold text-gold">${computedOther}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
              <span>Total</span>
              <span className="font-tabular text-foreground">${rawEvent.total_pot} ✓</span>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={finalizing}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Finalize Event
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayoutLine({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-tabular text-sm font-bold outline-none focus:border-primary disabled:opacity-60"
        />
      </div>
    </div>
  );
}

function ChecklistRow({
  ok,
  label,
  children,
}: {
  ok: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-money" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-gold" />
        )}
        <span className={cn("font-semibold", ok ? "text-money" : "text-foreground")}>{label}</span>
      </div>
      {children}
    </li>
  );
}
