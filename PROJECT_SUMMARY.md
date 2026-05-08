# The Board — Project Summary

A live, mobile-first scoring and money-game leaderboard for golf events (skins, stroke, stableford, quota). Built on TanStack Start v1 (React 19 + Vite 7) with a custom GameTracker REST API as the backend.

## Purpose

"The Board" runs the money side of a casual golf round in real time:

- Admins create events, set the format, build the player roster, group players into tee times, and finalize results.
- Players score holes from their phones — scores sync live, drive the leaderboard, skins pot, and matchups.
- Spectators see a live event board with pot size, on-course count, skins carry, and pressure callouts.

## Tech Stack

- **Framework**: TanStack Start v1 (file-based routing in `src/routes/`, SSR-capable, edge target)
- **Build**: Vite 7
- **UI**: React 19 + Tailwind CSS v4 (tokens in `src/styles.css`) + shadcn/ui components
- **State / data**: TanStack Query for server state, custom hooks for sync (`useHoleScoreSync`)
- **Backend**: External GameTracker REST API (auth via Bearer access token + refresh token)
- **Deploy target**: Cloudflare Workers (`wrangler.jsonc`)

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing / event board entry |
| `/login` | Email + password auth, stores tokens, exposes `isAdmin` |
| `/leaderboard` | Live leaderboard for the active event |
| `/score` | FastScoring — per-hole entry, drill-down into a player's round |
| `/matchups` | Head-to-head, Nassau, skins side bets |
| `/admin` | Admin-only: create events, manage players, manage groups |
| `/player/$playerId` | Player detail page |

## Core Features

### Event lifecycle (admin)
4-step flow in `CreateEventDialog`:
1. **Event basics** — name, game setup, date/time, course, entry fee → `POST /events`
2. **Players** — pick from `GET /players`, fetch per-player quota via `GET /players/:id/game-quota/:gameSetupId`, allow override → `PUT /events/:id` with `{ results: { players: EventPlayer[] } }`
3. **Activate** — event status moves `draft → active`
4. **Side bets** (optional) — skins, h2h, nassau

Finalize via `POST /events/:id/finalize` (one-way, locks results).

### Groups (`GroupsManager`)
Optional tee-time / shotgun-start grouping. Max 4 players per group, one group per player per event. Scoring routes through `POST /events/:eventId/groups/:groupId/hole-score` when the player is grouped, otherwise `POST /events/:id/hole-score`.

### Live scoring (`FastScoring`)
- Per-hole gross score entry with optimistic UI
- Drill-down sheet to review/edit a player's full round
- Sync queue + offline-tolerant `useHoleScoreSync` hook
- `SaveIndicator` shows online/idle/syncing/error state

### Leaderboard / Money game
- Quota leaderboard, team scoreboard, skins strip, "Where do I stand", live ticker
- Pressure callouts ("needs birdie on 18 to cash", "on the bubble")

## Auth & Roles

- Tokens stored client-side after login (`/auth/login`)
- All API calls send `Authorization: Bearer <accessToken>`
- `isAdmin` from the login response gates the `/admin` route and create/edit actions
- Non-admin players can only POST scores for themselves

## Project Layout

```
src/
  routes/                  TanStack file-based routes
  components/board/        App-specific UI (AdminPage, FastScoring, Leaderboard, GroupsManager, ...)
  components/ui/           shadcn primitives
  lib/
    api/                   Typed API clients (auth, events, admin, groups) + shared types
    board/                 Board context, derive helpers, hole-lock logic
  hooks/                   useHoleScoreSync, usePlayerAlerts, use-mobile
  styles.css               Design tokens (oklch) + Tailwind v4 setup
```

## Design System

All colors and surfaces come from semantic tokens in `src/styles.css` (`--background`, `--primary`, `--money`, `--gold`, `--bubble`, `--surface`, ...). Components never hard-code colors — always reference tokens via Tailwind classes (e.g. `bg-surface/70`, `text-money`).

## API Surface (GameTracker)

- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`
- `GET /game-setups`, `GET /courses`, `GET /players`
- `GET /players/:id/game-quota/:gameSetupId`
- `POST /events`, `GET /events`, `GET /events/:id`, `PUT /events/:id`, `POST /events/:id/finalize`
- `POST /events/:id/hole-score`, `POST /events/:id/holes/:n/lock|unlock`
- `GET /events/:id/groups`, group CRUD + member add/remove
- `POST /events/:id/groups/:groupId/hole-score`
- `GET /events/:id/side-bets`

## Status

Active build. Most recent additions: per-player quota loading with override validation (Step 2), and full Groups management with group-scoped scoring routing.
