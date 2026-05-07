import { createFileRoute } from "@tanstack/react-router";
import { PlayerDetailPage } from "@/components/board/PlayerDetailPage";

export const Route = createFileRoute("/player/$playerId")({
  head: () => ({
    meta: [
      { title: "Player Detail — The Board" },
      { name: "description", content: "Hole-by-hole scores, points vs quota, and skins won for this player." },
      { property: "og:title", content: "Player Detail — The Board" },
      { property: "og:description", content: "Hole-by-hole scores, points vs quota, and skins won." },
    ],
  }),
  component: () => <PlayerDetailPage />,
});
