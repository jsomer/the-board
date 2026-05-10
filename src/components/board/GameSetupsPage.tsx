import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Star, Trash2, Pencil, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { getMe, getStoredIsAdmin, isAuthenticated } from "@/lib/api/auth";
import {
  DEFAULT_PAYOUT_RULES,
  DEFAULT_POINTS_RULES,
  DEFAULT_STABLEFORD_POINTS,
  HANDICAP_SOURCES,
  SCORING_SCOPES,
  SCORING_TYPES,
  createGameSetup,
  createGameSetupSchema,
  deleteGameSetup,
  getUserSettings,
  listGameSetups,
  makeDefaultGameSetup,
  updateGameSetup,
  updateGameSetupSchema,
  type CreateGameSetupInput,
  type UpdateGameSetupInput,
} from "@/lib/api/gameSetups";
import type {
  GameSetup,
  GameSetupHandicapSource,
  GameSetupScoringScope,
  GameSetupScoringType,
} from "@/lib/api/types";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { BottomNav } from "./BottomNav";

type FormState = {
  name: string;
  entryFee: string;
  scoringType: GameSetupScoringType;
  handicapSource: GameSetupHandicapSource;
  scoringScope: GameSetupScoringScope;
  firstPlacePct: string;
  secondPlacePct: string;
  thirdPlacePct: string;
  skinsPct: string;
  ctpsPct: string;
  otherPct: string;
  roundingIncrement: string;
  minimumPayout: string;
};

const emptyForm: FormState = {
  name: "",
  entryFee: "20",
  scoringType: "stableford",
  handicapSource: "usga",
  scoringScope: "overall",
  firstPlacePct: String(DEFAULT_PAYOUT_RULES.firstPlacePct ?? 50),
  secondPlacePct: String(DEFAULT_PAYOUT_RULES.secondPlacePct ?? 30),
  thirdPlacePct: String(DEFAULT_PAYOUT_RULES.thirdPlacePct ?? 20),
  skinsPct: String(DEFAULT_PAYOUT_RULES.skinsPct ?? 0),
  ctpsPct: String(DEFAULT_PAYOUT_RULES.ctpsPct ?? 0),
  otherPct: String(DEFAULT_PAYOUT_RULES.otherPct ?? 0),
  roundingIncrement: String(DEFAULT_PAYOUT_RULES.roundingIncrement ?? 1),
  minimumPayout: String(DEFAULT_PAYOUT_RULES.minimumPayout ?? 0),
};

function setupToForm(s: GameSetup): FormState {
  const p = s.payout_rules_json ?? {};
  return {
    name: s.name,
    entryFee: String(s.entry_fee ?? 0),
    scoringType: (s.scoring_type as GameSetupScoringType) ?? "stableford",
    handicapSource: (s.handicap_source as GameSetupHandicapSource) ?? "usga",
    scoringScope: (s.scoring_scope as GameSetupScoringScope) ?? "overall",
    firstPlacePct: String(p.firstPlacePct ?? DEFAULT_PAYOUT_RULES.firstPlacePct ?? 0),
    secondPlacePct: String(p.secondPlacePct ?? DEFAULT_PAYOUT_RULES.secondPlacePct ?? 0),
    thirdPlacePct: String(p.thirdPlacePct ?? DEFAULT_PAYOUT_RULES.thirdPlacePct ?? 0),
    skinsPct: String(p.skinsPct ?? 0),
    ctpsPct: String(p.ctpsPct ?? 0),
    otherPct: String(p.otherPct ?? 0),
    roundingIncrement: String(p.roundingIncrement ?? DEFAULT_PAYOUT_RULES.roundingIncrement ?? 1),
    minimumPayout: String(p.minimumPayout ?? DEFAULT_PAYOUT_RULES.minimumPayout ?? 0),
  };
}

function formToInput(f: FormState): CreateGameSetupInput {
  return {
    name: f.name.trim(),
    entryFee: Number(f.entryFee),
    scoringType: f.scoringType,
    handicapSource: f.handicapSource,
    scoringScope: f.scoringScope,
    payoutRules: {
      firstPlacePct: Number(f.firstPlacePct),
      secondPlacePct: Number(f.secondPlacePct),
      thirdPlacePct: Number(f.thirdPlacePct),
      skinsPct: Number(f.skinsPct),
      ctpsPct: Number(f.ctpsPct),
      otherPct: Number(f.otherPct),
      roundingIncrement: Number(f.roundingIncrement),
      minimumPayout: Number(f.minimumPayout),
    },
    stablefordPoints: DEFAULT_STABLEFORD_POINTS,
    pointsRules: DEFAULT_POINTS_RULES,
  };
}

