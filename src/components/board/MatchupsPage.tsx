import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Swords, TrendingUp, TrendingDown, Minus, Flame, ChevronRight, DollarSign, Trophy, Users } from "lucide-react";
import { useBoardData } from "@/lib/board/context";
import type { Player } from "@/data/board";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { ThemeSwitcher } from "./ThemeSwitcher";

type Mode = "team" | "h2h" | "skins";

type Press = { hole: number; by: "Eagles" | "Hawks"; auto?: boolean };

type H2H = {
  id: string;
  a: Player;
  b: Player;
  status: number;          // + means a is up, - means b is up (in holes)
  thru: number;
  bet: number;             // base $ stake
  presses: Press[];
  pressed?: boolean;
  swing: number;           // projected $ swing this hole
};

const H2H_MATCHUPS: Omit<H2H, "a" | "b">[] = [
  { id: "m1", status: 2,  thru: 16, bet: 50, presses: [{ hole: 13, by: "Hawks", auto: true }], pressed: true,  swing: +18 },
  { id: "m2", status: -1, thru: 16, bet: 25, presses: [],                                                  swing: -8  },
  { id: "m3", status: 0,  thru: 15, bet: 20, presses: [{ hole: 10, by: "Eagles" }],            pressed: true,  swing: +4  },
  { id: "m4", status: 3,  thru: 15, bet: 40, presses: [{ hole: 9, by: "Hawks", auto: true }, { hole: 14, by: "Hawks" }], pressed: true, swing: -12 },
];

export function MatchupsPage() {
  const { players: seedPlayers, teams: seedTeams, event } = useBoardData();
  const [mode, setMode] = useState<Mode>("team");

  const eaglesPlayers = seedPlayers.filter((p) => p.team === "Eagles");
  const hawksPlayers = seedPlayers.filter((p) => p.team === "Hawks");

  const matchups: H2H[] = useMemo(() => {
    return H2H_MATCHUPS.map((m, i) => ({
      ...m,
      a: eaglesPlayers[i] ?? eaglesPlayers[0],
      b: hawksPlayers[i] ?? hawksPlayers[0],
    }));
  }, []);

  const teamSwing = matchups.reduce((s, m) => s + m.swing, 0);

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      {/* Header */}
      <header className="px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Board
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-money/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-money">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-money" /> Live · H{event.hole}
            </span>
            <ThemeSwitcher />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Swords className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-extrabold tracking-tight">Matchups</h1>
        </div>
      </header>

      {/* Mode tabs */}
      <nav className="mx-4 flex gap-1 rounded-2xl border border-border bg-surface/70 p-1">
        {([
          { k: "team", l: "Team", i: Trophy },
          { k: "h2h",  l: "Head-to-head", i: Users },
          { k: "skins", l: "Skins", i: Flame },
        ] as const).map(({ k, l, i: Icon }) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold uppercase tracking-wider transition-all",
              mode === k ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" /> {l}
          </button>
        ))}
      </nav>

      {/* TEAM */}
      {mode === "team" && (
        <section className="mx-4 mt-3 space-y-3">
          <TeamMatchupCard teamSwing={teamSwing} />
          <Panel title="Team breakdown">
            <ul className="space-y-1.5">
              {seedTeams.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-7 w-1.5 rounded-full", t.name === "Eagles" ? "bg-primary" : "bg-bubble")} />
                    <div>
                      <div className="text-sm font-extrabold">{t.name}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {fmtToPar(t.score)} · Thru {t.thru}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-tabular text-base font-extrabold text-money">${t.projected}</div>
                    <TrendChip trend={t.trend} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}

      {/* H2H */}
      {mode === "h2h" && (
        <section className="mx-4 mt-3 space-y-2.5">
          {matchups.map((m) => (
            <H2HCard key={m.id} m={m} />
          ))}
        </section>
      )}

      {/* SKINS */}
      {mode === "skins" && (
        <section className="mx-4 mt-3 space-y-3">
          <SkinsLeaderCard />
          <Panel title="Skins leaderboard">
            <ul className="space-y-1.5">
              {[...seedPlayers]
                .sort((a, b) => b.skins - a.skins)
                .map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-tabular w-5 text-center text-xs font-extrabold text-muted-foreground">{i + 1}</span>
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-extrabold",
                        p.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
                      )}>
                        {p.initials}
                      </span>
                      <div>
                        <div className="text-sm font-bold">{p.name}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{p.team}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Flame className={cn("h-4 w-4", p.skins > 0 ? "text-gold" : "text-muted-foreground/40")} />
                      <span className="font-tabular text-base font-extrabold text-gold">{p.skins}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </Panel>
        </section>
      )}

      <BottomNav active="matchups" />
    </main>
  );
}

