import { createFileRoute } from "@tanstack/react-router";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { QuotaLeaderboardPage } from "@/components/board/QuotaLeaderboardPage";

export const Route = createFileRoute("/leaderboard")({
  beforeLoad: () => requireAuthAndEvent(),
  head: () => ({
    meta: [
      { title: "Leaderboard — The Board" },
      { name: "description", content: "Every player in the event with points vs quota, current hole, and skin winners." },
      { property: "og:title", content: "Leaderboard — The Board" },
      { property: "og:description", content: "Points vs quota and skin winners, live." },
    ],
  }),
  component: () => <QuotaLeaderboardPage />,
});
