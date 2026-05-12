import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { getEventByCode, eventJoin, login, isAuthenticated } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { EventJoinInfo } from "@/lib/api/types";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [{ title: "Join Event — The Board" }],
  }),
  component: JoinPage,
});

type Step = "code" | "player" | "admin";

function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [eventCode, setEventCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("gt_lastEventCode") ?? "";
  });
  const [eventInfo, setEventInfo] = useState<EventJoinInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingPlayerId, setSelectingPlayerId] = useState<number | null>(null);

  // Admin login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // If already authenticated, get out of here.
  useEffect(() => {
    if (isAuthenticated()) {
      window.location.href = "/";
    }
  }, []);

  const onCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const code = eventCode.trim().toUpperCase();
    if (code.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const info = await getEventByCode(code);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gt_lastEventCode", code);
      }
      setEventInfo(info);
      setStep("player");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setError("Event not found — check the code and try again");
        else if (err.status === 410) setError("This event has already been finalized");
        else setError(err.message || "Something went wrong");
      } else {
        setError("Couldn't reach the server — check your connection");
      }
    } finally {
      setBusy(false);
    }
  };

  const onSelectPlayer = async (playerId: number) => {
    if (!eventInfo) return;
    setBusy(true);
    setSelectingPlayerId(playerId);
    setError(null);
    try {
      await eventJoin(eventInfo.event_code, playerId);
      // Players go straight to their scoring sheet; admins use the event picker.
      window.location.href = "/score";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join event");
      setBusy(false);
      setSelectingPlayerId(null);
    }
  };

  const onAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  };

  const goBackToCode = () => {
    setStep("code");
    setEventInfo(null);
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 gap-6">
      <header className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">The Board</h1>
      </header>

      {step === "code" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <form
            onSubmit={onCodeSubmit}
            className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
          >
            <p className="text-sm font-semibold text-center">Enter your event code</p>
            <input
              type="text"
              required
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="GX4R2K"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-center font-mono text-xl font-bold tracking-[0.4em] uppercase placeholder:text-muted-foreground/40"
            />
            {error && (
              <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || eventCode.trim().length === 0}
              className="w-full h-12 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-2 hover:bg-primary/90 hover:-translate-y-[1px] hover:shadow-md transition-all active:scale-[0.98] touch-manipulation"
            >
              {busy && <Spinner />}
              {busy ? "Looking up…" : "Find Event"}
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => { setStep("admin"); setError(null); }}
              className="text-xs font-semibold text-muted-foreground underline"
            >
              Admin? Sign in with email
            </button>
          </div>
        </div>
      )}

      {step === "player" && eventInfo && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="text-center space-y-0.5">
            <p className="font-mono text-lg font-extrabold tracking-widest">{eventInfo.event_code}</p>
            {eventInfo.event_date && (
              <p className="text-xs text-muted-foreground">
                {new Date(eventInfo.event_date + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                })}
              </p>
            )}
          </div>
          <p className="text-sm font-semibold text-center">Who are you?</p>
          <ul className="divide-y divide-border rounded-md border border-border overflow-hidden max-h-[60vh] overflow-y-auto">
            {eventInfo.players.map((p) => {
              const isSelecting = selectingPlayerId === p.player_id;
              return (
                <li key={p.player_id}>
                  <button
                    onClick={() => onSelectPlayer(p.player_id)}
                    disabled={busy}
                    className="w-full px-4 py-4 text-left text-sm font-medium hover:bg-primary/10 active:bg-primary/20 active:scale-[0.98] disabled:opacity-50 transition-all inline-flex items-center justify-between touch-manipulation"
                  >
                    <span>{p.name}</span>
                    {isSelecting && <Spinner />}
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">{error}</p>
          )}
          <button
            onClick={goBackToCode}
            disabled={busy}
            className="w-full text-xs font-semibold text-muted-foreground underline pt-1 disabled:opacity-50"
          >
            ← Different event
          </button>
        </div>
      )}

      {step === "admin" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
          <form
            onSubmit={onAdminLogin}
            className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
          >
            <p className="text-sm font-semibold text-center">Admin sign-in</p>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            {error && (
              <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-2 hover:bg-primary/90 hover:-translate-y-[1px] hover:shadow-md transition-all active:scale-[0.98] touch-manipulation"
            >
              {busy && <Spinner />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="text-center">
            <button
              onClick={goBackToCode}
              className="text-xs font-semibold text-muted-foreground underline"
            >
              ← Back to event code
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
