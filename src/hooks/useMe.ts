import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api/auth";
import { isAuthenticated } from "@/lib/api/auth";

/**
 * Returns the current authenticated user's playerId as a string (to match
 * the derived Player.id shape). Returns null when unknown / not signed in.
 */
export function useMe() {
  const enabled = typeof window !== "undefined" && isAuthenticated();
  const q = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    enabled,
    staleTime: 5 * 60_000,
  });
  const meId = q.data?.playerId != null ? String(q.data.playerId) : null;
  return { meId, isAdmin: q.data?.isAdmin ?? false, loading: q.isLoading };
}
