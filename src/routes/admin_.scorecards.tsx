import { createFileRoute } from "@tanstack/react-router";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { ScorecardListPage } from "@/components/board/ScorecardListPage";

export const Route = createFileRoute("/admin_/scorecards")({
  beforeLoad: () => requireAuthAndEvent(),
  head: () => ({
    meta: [
      { title: "Scorecards — Admin" },
      { name: "description", content: "All players grouped by playing group with lock status." },
    ],
  }),
  component: () => <ScorecardListPage />,
});
