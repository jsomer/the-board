import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /login route — the join screen is now the single entry point for
// unauthenticated users (event code first, with an admin sign-in toggle).
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/join" });
  },
  component: () => null,
});
