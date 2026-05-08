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

  const derived = useMemo<BoardData>(() => {
    const evt = eventQ.data;
    const sb = sideBetsQ.data ?? undefined;
    if (!evt) {
      return {
        players: mockPlayers,
        teams: mockTeams,
        event: mockEvent,
        tickerItems: mockTicker,
        rawEvent: null,
        sideBets: null,
        skins: null,
        loading: eventQ.isLoading || eventsList.isLoading,
        authed,
        error: pickError(eventQ.error) || pickError(eventsList.error),
        isMock: true,
        eventId: resolvedEventId,
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
    };
  }, [eventQ.data, sideBetsQ.data, eventQ.isLoading, eventQ.error, eventsList.isLoading, eventsList.error, authed, resolvedEventId]);

  return <Ctx.Provider value={derived}>{children}</Ctx.Provider>;
}

function pickError(e: unknown): string | null {
  if (!e) return null;
  if (e instanceof Error) return e.message;
  return String(e);
}
