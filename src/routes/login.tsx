import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login, logout, isAuthenticated } from "@/lib/api/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In — The Board" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(() => isAuthenticated());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      setAuthed(true);
      // Hard reload to repopulate React Query / context with token
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    logout();
    setAuthed(false);
    router.invalidate();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">The Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your GameTracker account to load live event data.
        </p>
      </header>

      {authed ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-center shadow-card">
          <p className="text-sm font-semibold text-money">You're signed in.</p>
          <a
            href="/"
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Go to The Board
          </a>
          <button
            onClick={onLogout}
            className="text-xs font-semibold text-muted-foreground underline"
          >
            Sign out
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
        >
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Email
            </span>
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Password
            </span>
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
            <p className="rounded-md bg-down/10 px-3 py-2 text-xs font-semibold text-down">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Without sign-in, the board displays demo data.
          </p>
        </form>
      )}
    </main>
  );
}