function TeamMatchupCard({ teamSwing }: { teamSwing: number }) {
  const [eagles, hawks] = seedTeams;
  const lead = eagles.score - hawks.score;
  const eaglesUp = lead < 0;
  const margin = Math.abs(lead);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span>Team match</span>
        <span className="text-gold">{margin} stroke{margin === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide team="Eagles" score={eagles.score} winning={eaglesUp} />
        <div className="flex flex-col items-center">
          <Swords className="h-5 w-5 text-muted-foreground" />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Thru {eagles.thru}</span>
        </div>
        <TeamSide team="Hawks" score={hawks.score} winning={!eaglesUp} right />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <DollarSign className="h-3 w-3 text-money" /> Projected swing
        </div>
        <span className={cn(
          "font-tabular text-lg font-extrabold",
          teamSwing > 0 ? "text-money" : teamSwing < 0 ? "text-down" : "text-muted-foreground",
        )}>
          {teamSwing > 0 ? "+" : ""}${teamSwing}
        </span>
      </div>
    </div>
  );
}

function TeamSide({ team, score, winning, right }: { team: "Eagles" | "Hawks"; score: number; winning: boolean; right?: boolean }) {
  return (
    <div className={cn("flex flex-col", right ? "items-end" : "items-start")}>
      <span className={cn(
        "text-[11px] font-bold uppercase tracking-wider",
        team === "Eagles" ? "text-primary" : "text-bubble",
      )}>{team}</span>
      <span className={cn(
        "mt-1 font-tabular text-3xl font-extrabold leading-none",
        winning ? "text-foreground" : "text-muted-foreground",
      )}>
        {fmtToPar(score)}
      </span>
      {winning && (
        <span className="mt-1.5 rounded-full bg-money/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-money">
          Leading
        </span>
      )}
    </div>
  );
}

function H2HCard({ m }: { m: H2H }) {
  const aUp = m.status > 0;
  const dn = m.status < 0;
  const allSquare = m.status === 0;
  const stake = m.bet * (m.pressed ? 2 : 1);

  const statusLabel = allSquare ? "AS" : `${Math.abs(m.status)} UP`;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-surface/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Match {m.id.slice(1)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Thru {m.thru}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {m.pressed && (
            <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              <Flame className="h-3 w-3" /> Pressed
            </span>
          )}
          <span className="font-tabular text-[11px] font-bold text-money">${stake}</span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3">
        <PlayerSide p={m.a} winning={aUp} />
        <div className="flex flex-col items-center">
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
            allSquare ? "bg-surface-2 text-muted-foreground" : aUp ? "bg-primary/20 text-primary" : "bg-bubble/20 text-bubble",
          )}>
            {statusLabel}
          </span>
          <ChevronRight className={cn(
            "mt-1 h-3.5 w-3.5",
            aUp ? "text-primary" : dn ? "rotate-180 text-bubble" : "text-muted-foreground/40",
          )} />
        </div>
        <PlayerSide p={m.b} winning={dn} right />
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {m.presses.length > 0 ? (
            <>
              <Flame className="h-3 w-3 text-gold" />
              {m.presses.map((p, i) => (
                <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5">
                  {p.auto ? "Auto " : ""}H{p.hole} · {p.by}
                </span>
              ))}
            </>
          ) : (
            <span>No presses</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          <span className={cn(
            "font-tabular text-sm font-extrabold",
            m.swing > 0 ? "text-money" : m.swing < 0 ? "text-down" : "text-muted-foreground",
          )}>
            {m.swing > 0 ? "+" : ""}${m.swing}
          </span>
        </div>
      </div>
    </article>
  );
}

function PlayerSide({ p, winning, right }: { p: Player; winning: boolean; right?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", right && "flex-row-reverse text-right")}>
      <span className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold",
        p.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
        winning && "shadow-[0_0_0_2px_color-mix(in_oklab,var(--gold)_60%,transparent)]",
      )}>
        {p.initials}
      </span>
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-bold", winning ? "text-foreground" : "text-muted-foreground")}>
          {p.name}
        </div>
        <div className="font-tabular text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {fmtToPar(p.toPar)}
        </div>
      </div>
    </div>
  );
}

function SkinsLeaderCard() {
  const top = [...seedPlayers].sort((a, b) => b.skins - a.skins)[0];
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span>Skins leader</span>
        <span className="text-gold">${event.skinsPot} pending</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-base font-extrabold",
          top.team === "Eagles" ? "bg-primary/15 text-primary" : "bg-bubble/15 text-bubble",
        )}>
          {top.initials}
        </span>
        <div className="flex-1">
          <div className="text-base font-extrabold">{top.name}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{top.team}</div>
        </div>
        <div className="flex items-center gap-1">
          <Flame className="h-5 w-5 text-gold" />
          <span className="font-tabular text-3xl font-extrabold text-gold">{top.skins}</span>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function TrendChip({ trend }: { trend: "up" | "down" | "flat" }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const cls = trend === "up" ? "text-money" : trend === "down" ? "text-down" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider", cls)}>
      <Icon className="h-3 w-3" /> {trend}
    </span>
  );
}

function fmtToPar(n: number) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}
