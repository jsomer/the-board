import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BoardDataProvider } from "@/lib/board/context";

// Pathless layout — wraps every route with BoardDataProvider.
// Auth is intentionally NOT enforced here so the prototype falls back to
// mock data when no token is present. Visit /login to authenticate.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <BoardDataProvider>
      <Outlet />
    </BoardDataProvider>
  );
}
