# World Cup Sweepstake

A fun office sweepstake app for the 2026 FIFA World Cup.

## Concept

Free-entry office sweepstake with an exciting entry flow, live draw reveal, shared team board, and prize tracking.

Prize rules:

- Champion team owner wins **€50**.
- Runner-up team owner wins **€30**.
- Entry is free for all participants.
- If one participant owns both finalists, they may win both prizes.

## App Surfaces

- `/` — public employee app. Shows only Enter and Draw. Auto-refreshes every 7 seconds.
- `/tele` — standalone office TV view. No nav or admin controls. Auto-refreshes every 10 seconds.
- `/admin` — protected admin console for organiser controls.

Admin credentials are read from environment variables:

```text
ADMIN_USER=admin
ADMIN_PASSWORD=change-me
COOKIE_SECURE=1 # optional, use when served over HTTPS
```

`ADMIN_PASSWORD` is required to start the server. Do not commit it or store it in plaintext project files.

## Current Build

The original Resolve-dashboard MVP is archived as git tag:

```text
mvp-resolve-dashboard-2026-06-10
```

The current app uses the Claude-designed visual direction from `/home/giddy/temp/Resolve logo and icon/sweepstake.jsx`, wired into the real Express/SQLite backend:

- Enterpryze/Resolve logo assets in `public/assets/`
- “ticket” entry screen
- animated draw-stage UI
- exciting team reveal
- searchable team board
- admin booth for participants, teams, and results
- Tele broadcast view for office screens after matches
- SQLite-backed shared state

## Features

- Employee allowlist CSV upload.
- Email-gated participant registration with one entry per employee email.
- Public screens do not display employee email addresses.
- Admin backup JSON export.
- Not-joined and participants CSV exports.
- Shared SQLite database instead of browser-only LocalStorage.
- Fair draw across all 48 World Cup team slots.
- Bonus teams distributed evenly when fewer than 48 people join.
- Draw blocked if more than 48 people join until shared-team rules are agreed.
- One-by-one reveal and reveal-all mode.
- Public team board.
- Tele view with post-match headline, drama feed, survival board, prize race, and ticker.
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
ADMIN_USER=admin
ADMIN_PASSWORD=change-me
COOKIE_SECURE=1
```

On Windows, run the same commands in PowerShell after installing Node 22+.
For a proper office deployment, run `npm start` as a Windows service with NSSM, PM2, or Task Scheduler.

## Verify

```bash
npm test
npm run build
```

See `docs/DEPLOYMENT.md` for Windows service notes and environment variables. See `docs/OFFICE-CHECKLIST.md` for the real office run checklist.

Full-stack smoke check used during development:

- build frontend
- start Express with a temporary SQLite DB
- call `/api/state`
- add participants
- run draw
- reveal one pick
- confirm built frontend is served

## Employee CSV format

Upload this in Admin before registration opens:

```csv
email,name,department
alice@company.com,Alice Murphy,Sales
bob@company.com,Bob Lee,Support
```

Rules:

- `email` is required.
- `name` and `department` are optional but recommended.
- emails are normalized to lowercase.
- admin UI previews valid, duplicate, and invalid rows before upload.
- duplicate emails in the CSV are ignored after the first valid row.
- uploading a new CSV before the draw replaces the previous allowlist and clears current participants.
- after the draw, the allowlist cannot be replaced unless the sweepstake is reset.

## Match Data Provider Direction

Current provider supports manual SQLite entry via Admin plus optional Football-Data sync. Football-Data sync reads `FOOTBALL_DATA_API_KEY`, defaults to competition `WC` and season `2026`, records rate-limit headers where provided, can import the confirmed 48 teams from fixtures before the draw, and skips API matches whose teams cannot be safely matched to local sweepstake team slots. Manual entry remains the fallback.

Tele summaries can be generated from local state. If `OPENAI_API_KEY` is configured, the app uses it and caches the result in SQLite. Without an LLM key, it uses deterministic fallback copy.

## Operating Notes

- Upload the employee email list before asking people to register.
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
