import { createFileRoute } from "@tanstack/react-router";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { ScorecardDetailPage } from "@/components/board/ScorecardDetailPage";

export const Route = createFileRoute("/admin_/scorecards/$playerId")({
  beforeLoad: () => requireAuthAndEvent(),
  head: () => ({
    meta: [
      { title: "Scorecard — Admin" },
      { name: "description", content: "Hole-by-hole scorecard with unlock and edit flow." },
    ],
  }),
  component: () => <ScorecardDetailPage />,
});
