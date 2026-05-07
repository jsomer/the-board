import { createFileRoute } from "@tanstack/react-router";
import { FastScoring } from "@/components/board/FastScoring";

export const Route = createFileRoute("/score")({
  head: () => ({
    meta: [
      { title: "Fast Scoring — The Board" },
      { name: "description", content: "One-tap fast scoring with swipe between players and holes. Auto-saves and auto-advances in under 3 seconds." },
      { property: "og:title", content: "Fast Scoring — The Board" },
      { property: "og:description", content: "Enter scores in under 3 seconds with giant tap targets." },
    ],
  }),
  component: () => <FastScoring />,
});
