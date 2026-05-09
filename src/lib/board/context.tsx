import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { listEvents, getEvent, getSideBets, pickActiveEvent } from "@/lib/api/events";
import { isAuthenticated, logout as apiLogout } from "@/lib/api/auth";
import type { EventRecord, SideBet, SkinsState } from "@/lib/api/types";
import {
  derivePlayers,
  deriveTeams,
  deriveEvent,
  deriveTickerItems,
  findSkinsState,
  type BoardEvent,
} from "./derive";
import {
  players as mockPlayers,
  teams as mockTeams,
  event as mockEvent,
  tickerItems as mockTicker,
  type Player,
  type Team,
} from "@/data/board";

const ACTIVE_EVENT_KEY = "activeEventId";

export interface BoardData {
  players: Player[];
  teams: Team[];
  event: BoardEvent;
  tickerItems: { tag: string; text: string }[];
  rawEvent: EventRecord | null;
  sideBets: SideBet[] | null;
  skins: SkinsState | null;
  loading: boolean;
  authed: boolean;
  error: string | null;
  isMock: boolean; // true when falling back to seeded mock data
  eventId: number | null;
  lastUpdatedAt: number | null;
  isFetching: boolean;
  refresh: () => void;
  logout: () => void;
}

const Ctx = createContext<BoardData | null>(null);

export function useBoardData(): BoardData {
  const v = useContext(Ctx);
  if (!v) {
    // Defensive: return mock so a component never crashes if rendered outside provider.
    return {
      players: mockPlayers,
      teams: mockTeams,
      event: mockEvent,
      tickerItems: mockTicker,
      rawEvent: null,
      sideBets: null,
      skins: null,
      loading: false,
      authed: false,
      error: null,
      isMock: true,
      eventId: null,
      lastUpdatedAt: null,
      isFetching: false,
      refresh: () => {},
      logout: () => {},
    };
  }
  return v;
}

function getEventIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get("eventId");
  if (v && /^\d+$/.test(v)) return Number(v);
  const ls = window.localStorage.getItem(ACTIVE_EVENT_KEY);
  if (ls && /^\d+$/.test(ls)) return Number(ls);
  return null;
}

export function BoardDataProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => isAuthenticated());
  const [requestedEventId, setRequestedEventId] = useState<number | null>(() =>
    getEventIdFromUrl(),
  );

  // Keep auth in sync if other tabs change tokens
  useEffect(() => {
    const onStorage = () => setAuthed(isAuthenticated());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 1) Find an event id (auto-pick if not provided)
  const eventsList = useQuery({
    queryKey: ["events"],
    queryFn: listEvents,
    enabled: authed && requestedEventId == null,
    staleTime: 60_000,
  });

  const resolvedEventId = useMemo(() => {
    if (requestedEventId != null) return requestedEventId;
    const list = eventsList.data;
    if (!list) return null;
    const picked = pickActiveEvent(list);
    return picked?.id ?? null;
  }, [requestedEventId, eventsList.data]);

  useEffect(() => {
    if (resolvedEventId != null && typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_EVENT_KEY, String(resolvedEventId));
    }
  }, [resolvedEventId]);

  // Suppress unused-setter lint while still allowing future override hooks
  void setRequestedEventId;

  // 2) Poll event + side-bets every 8s
  const eventQ = useQuery({
    queryKey: ["event", resolvedEventId],
    queryFn: () => getEvent(resolvedEventId!),
    enabled: authed && resolvedEventId != null,
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
  });

  const sideBetsQ = useQuery({
    queryKey: ["side-bets", resolvedEventId],
    queryFn: () => getSideBets(resolvedEventId!),
    enabled: authed && resolvedEventId != null,
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
  });

  // 3) Derive UI shapes; track previous positions for movement deltas
  const prevPositions = useRef<Map<string, number>>(new Map());
  const prevPlayers = useRef<Player[] | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const refresh = () => {
    void eventQ.refetch();
    void sideBetsQ.refetch();
    void eventsList.refetch();
  };

  const logout = () => {
    apiLogout();
    setAuthed(false);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const lastUpdatedAt = useMemo(() => {
    const a = eventQ.dataUpdatedAt ?? 0;
    const b = sideBetsQ.dataUpdatedAt ?? 0;
    const m = Math.max(a, b);
    return m > 0 ? m : null;
  }, [eventQ.dataUpdatedAt, sideBetsQ.dataUpdatedAt]);

  const isFetching = eventQ.isFetching || sideBetsQ.isFetching;

  // Toast on new error transitions
  const currentError = pickError(eventQ.error) || pickError(sideBetsQ.error) || pickError(eventsList.error);
  useEffect(() => {
    if (currentError && currentError !== lastErrorRef.current) {
      lastErrorRef.current = currentError;
      toast.error("Connection issue", { description: currentError });
    } else if (!currentError) {
      lastErrorRef.current = null;
    }
  }, [currentError]);

  const derived = useMemo<BoardData>(() => {
    const evt = eventQ.data;
    const sb = sideBetsQ.data ?? undefined;
    if (!evt) {
      // When the user is signed in but no event is selected/loaded yet,
      // surface a clean loading state instead of the demo seed data — the
      // router-level entry guard will have redirected to /events.
      const showMock = !authed;
      return {
        players: showMock ? mockPlayers : [],
        teams: showMock ? mockTeams : [],
        event: showMock ? mockEvent : { ...mockEvent, name: "", eventCode: "", hole: 0 },
        tickerItems: showMock ? mockTicker : [],
        rawEvent: null,
        sideBets: null,
        skins: null,
        loading: eventQ.isLoading || eventsList.isLoading,
        authed,
        error: currentError,
        isMock: showMock,
        eventId: resolvedEventId,
        lastUpdatedAt,
        isFetching,
        refresh,
        logout,
      };
    }
    const { players, positions } = derivePlayers(evt, sb, prevPositions.current);
    const teams = deriveTeams(players);
    const eventBoard = deriveEvent(evt, sb);
    const ticker = deriveTickerItems(prevPlayers.current, players);
    prevPositions.current = positions;
    prevPlayers.current = players;
    return {
      players,
      teams,
      event: eventBoard,
      tickerItems: ticker,
      rawEvent: evt,
      sideBets: sb ?? null,
      skins: findSkinsState(sb),
      loading: false,
      authed,
      error: null,
      isMock: false,
      eventId: resolvedEventId,
      lastUpdatedAt,
      isFetching,
      refresh,
      logout,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventQ.data, sideBetsQ.data, eventQ.isLoading, eventsList.isLoading, currentError, authed, resolvedEventId, lastUpdatedAt, isFetching]);

  return <Ctx.Provider value={derived}>{children}</Ctx.Provider>;
}

function pickError(e: unknown): string | null {
  if (!e) return null;
  if (e instanceof Error) return e.message;
  return String(e);
}
