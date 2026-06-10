# STATUS.md

## Status

Modern SQLite-backed MVP built and pushed.

GitHub: https://github.com/dr-gideon/world-cup-sweepstake

Archived previous build:

```text
mvp-resolve-dashboard-2026-06-10
```

## Current Direction

Fun office sweepstake experience, not a dashboard:

- Resolve colour influence only
- modern dark/magenta/gold event UI
- exciting ticket-style entry flow
- big reveal stage
- public team board
- Tele broadcast view for office screens
- SQLite shared state
- Windows-server-friendly Express app

## Implemented

- Express API.
- SQLite database using Node built-in `node:sqlite`.
- 48 seeded editable World Cup team slots.
- Participant registration stored in SQLite.
- Draw creation persisted in SQLite.
- Reveal-next and reveal-all persisted in SQLite.
- Manual team status updates persisted in SQLite.
- Reset endpoint.
- Rich match-impact audit events on team status changes.
- Modern React frontend.
- Entry screen, reveal stage, team board, Tele broadcast view, admin booth.
- Existing draw tests still pass.

## Verification

Latest local gates:

- `npm test` — passed
- `npm run build` — passed
- full-stack smoke check with temporary SQLite DB — passed
  - `/api/state`
  - add participants
  - create draw
  - reveal next
  - status update creates Match impact event
  - serve built frontend

## Next Steps

1. Optional: add CSV participant import.
2. Optional: add shared-team mode for >48 participants.
3. Optional: add LLM banter summaries via approved backend key.
4. Optional: package as a Windows service.
5. Optional: deploy internally after approval.

## Operating Notes

- Start server with `node --experimental-sqlite server/index.js` via `npm start`.
- Default port: `8097`.
- Default DB path: `data/sweepstake.sqlite`.
- No paid API or LLM wired yet.
