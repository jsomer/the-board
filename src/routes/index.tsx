import { createFileRoute } from "@tanstack/react-router";
import { EventHeader } from "@/components/board/EventHeader";
import { Ticker } from "@/components/board/Ticker";
import { TeamScoreboard } from "@/components/board/TeamScoreboard";
import { SkinsStrip } from "@/components/board/SkinsStrip";
import { Leaderboard } from "@/components/board/Leaderboard";
import { BottomNav } from "@/components/board/BottomNav";

export const Route = createFileRoute("/")({
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
  return (
    <main className="mx-auto min-h-screen max-w-xl pb-28">
      <EventHeader />
      <Ticker />
      <div className="space-y-4 pt-4">
        <TeamScoreboard />
        <SkinsStrip />
        <Leaderboard />
      </div>
      <BottomNav active="board" />
    </main>
  );
}
