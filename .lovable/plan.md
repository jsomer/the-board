## Goal

Replace `src/data/board.ts` mocks with live data from the GameTracker API (`https://gametracker-api-npr9.onrender.com`), polling every 8s. All components keep their existing visual design and design tokens — only the data source and a few derived fields change.

## What stays the same

- shadcn/ui components, three-theme system, all animation classes, design tokens
- BottomNav structure, route layout, page composition
- WhereDoIStand visual layout (already props-driven from last turn)

## Files added

```
src/lib/api/client.ts         JWT-aware fetch wrapper, base URL, 401 → clear token
src/lib/api/types.ts          EventRecord, EventPlayer, SideBet, SkinsState, H2HState, NassauState
src/lib/api/auth.ts           login(email,pw) → tokens in localStorage; getToken/clearToken
src/lib/api/events.ts         getEvents(), getEvent(id), getSideBets(id)
src/lib/board/derive.ts       Pure functions: initials, thru, diff, lastHole, skinsCount,
                              perHoleSkinValue, projectedPayouts, bubble/pressure, format string
src/lib/board/teams.ts        Local stub map: playerId → "Eagles" | "Hawks" (TODO: replace with teams_json)
src/hooks/useEventLive.ts     useQuery + 8s polling for event + side-bets, derives Player[]+movement
src/hooks/useAuth.ts          Reads token, exposes login/logout
src/routes/login.tsx          Email/password form → POST /auth/login
src/routes/_authenticated.tsx Layout route: redirect to /login if no token
```

## Files modified

- `src/data/board.ts` → keep `Player`/`Team`/`tickerItems` types only; remove seed arrays. Re-export derived types.
- `src/routes/__root.tsx` → wrap with QueryClientProvider; add `defaultPreloadStaleTime: 0`.
- `src/router.tsx` → fresh QueryClient per request, register context.
- `src/routes/{index,score,leaderboard,matchups,player.$playerId,admin}.tsx` → move under `_authenticated/`, accept `?eventId=` search param, fall back to most-recent event from `GET /events`.
- `src/components/board/Leaderboard.tsx` → sort/display `diff = achieved - quota` for stableford (real `toPar` for stroke), derive initials, badge skin count, projected payout.
- `src/components/board/SkinsStrip.tsx` → compute `holeValue = (carryIn + 1) * pot/participants.length`.
- `src/components/board/EventHeader.tsx` → compose `format` from `scoring_type` + `total_pot/players.length`.
- `src/components/board/Ticker.tsx` → diff polled `SkinsState.holes` to emit SKIN events; bubble/pressure derived items.
- `src/components/board/FastScoring.tsx` → wire to real `holeScores` + `hole_pars`; pass to `<WhereDoIStand>`. Keep auto-advance/swipe/undo UX.
- `src/components/board/WhereDoIStand.tsx` → already prop-driven; just consume real `myPlayerId`.
- `src/components/board/MatchupsPage.tsx` → H2H/Nassau from real state. **Remove** press history list (item 11). Show segment scores only.
- `src/components/board/TeamScoreboard.tsx` → driven by local `teams.ts` stub.
- `src/components/board/PlayerDetailPage.tsx` → real EventPlayer fields.
- `src/components/board/AdminPage.tsx` → connect to admin endpoints if present, otherwise mark TODO.

## Derived field rules (single source of truth in `derive.ts`)

| Field | Formula |
|---|---|
| `initials` | `name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()` |
| `thru` | `holeScores.filter(s => s > 0).length` |
| `diff` (stableford) | `achieved + adjustment - quota` |
| `toPar` (stroke) | `sum(played holeScores) - sum(corresponding hole_pars)` |
| `lastHole` | highest idx where `holeScores[idx] > 0` |
| `skinsCount` | `SkinsState.holes.filter(h => h.winner === player_id).length` |
| `holeValue` | `(carryIn + 1) * (pot / participants.length)` |
| `projected` | run `payout_breakdown_json` distribution against current diff rank |
| `bubble` | `currentRank` within ±1 of last paying place (from payout_breakdown) |
| `pressure` | if bubble: `"Needs +N to cash"` where N closes the gap |
| `movement` | `prevRank - currRank` from previous poll (kept in `useEventLive` ref) |
| `format` | `"{Stableford\|Stroke\|Net Stroke} · ${round(total_pot/players.length)} entry"` |

## Auth flow

1. `useAuth` reads `accessToken` from localStorage.
2. `_authenticated` layout: if no token, `throw redirect({ to: "/login" })`.
3. `/login` posts to `/auth/login`, stores tokens, navigates to `/`.
4. `apiClient` injects `Authorization: Bearer <token>`; on 401 → clear tokens, reload to `/login`.
5. Refresh-token rotation via `POST /auth/refresh` when access token 401s (single retry).

## Event selection

`?eventId=<id>` search param wins. Otherwise `GET /events` → pick `status === "draft"` first, else highest `id`. Selected ID written to `localStorage.activeEventId` for parity with the real app.

## Polling

`useEventLive(eventId)` uses `useQuery` with `refetchInterval: 8000`. Fetches `GET /events/:id` and `GET /events/:id/side-bets` in parallel. Computes derived `Player[]`, `Team[]`, ticker deltas, and tracks previous positions in a `useRef` for `movement`.

## Stubs / deferred

- **Teams** (item 10): `src/lib/board/teams.ts` exports a local `playerTeam(playerId)` map. Replace with `event.teams_json` when backend ships it.
- **Press history** (item 11): removed from MatchupsPage. Segment scores from existing `H2HState` per segment remain.
- **Admin endpoints**: any AdminPage controls without a known endpoint are marked with a `// TODO: wire to <verb> /events/:id/<path>` comment and disabled.

## Risks

- Render free tier cold-starts (~30s). Login/first fetch should show a loading state, not a blank screen.
- CORS: if `/auth/login` blocks `localhost`, add a Vite proxy in `vite.config.ts` for `/api` → Render URL.
- TanStack Query SSR: `QueryClient` must be created inside `getRouter()`, not module-level.
