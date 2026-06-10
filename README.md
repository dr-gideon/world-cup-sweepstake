# World Cup Sweepstake

A fun office sweepstake app for the 2026 FIFA World Cup.

## Concept

Free-entry, CEO-sponsored sweepstake with an exciting entry flow, live draw reveal, shared team board, and prize tracking.

Prize rules:

- Champion team owner wins **€50**.
- Runner-up team owner wins **€30**.
- Entry is free for all participants.
- If one participant owns both finalists, they may win both prizes.

## Current Build

The original Resolve-dashboard MVP is archived as git tag:

```text
mvp-resolve-dashboard-2026-06-10
```

The current app keeps the Resolve colour influence but switches to a modern event-style experience:

- “ticket” entry screen
- animated draw-stage UI
- exciting team reveal
- searchable team board
- admin booth for participants, teams, and results
- SQLite-backed shared state

## Features

- Participant registration with optional department.
- Shared SQLite database instead of browser-only LocalStorage.
- Fair draw across all 48 World Cup team slots.
- Bonus teams distributed evenly when fewer than 48 people join.
- Draw blocked if more than 48 people join until shared-team rules are agreed.
- One-by-one reveal and reveal-all mode.
- Public team board.
- Editable qualifier team slots.
- Manual tournament status updates.
- Prize tracker for winner and runner-up.
- JSON export from the UI.

## Stack

- React
- Vite
- Express
- Node built-in SQLite (`node:sqlite`)
- Node test runner

## Requirements

- Node.js 22+ with `node:sqlite` available.
- Start server commands with `--experimental-sqlite` while Node marks the module experimental.

## Development

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

## Production / Windows Server

Build the frontend:

```bash
npm install
npm run build
```

Start the combined Express + SQLite server:

```bash
npm start
```

By default, the server listens on port `8097` and stores data in:

```text
data/sweepstake.sqlite
```

Optional environment variables:

```text
PORT=8097
SWEEPSTAKE_DB=data/sweepstake.sqlite
```

On Windows, run the same commands in PowerShell after installing Node 22+.
For a proper office deployment, run `npm start` as a Windows service with NSSM, PM2, or Task Scheduler.

## Verify

```bash
npm test
npm run build
```

Full-stack smoke check used during development:

- build frontend
- start Express with a temporary SQLite DB
- call `/api/state`
- add participants
- run draw
- reveal one pick
- confirm built frontend is served

## Operating Notes

- Export a backup before a real office draw.
- Once a draw exists, participant edits are locked.
- Reset the sweepstake if the participant list needs to change after a draw.
- 2026 qualifiers are not all final yet, so most team slots are editable placeholders.
- No paid sports API or LLM is wired yet.

## Repository

Private GitHub repo:

```text
https://github.com/dr-gideon/world-cup-sweepstake
```
