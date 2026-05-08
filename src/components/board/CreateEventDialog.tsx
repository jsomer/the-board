import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createEvent,
  getPlayerGameQuota,
  listCourses,
  listGameSetups,
  listPlayers,
  updateEvent,
} from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { CreateEventPayload, EventPlayer, EventRecord, GameSetup } from "@/lib/api/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = 1 | 2 | 3 | 4;

const SCORING_LABEL: Record<string, string> = {
  gross_stroke: "Gross Stroke",
  net_stroke: "Net Stroke",
  stableford: "Stableford",
  stroke: "Gross Stroke",
};

function scoringLabel(s: string): string {
  return SCORING_LABEL[s] ?? s;
}

function readErr(e: unknown, fallback = "Request failed"): string {
  if (e instanceof ApiError) {
    const body = e.body as { error?: string; message?: string } | undefined;
    return body?.error || body?.message || e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

export function CreateEventDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [entryFee, setEntryFee] = useState<string>("");
  const [gameSetupId, setGameSetupId] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [createdEvent, setCreatedEvent] = useState<EventRecord | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const setups = useQuery({
    queryKey: ["game-setups"],
    queryFn: listGameSetups,
    enabled: open,
    staleTime: 60_000,
  });
  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
    enabled: open && step >= 3,
    staleTime: 60_000,
  });
  const players = useQuery({
    queryKey: ["players"],
    queryFn: listPlayers,
    enabled: open && step === 4,
    staleTime: 60_000,
  });

  // Reset on close
  useEffect(() => {
    if (open) return;
    setStep(1);
    setName("");
    setEventDate("");
    setStartTime("");
    setEntryFee("");
    setGameSetupId(null);
    setCourseId(null);
    setCreatedEvent(null);
    setSelectedPlayers(new Set());
    setError(null);
  }, [open]);

  const selectedSetup: GameSetup | undefined = useMemo(
    () => setups.data?.find((s) => s.id === gameSetupId),
    [setups.data, gameSetupId],
  );

  const create = useMutation({
    mutationFn: async () => {
      const payload: CreateEventPayload = {
        name: name.trim(),
        gameSetupId: gameSetupId!,
      };
      if (eventDate) payload.eventDate = eventDate;
      if (startTime) payload.startTime = startTime;
      if (courseId != null) payload.courseId = courseId;
      const fee = entryFee.trim();
      if (fee !== "") {
        const n = Number(fee);
        if (!Number.isFinite(n) || n < 0) throw new Error("Entry fee must be ≥ 0");
        payload.entryFee = n;
      }
      return createEvent(payload);
    },
    onSuccess: (evt) => {
      setCreatedEvent(evt);
      void qc.invalidateQueries({ queryKey: ["events"] });
      setStep(4);
    },
    onError: (e) => setError(readErr(e, "Failed to create event")),
  });

  const addPlayers = useMutation({
    mutationFn: async () => {
      if (!createdEvent) throw new Error("No event");
      const list = players.data ?? [];
      const roster: EventPlayer[] = list
        .filter((p) => selectedPlayers.has(p.id))
        .map((p) => ({
          player_id: p.id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          quota: p.game_points_needed ?? 0,
          achieved: 0,
          adjustment: 0,
          holeScores: [],
        }));
      return updateEvent(createdEvent.id, {
        results_json: { players: roster },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["events"] });
      finishToBoard();
    },
    onError: (e) => setError(readErr(e, "Failed to add players")),
  });

  const finishToBoard = () => {
    if (!createdEvent) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("activeEventId", String(createdEvent.id));
    }
    toast.success("Event created", { description: createdEvent.name });
    onOpenChange(false);
    if (typeof window !== "undefined") {
      window.location.href = `/?eventId=${createdEvent.id}`;
    }
  };

  const canNext: Record<Step, boolean> = {
    1: name.trim().length > 0 && (entryFee === "" || Number(entryFee) >= 0),
    2: gameSetupId != null,
    3: true, // course optional
    4: true,
  };

  const handleNext = () => {
    setError(null);
    if (step === 3) {
      create.mutate();
      return;
    }
    if (step < 4) setStep((step + 1) as Step);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1 && step !== 4) setStep((step - 1) as Step);
  };

  const togglePlayer = (id: number) => {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Event {step < 4 ? `· Step ${step} of 3` : "· Add players"}</DialogTitle>
          <DialogDescription>
            {step === 1 && "Name your event and set the date/time."}
            {step === 2 && "Pick a game setup — controls scoring and payouts."}
            {step === 3 && "Pick a course (optional)."}
            {step === 4 && "Pick players to add to this event."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ev-name">Name *</Label>
              <Input
                id="ev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Saturday Skins @ Pinehurst"
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="ev-date">Date</Label>
                <Input id="ev-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ev-time">Start time</Label>
                <Input id="ev-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="ev-fee">Entry fee (optional)</Label>
              <Input
                id="ev-fee"
                type="number"
                min={0}
                step="0.01"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder={selectedSetup?.entry_fee != null ? `Default: ${selectedSetup.entry_fee}` : "Defaults to game setup"}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {setups.isLoading && <LoadingRow />}
            {setups.error && <ErrorRow message={readErr(setups.error, "Failed to load game setups")} />}
            {setups.data?.length === 0 && (
              <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted-foreground">
                No game setups exist. Create one in the GameTracker app first.
              </p>
            )}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {setups.data?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setGameSetupId(s.id)}
                  className={cn(
                    "w-full rounded-xl border bg-surface p-3 text-left transition-colors",
                    gameSetupId === s.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{s.name}</span>
                    {gameSetupId === s.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {scoringLabel(s.scoring_type)}
                    {s.entry_fee != null && ` · Entry $${s.entry_fee}`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            {courses.isLoading && <LoadingRow />}
            {courses.error && <ErrorRow message={readErr(courses.error, "Failed to load courses")} />}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              <button
                type="button"
                onClick={() => setCourseId(null)}
                className={cn(
                  "w-full rounded-xl border bg-surface p-3 text-left transition-colors",
                  courseId === null ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted-foreground">No course selected</span>
                  {courseId === null && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
              {courses.data?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCourseId(c.id)}
                  className={cn(
                    "w-full rounded-xl border bg-surface p-3 text-left transition-colors",
                    courseId === c.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{c.name}</span>
                    {courseId === c.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Event created. Pick players now or skip and add them later.
            </p>
            {players.isLoading && <LoadingRow />}
            {players.error && <ErrorRow message={readErr(players.error, "Failed to load players")} />}
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {players.data?.map((p) => {
                const checked = selectedPlayers.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2 text-left text-sm",
                      checked ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <div>
                      <div className="font-bold">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.usga_handicap != null ? `Hcp ${p.usga_handicap}` : "—"}
                        {p.game_points_needed != null && ` · Quota ${p.game_points_needed}`}
                      </div>
                    </div>
                    {checked ? <Check className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
            <X className="h-3.5 w-3.5 mt-0.5" /> {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {step > 1 && step !== 4 ? (
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={create.isPending}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          ) : (
            <span />
          )}

          {step === 4 ? (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={finishToBoard} disabled={addPlayers.isPending}>
                Skip
              </Button>
              <Button
                size="sm"
                onClick={() => addPlayers.mutate()}
                disabled={selectedPlayers.size === 0 || addPlayers.isPending}
              >
                {addPlayers.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Add {selectedPlayers.size || ""} & open
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={handleNext} disabled={!canNext[step] || create.isPending}>
              {create.isPending && step === 3 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 3 ? (
                <Check className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {step === 3 ? "Create event" : "Next"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface p-4 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{message}</p>
  );
}
