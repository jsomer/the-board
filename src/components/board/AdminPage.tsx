import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Settings2, Play, Pause, RefreshCcw, DollarSign, Flag, Users,
  Megaphone, Plus, Minus, Lock, Unlock, Trash2, ChevronUp, ChevronDown, Save, Radio, History, X, Loader2, Search,
} from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { listPlayers } from "@/lib/api/admin";
import type { PlayerRecord } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { CreateEventDialog } from "./CreateEventDialog";
import { GroupsManager } from "./GroupsManager";
import { PayoutDashboard } from "./PayoutDashboard";
import { useHoleLocks, useHoleLockActions, clearHoleAudit } from "@/lib/board/holeLocks";
import { getMe, getStoredIsAdmin, isAuthenticated } from "@/lib/api/auth";

type Tab = "event" | "players" | "groups" | "payouts" | "locks" | "ticker";

export function AdminPage() {
  const { players: seedPlayers, teams: seedTeams, event: seedEvent, tickerItems: seedTicker, rawEvent, eventId, isMock } = useBoardData();
  const [tab, setTab] = useState<Tab>("event");
  const [live, setLive] = useState(true);
  const [locked, setLocked] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const meQ = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    enabled: isAuthenticated(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isAdmin = Boolean(meQ.data?.isAdmin) || getStoredIsAdmin();

  const [name, setName] = useState(seedEvent.name);
  const [format, setFormat] = useState(seedEvent.format);
  const [hole, setHole] = useState(seedEvent.hole);
  const [entry, setEntry] = useState(20);
  const [skinsPot, setSkinsPot] = useState(seedEvent.skinsPot);
  const [carry, setCarry] = useState(true);
  const [players, setPlayers] = useState<Player[]>(seedPlayers);
  const [ticker, setTicker] = useState(seedTicker);
  const [draft, setDraft] = useState({ tag: "BIRDIE", text: "" });
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-seed local form state when the upstream data *source* changes
  // (mock -> live, or a different event loads). We deliberately don't
  // re-sync on every poll, otherwise in-progress admin edits would be
  // clobbered every 8 seconds.
  const sourceKey = `${eventId ?? "none"}:${isMock ? "mock" : "live"}`;
  const lastSourceRef = useRef(sourceKey);
  useEffect(() => {
    if (lastSourceRef.current === sourceKey) return;
    lastSourceRef.current = sourceKey;
    setName(seedEvent.name);
    setFormat(seedEvent.format);
    setHole(seedEvent.hole);
    setSkinsPot(seedEvent.skinsPot);
    setPlayers(seedPlayers);
    setTicker(seedTicker);
  }, [sourceKey, seedEvent, seedPlayers, seedTicker]);

  const flash = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 700);
  };

  const totalPot = players.length * entry;
  const eaglesCount = players.filter((p) => p.team === "Eagles").length;
  const hawksCount = players.filter((p) => p.team === "Hawks").length;

  const movePlayer = (id: string, dir: -1 | 1) => {
    setPlayers((arr) => {
      const i = arr.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    flash();
  };

  const removePlayer = (id: string) => {
    setPlayers((arr) => arr.filter((p) => p.id !== id));
    flash();
  };

  const togglePlayerTeam = (id: string) => {
    setPlayers((arr) =>
      arr.map((p) => (p.id === id ? { ...p, team: p.team === "Eagles" ? "Hawks" : "Eagles" } : p)),
    );
    flash();
  };

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const allPlayersQ = useQuery({
    queryKey: ["players", "all"],
    queryFn: listPlayers,
    enabled: isAdmin && showPicker,
    staleTime: 60_000,
  });

  const existingIds = useMemo(() => new Set(players.map((p) => String(p.id))), [players]);
  const availablePlayers = useMemo(() => {
    const list = allPlayersQ.data ?? [];
    const q = pickerSearch.trim().toLowerCase();
    return list
      .filter((p) => !existingIds.has(String(p.id)))
      .filter((p) => {
        if (!q) return true;
        const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
        return full.includes(q) || (p.email ?? "").toLowerCase().includes(q);
      });
  }, [allPlayersQ.data, existingIds, pickerSearch]);

  const addPlayerFromRecord = (rec: PlayerRecord) => {
    const first = rec.first_name?.trim() ?? "";
    const last = rec.last_name?.trim() ?? "";
    const fullName = `${first} ${last}`.trim() || (rec.email ?? `Player ${rec.id}`);
    const initials = ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || fullName.slice(0, 2).toUpperCase();
    const fresh: Player = {
      id: String(rec.id),
      name: fullName,
      initials,
      team: players.length % 2 === 0 ? "Eagles" : "Hawks",
      thru: 0,
      toPar: 0,
      trend: "flat",
      movement: 0,
      projected: 0,
      skins: 0,
    };
    setPlayers((arr) => [...arr, fresh]);
    setShowPicker(false);
    setPickerSearch("");
    flash();
  };

  const pushTicker = () => {
    if (!draft.text.trim()) return;
    setTicker((arr) => [{ tag: draft.tag, text: draft.text.trim() }, ...arr]);
    setDraft({ tag: "BIRDIE", text: "" });
    flash();
  };

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      {/* Header */}
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Board
          </Link>
          <div className="flex items-center gap-2">
            <span className={cn(
              "flex items-center gap-1 rounded-full border border-border bg-surface/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
              savedFlash ? "text-money" : "text-muted-foreground",
            )}>
              <Save className="h-3 w-3" />{savedFlash ? "Saved" : "Auto-save"}
            </span>
            <ThemeSwitcher />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <h1 className="text-xl font-extrabold tracking-tight">Admin Console</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/admin/game-setups"
                className="rounded-full border border-border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Setups
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-card"
              >
                <Plus className="h-3 w-3" /> New event
              </button>
            )}
            <button
              onClick={() => { setLive((v) => !v); flash(); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all",
                live
                  ? "bg-money/15 text-money shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--money)_40%,transparent)]"
                  : "bg-surface-2 text-muted-foreground",
              )}
            >
              <Radio className={cn("h-3 w-3", live && "animate-pulse")} />
              {live ? "Live" : "Paused"}
            </button>
          </div>
        </div>
      </header>

      {isAdmin && <CreateEventDialog open={showCreate} onOpenChange={setShowCreate} />}

      {/* Quick stats */}
      <section className="mx-4 grid grid-cols-3 gap-2">
        <StatCard icon={DollarSign} label="Pot" value={`$${totalPot}`} accent="text-money" />
        <StatCard icon={Flag} label="Hole" value={`${hole}/18`} accent="text-gold" />
        <StatCard icon={Users} label="Field" value={`${players.length}`} accent="text-primary" />
      </section>

      {/* Tabs */}
      <nav className="mx-4 mt-4 flex gap-1 rounded-2xl border border-border bg-surface/70 p-1">
        {(["event", "players", "groups", "payouts", "locks", "ticker"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-xl py-2 text-[11px] font-bold uppercase tracking-wider transition-all",
              tab === t ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Panels */}
      <section className="mx-4 mt-3 space-y-3">
        {tab === "event" && (
          <Panel title="Event">
            <Field label="Event name">
              <input value={name} onChange={(e) => { setName(e.target.value); flash(); }} className={inputCls} />
            </Field>
            <Field label="Format">
              <input value={format} onChange={(e) => { setFormat(e.target.value); flash(); }} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Current hole">
                <Stepper value={hole} min={1} max={18} onChange={(v) => { setHole(v); flash(); }} />
              </Field>
              <Field label="Entry $">
                <Stepper value={entry} min={0} step={5} onChange={(v) => { setEntry(v); flash(); }} />
              </Field>
            </div>

            <div className="mt-1 flex items-center justify-between rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {locked ? <Lock className="h-4 w-4 text-bubble" /> : <Unlock className="h-4 w-4 text-money" />}
                Score entry {locked ? "locked" : "open"}
              </div>
              <Toggle on={!locked} onChange={(v) => { setLocked(!v); flash(); }} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActionBtn icon={live ? Pause : Play} label={live ? "Pause live" : "Resume live"} onClick={() => { setLive(!live); flash(); }} />
              <ActionBtn icon={RefreshCcw} label="Recalculate" onClick={flash} />
            </div>
          </Panel>
        )}

        {tab === "players" && (
          <Panel
            title="Players"
            action={
              <button
                onClick={() => { setShowPicker((v) => !v); setPickerSearch(""); }}
                className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground"
              >
                {showPicker ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {showPicker ? "Close" : "Add"}
              </button>
            }
          >
            {showPicker && (
              <div className="mb-3 rounded-xl border border-border bg-surface p-2.5">
                <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search players…"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                {allPlayersQ.isLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading players…
                  </div>
                ) : allPlayersQ.error ? (
                  <p className="px-2 py-2 text-xs text-destructive">Failed to load players</p>
                ) : availablePlayers.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    {pickerSearch ? "No matching players" : "All system players are already in this event"}
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {availablePlayers.map((rec) => {
                      const fullName = `${rec.first_name ?? ""} ${rec.last_name ?? ""}`.trim() || (rec.email ?? `Player ${rec.id}`);
                      return (
                        <li key={rec.id}>
                          <button
                            onClick={() => addPlayerFromRecord(rec)}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-2"
                          >
                            <span className="truncate">{fullName}</span>
                            <Plus className="h-3.5 w-3.5 text-primary" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span><span className="text-primary">Eagles</span> {eaglesCount}</span>
              <span><span className="text-bubble">Hawks</span> {hawksCount}</span>
            </div>
            <ul className="space-y-1.5">
              {players.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
                  <div className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-extrabold",
                    p.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
                  )}>
                    {p.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <button onClick={() => togglePlayerTeam(p.id)} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      {p.team} · tap to swap
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconBtn onClick={() => movePlayer(p.id, -1)} disabled={i === 0}><ChevronUp className="h-4 w-4" /></IconBtn>
                    <IconBtn onClick={() => movePlayer(p.id, 1)} disabled={i === players.length - 1}><ChevronDown className="h-4 w-4" /></IconBtn>
                    <IconBtn onClick={() => removePlayer(p.id)} danger><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}


        {tab === "groups" && (
          eventId != null ? (
            <GroupsManager eventId={eventId} rawEvent={rawEvent} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">No active event</p>
              <p className="mt-1 text-muted-foreground">
                Groups belong to an event. Create a new event (or open an existing one) before setting up groups.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-card"
                >
                  <Plus className="h-3 w-3" /> Create event
                </button>
              )}
            </div>
          )
        )}

        {tab === "payouts" && (
          rawEvent ? (
            <PayoutDashboard />
          ) : (
            <Panel title="Payouts & Skins">
              <Field label="Skins pot $">
                <Stepper value={skinsPot} min={0} step={5} onChange={(v) => { setSkinsPot(v); flash(); }} />
              </Field>
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="text-sm font-semibold">Carry skins on tie</div>
                <Toggle on={carry} onChange={(v) => { setCarry(v); flash(); }} />
              </div>

              <div className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Projected payouts</div>
                <ul className="space-y-1.5">
                  {seedTeams.map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-sm">
                      <span className={cn("font-bold", t.name === "Eagles" ? "text-primary" : "text-bubble")}>{t.name}</span>
                      <span className="font-tabular font-extrabold text-money">${t.projected}</span>
                    </li>
                  ))}
                  <li className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="font-bold">Total pot</span>
                    <span className="font-tabular font-extrabold">${totalPot}</span>
                  </li>
                </ul>
              </div>
            </Panel>
          )
        )}

        {tab === "locks" && (() => {
          // Hole the whole group has finished = min(holes-played) across all players
          const liveHole = rawEvent?.players?.length
            ? Math.min(...rawEvent.players.map((p) => p.holeScores.filter((s) => s > 0).length))
            : hole;
          return <LocksPanel currentHole={liveHole} onChange={flash} />;
        })()}

        {tab === "ticker" && (
          <Panel title="Live Ticker">
            <Field label="Tag">
              <div className="flex gap-1">
                {["BIRDIE", "SKIN", "BUBBLE", "PRESSURE", "TEAM"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraft((d) => ({ ...d, tag: t }))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                      draft.tag === t ? "bg-gold/20 text-gold" : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Message">
              <input
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                placeholder="e.g. Walker drains a 30-footer on 17"
                className={inputCls}
              />
            </Field>
            <button
              onClick={pushTicker}
              disabled={!draft.text.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_70%,black)] py-2.5 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-card disabled:opacity-40"
            >
              <Megaphone className="h-4 w-4" /> Push to ticker
            </button>

            <div className="mt-1 space-y-1.5">
              {ticker.map((t, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
                  <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">{t.tag}</span>
                  <span className="flex-1 text-[12px] text-foreground">{t.text}</span>
                  <button
                    onClick={() => { setTicker((arr) => arr.filter((_, j) => j !== i)); flash(); }}
                    className="text-muted-foreground hover:text-down"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </section>

      <BottomNav active="admin" />
    </main>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";

function Panel({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stepper({ value, onChange, min = 0, max = 9999, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface">
      <button onClick={() => onChange(Math.max(min, value - step))} className="flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center justify-center font-tabular text-base font-extrabold">{value}</div>
      <button onClick={() => onChange(Math.min(max, value + step))} className="flex w-10 items-center justify-center text-muted-foreground hover:text-foreground">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        on ? "bg-money" : "bg-surface-2",
      )}
    >
      <span className={cn(
        "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all",
        on ? "left-[22px]" : "left-0.5",
      )} />
    </button>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-2 shadow-card">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-3 w-3", accent)} /> {label}
      </div>
      <div className={cn("mt-0.5 font-tabular text-lg font-extrabold leading-tight", accent)}>{value}</div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-foreground hover:bg-surface-2"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function IconBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2",
        danger && "hover:text-down",
        disabled && "opacity-30",
      )}
    >
      {children}
    </button>
  );
}

function LocksPanel({ currentHole, onChange }: { currentHole: number; onChange: () => void }) {
  const { locked, audit } = useHoleLocks();
  const { players } = useBoardData();
  const { lock, unlock } = useHoleLockActions();
  // Best-effort actor name — first player marked as "you" if any, else "Admin".
  const actor = players.find((p) => (p as unknown as { isMe?: boolean }).isMe)?.name ?? "Admin";

  const toggle = async (h: number) => {
    if (locked.includes(h)) await unlock(h, actor);
    else await lock(h, actor);
    onChange();
  };

  const lockThrough = async (n: number) => {
    for (let h = 1; h <= n; h++) {
      if (!locked.includes(h)) await lock(h, actor, `Bulk lock through ${n}`);
    }
    onChange();
  };

  const unlockAll = async () => {
    for (const h of [...locked]) {
      await unlock(h, actor, "Bulk unlock");
    }
    onChange();
  };

  return (
    <>
      <Panel
        title="Hole Locks"
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => lockThrough(currentHole)}
              className="rounded-full bg-bubble/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-bubble"
            >
              <Lock className="mr-1 inline h-3 w-3" /> Lock thru {currentHole}
            </button>
            <button
              onClick={unlockAll}
              disabled={locked.length === 0}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground disabled:opacity-30"
            >
              <Unlock className="mr-1 inline h-3 w-3" /> Unlock all
            </button>
          </div>
        }
      >
        <p className="text-[11px] text-muted-foreground">
          Locked holes prevent edits in Fast Scoring. Unlock to allow corrections.
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
            const isLk = locked.includes(h);
            return (
              <button
                key={h}
                onClick={() => toggle(h)}
                className={cn(
                  "relative flex h-12 flex-col items-center justify-center rounded-xl border font-tabular text-sm font-extrabold transition-all",
                  isLk
                    ? "border-bubble/40 bg-bubble/15 text-bubble"
                    : "border-border bg-surface text-foreground hover:bg-surface-2",
                )}
              >
                {h}
                {isLk ? (
                  <Lock className="mt-0.5 h-3 w-3" />
                ) : (
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    open
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <History className="h-3 w-3" /> Audit trail
          </span>
        }
        action={
          audit.length > 0 ? (
            <button
              onClick={() => { clearHoleAudit(); onChange(); }}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-down"
            >
              <Trash2 className="mr-1 inline h-3 w-3" /> Clear
            </button>
          ) : undefined
        }
      >
        {audit.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No lock activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {audit.map((a, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-2.5 py-2 text-[12px]"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-extrabold",
                      a.action === "lock" ? "bg-bubble/15 text-bubble" : "bg-money/15 text-money",
                    )}
                  >
                    {a.action === "lock" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </span>
                  <span className="font-semibold">
                    Hole {a.hole} {a.action === "lock" ? "locked" : "unlocked"}
                  </span>
                  <span className="text-muted-foreground">· {a.actor}</span>
                </span>
                <span className="font-tabular text-[10px] text-muted-foreground">{fmtTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}
