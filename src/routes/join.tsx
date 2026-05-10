import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getEventByCode, eventJoin, login } from "@/lib/api/auth";
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
  const [eventCode, setEventCode] = useState("");
  const [eventInfo, setEventInfo] = useState<EventJoinInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const code = eventCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const info = await getEventByCode(code);
      setEventInfo(info);
      setStep("player");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Event not found");
    } finally {
      setBusy(false);
    }
  };

  const onSelectPlayer = async (playerId: number) => {
    if (!eventInfo) return;
    setBusy(true);
    setError(null);
    try {
      await eventJoin(eventInfo.event_code, playerId);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join event");
      setBusy(false);
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 gap-6">
      <header className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">The Board</h1>
      </header>

      {step === "code" && (
        <div className="space-y-4">
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
              maxLength={6}
              placeholder="e.g. GX4R2K"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-center font-mono text-xl font-bold tracking-widest uppercase"
            />
            {error && (
              <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || eventCode.trim().length < 6}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
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
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
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
          <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {eventInfo.players.map((p) => (
              <li key={p.player_id}>
                <button
                  onClick={() => onSelectPlayer(p.player_id)}
                  disabled={busy}
                  className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">{error}</p>
          )}
          <button
            onClick={() => { setStep("code"); setEventInfo(null); setError(null); }}
            className="w-full text-xs font-semibold text-muted-foreground underline pt-1"
          >
            ← Different event
          </button>
        </div>
      )}

      {step === "admin" && (
        <div className="space-y-3">
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
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="text-center">
            <button
              onClick={() => { setStep("code"); setError(null); }}
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
