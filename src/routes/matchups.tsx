import { createFileRoute } from "@tanstack/react-router";
import { MatchupsPage } from "@/components/board/MatchupsPage";

export const Route = createFileRoute("/matchups")({
  head: () => ({
    meta: [
      { title: "Matchups — The Board" },
      { name: "description", content: "Live head-to-head matchups, team scoreboard, presses, and projected $ swings." },
      { property: "og:title", content: "Matchups — The Board" },
      { property: "og:description", content: "Track every bet on the course in real time." },
    ],
  }),
  component: () => <MatchupsPage />,
});
