import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { getStoredIsAdmin } from "@/lib/api/auth";
import { AdminPage } from "@/components/board/AdminPage";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    requireAuthAndEvent();
    if (typeof window !== "undefined" && !getStoredIsAdmin()) {
      throw redirect({ to: "/score" });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin — The Board" },
      { name: "description", content: "Control the live event: format, pot, skins, players, payouts, and ticker." },
      { property: "og:title", content: "Admin — The Board" },
      { property: "og:description", content: "Run the money game from one screen." },
    ],
  }),
  component: () => <AdminPage />,
});
