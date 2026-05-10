import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/board/entryGuard";
import { GameSetupsPage } from "@/components/board/GameSetupsPage";

export const Route = createFileRoute("/admin_/game-setups")({
  beforeLoad: () => requireAuth(),
  head: () => ({
    meta: [
      { title: "Game Setups — Admin" },
      { name: "description", content: "Manage scoring formats, payout rules, and points rules for events." },
      { property: "og:title", content: "Game Setups — Admin" },
      { property: "og:description", content: "Reusable event configurations: scoring, handicaps, payouts." },
    ],
  }),
  component: () => <GameSetupsPage />,
});