export function GameSetupsPage() {
  const qc = useQueryClient();
  const meQ = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    enabled: isAuthenticated(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isAdmin = Boolean(meQ.data?.isAdmin) || getStoredIsAdmin();

  const setupsQ = useQuery({
    queryKey: ["game-setups"],
    queryFn: listGameSetups,
    staleTime: 60_000,
  });

  const settingsQ = useQuery({
    queryKey: ["user", "settings"],
    queryFn: getUserSettings,
    staleTime: 60_000,
    retry: false,
  });

  const defaultId = settingsQ.data?.defaultGameSetupId ?? null;

  const [editing, setEditing] = useState<{ mode: "create" } | { mode: "edit"; id: number } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const payoutSum = useMemo(() => {
    const keys: (keyof FormState)[] = [
      "firstPlacePct",
      "secondPlacePct",
      "thirdPlacePct",
      "skinsPct",
      "ctpsPct",
      "otherPct",
    ];
    return keys.reduce((acc, k) => acc + (Number(form[k]) || 0), 0);
  }, [form]);

  function startCreate() {
    setForm(emptyForm);
    setErrors({});
    setEditing({ mode: "create" });
  }
  function startEdit(s: GameSetup) {
    setForm(setupToForm(s));
    setErrors({});
    setEditing({ mode: "edit", id: s.id });
  }
  function closeEditor() {
    setEditing(null);
    setErrors({});
  }

  const createMut = useMutation({
    mutationFn: (input: CreateGameSetupInput) => createGameSetup(input),
    onSuccess: () => {
      toast.success("Game setup created");
      qc.invalidateQueries({ queryKey: ["game-setups"] });
      closeEditor();
    },
    onError: (e: unknown) => toast.error(extractError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateGameSetupInput }) => updateGameSetup(id, input),
    onSuccess: () => {
      toast.success("Game setup updated");
      qc.invalidateQueries({ queryKey: ["game-setups"] });
      closeEditor();
    },
    onError: (e: unknown) => toast.error(extractError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteGameSetup(id),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["game-setups"] });
    },
    onError: (e: unknown) => toast.error(extractError(e)),
  });

  const defaultMut = useMutation({
    mutationFn: (id: number) => makeDefaultGameSetup(id),
    onSuccess: (data) => {
      toast.success("Default updated");
      qc.setQueryData(["user", "settings"], (prev: unknown) => {
        const base = (prev as { user_id?: number; updated_at?: string } | undefined) ?? {};
        return { ...base, defaultGameSetupId: data.defaultGameSetupId };
      });
      qc.invalidateQueries({ queryKey: ["user", "settings"] });
    },
    onError: (e: unknown) => toast.error(extractError(e)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const input = formToInput(form);
    const schema = editing.mode === "create" ? createGameSetupSchema : updateGameSetupSchema;
    const result = schema.safeParse(input);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const k = issue.path.join(".");
        fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (Math.round(payoutSum) !== 100) {
      setErrors({ payout: `Payout percentages must sum to 100 (currently ${payoutSum}).` });
      return;
    }
    setErrors({});
    if (editing.mode === "create") createMut.mutate(input);
    else updateMut.mutate({ id: editing.id, input });
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
          <ThemeSwitcher />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight">Game Setups</h1>
          {isAdmin && (
            <button
              onClick={startCreate}
              className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-card"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          )}
        </div>
        {!isAdmin && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Read-only — admins can create, edit, delete, and pick a default.
          </p>
        )}
      </header>

      <section className="mx-4 mt-2 space-y-2">
        {setupsQ.isLoading && <SkeletonRow />}
        {setupsQ.isError && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load game setups. {extractError(setupsQ.error)}
          </div>
        )}
        {setupsQ.data?.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No game setups yet.{isAdmin ? " Create your first one." : ""}
          </div>
        )}
        {setupsQ.data?.map((s) => {
          const isDefault = defaultId === s.id;
          return (
            <article
              key={s.id}
              className={cn(
                "rounded-2xl border bg-card p-3 shadow-card",
                isDefault ? "border-primary/60" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="truncate text-sm font-extrabold">{s.name}</h2>
                    {isDefault && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {labelFor(s.scoring_type)} · {labelFor(s.handicap_source)} · {labelFor(s.scoring_scope)} ·{" "}
                    <span className="font-semibold text-money">${Number(s.entry_fee ?? 0)}</span>
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <IconAction
                      label="Make default"
                      onClick={() => defaultMut.mutate(s.id)}
                      disabled={isDefault || defaultMut.isPending}
                    >
                      <Star className={cn("h-4 w-4", isDefault && "fill-primary text-primary")} />
                    </IconAction>
                    <IconAction label="Edit" onClick={() => startEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="Delete"
                      danger
                      onClick={() => {
                        if (confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id);
                      }}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconAction>
                  </div>
                )}
              </div>
              {s.payout_rules_json && (
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                  <PayoutChip label="1st" pct={s.payout_rules_json.firstPlacePct} />
                  <PayoutChip label="2nd" pct={s.payout_rules_json.secondPlacePct} />
                  <PayoutChip label="3rd" pct={s.payout_rules_json.thirdPlacePct} />
                  <PayoutChip label="Skins" pct={s.payout_rules_json.skinsPct} />
                  <PayoutChip label="CTPs" pct={s.payout_rules_json.ctpsPct} />
                  <PayoutChip label="Other" pct={s.payout_rules_json.otherPct} />
                </div>
              )}
            </article>
          );
        })}
      </section>

      {editing && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-card sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight">
                {editing.mode === "create" ? "New game setup" : "Edit game setup"}
              </h2>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <Field label="Name" error={errors.name}>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Saturday Stableford"
                  maxLength={120}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Entry fee ($)" error={errors.entryFee}>
                  <input
                    className={inputCls}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={form.entryFee}
                    onChange={(e) => setForm((f) => ({ ...f, entryFee: e.target.value }))}
                  />
                </Field>
                <Field label="Scoring type" error={errors.scoringType}>
                  <select
                    className={inputCls}
                    value={form.scoringType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scoringType: e.target.value as GameSetupScoringType }))
                    }
                  >
                    {SCORING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {labelFor(t)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Handicap source" error={errors.handicapSource}>
                  <select
                    className={inputCls}
                    value={form.handicapSource}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, handicapSource: e.target.value as GameSetupHandicapSource }))
                    }
                  >
                    {HANDICAP_SOURCES.map((t) => (
                      <option key={t} value={t}>
                        {labelFor(t)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Scoring scope" error={errors.scoringScope}>
                  <select
                    className={inputCls}
                    value={form.scoringScope}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scoringScope: e.target.value as GameSetupScoringScope }))
                    }
                  >
                    {SCORING_SCOPES.map((t) => (
                      <option key={t} value={t}>
                        {labelFor(t)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Payout rules (%)
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                      Math.round(payoutSum) === 100
                        ? "bg-money/15 text-money"
                        : "bg-destructive/15 text-destructive",
                    )}
                  >
                    Σ {payoutSum}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["firstPlacePct", "1st"],
                      ["secondPlacePct", "2nd"],
                      ["thirdPlacePct", "3rd"],
                      ["skinsPct", "Skins"],
                      ["ctpsPct", "CTPs"],
                      ["otherPct", "Other"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        className={inputCls}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </div>
                {errors.payout && (
                  <p className="mt-1.5 text-[11px] font-semibold text-destructive">{errors.payout}</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface-2/50 p-3">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Payout adjustments
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rounding ($)" error={errors["payoutRules.roundingIncrement"]}>
                    <input
                      className={inputCls}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1}
                      value={form.roundingIncrement}
                      onChange={(e) => setForm((f) => ({ ...f, roundingIncrement: e.target.value }))}
                    />
                  </Field>
                  <Field label="Minimum payout ($)" error={errors["payoutRules.minimumPayout"]}>
                    <input
                      className={inputCls}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1}
                      value={form.minimumPayout}
                      onChange={(e) => setForm((f) => ({ ...f, minimumPayout: e.target.value }))}
                    />
                  </Field>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Place payouts are rounded to this increment; players in paid places receive at least the minimum.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-card disabled:opacity-60"
              >
                {(createMut.isPending || updateMut.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editing.mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      <BottomNav active="admin" />
    </main>
  );
}

function extractError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) {
      const body = e.body as { error?: string; finalized_event_ids?: number[] } | undefined;
      const ids = body?.finalized_event_ids?.join(", ");
      return `${body?.error ?? e.message}${ids ? ` (events: ${ids})` : ""}`;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

function labelFor(v: string | undefined | null): string {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
      {error && <p className="mt-1 text-[11px] font-semibold text-destructive">{error}</p>}
    </label>
  );
}

function IconAction({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg p-1.5 transition-colors disabled:opacity-40",
        danger ? "text-down hover:bg-down/10" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PayoutChip({ label, pct }: { label: string; pct?: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-2/60 px-1.5 py-1">
      <span className="font-semibold uppercase tracking-wider">{label}</span>
      <span className="font-tabular font-bold text-foreground">{pct ?? 0}%</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}
