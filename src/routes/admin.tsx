import { createFileRoute } from "@tanstack/react-router";
import { requireAuthAndEvent } from "@/lib/board/entryGuard";
import { AdminPage } from "@/components/board/AdminPage";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireAuthAndEvent(),
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
