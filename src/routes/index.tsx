import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EventHeader } from "@/components/board/EventHeader";
import { Ticker } from "@/components/board/Ticker";
import { TeamScoreboard } from "@/components/board/TeamScoreboard";
import { SkinsStrip } from "@/components/board/SkinsStrip";
import { Leaderboard } from "@/components/board/Leaderboard";
import { Scorecard } from "@/components/board/Scorecard";
import { BottomNav } from "@/components/board/BottomNav";
import { PullToRefresh } from "@/components/board/PullToRefresh";
import { useBoardData } from "@/lib/board/context";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  beforeLoad: () => requireAuthAndEvent(),
  head: () => ({
    meta: [
      { title: "The Board — Live Golf Competition" },
      { name: "description", content: "Live leaderboards, skins, and projected payouts for golf money games and tournaments." },
      { property: "og:title", content: "The Board — Live Golf Competition" },
      { property: "og:description", content: "Real-time leaderboards, skins, and payout movement during the round." },
    ],
  }),
  component: LiveBoardPage,
});

function LiveBoardPage() {
  const { refresh, isFetching } = useBoardData();
  const [view, setView] = useState<"leaderboard" | "scorecard">("leaderboard");

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isFetching}>
      <main className="mx-auto min-h-screen max-w-xl pb-28">
        <EventHeader />
        <Ticker />
        <div className="space-y-4 pt-4">
          <TeamScoreboard />
          <SkinsStrip />
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="px-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === "leaderboard" ? <Leaderboard /> : <Scorecard />}
        </div>
        <BottomNav active="board" />
      </main>
    </PullToRefresh>
  );
}
