import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/my-events")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
  component: () => null,
});
