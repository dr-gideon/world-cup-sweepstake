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
- Shared SQLite database instead of browser-only LocalStorage.
- Fair draw across all 48 World Cup team slots.
- Bonus teams distributed evenly when fewer than 48 people join.
- Draw blocked if more than 48 people join until shared-team rules are agreed.
- One-by-one reveal and reveal-all mode.
- Public team board.
- Tele view for office TV: fixtures/results plus sarcastic cached drama feed.
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

Current provider is manual SQLite entry via Admin. This gives Tele fixtures/results without paid API dependency. Future provider can sync into the same match table from API-Football, football-data.org, SportMonks, or another source.

## Operating Notes

- Upload the employee email list before asking people to register.
- Export a backup before a real office draw.
- Once a draw exists, participant edits are locked.
- Reset the sweepstake if the participant list needs to change after a draw.
- 2026 qualifiers are not all final yet, so most team slots are editable placeholders.
- Football-Data sync and OpenRouter Tele drama are wired via environment variables; no secrets are committed.

## Repository

Private GitHub repo:

```text
https://github.com/dr-gideon/world-cup-sweepstake
```

## Match Data

- Current provider: manual Admin entry stored in SQLite `matches` table.
- Tele reads latest live/finished matches and upcoming scheduled matches.
- Future provider integration should write into this same table instead of coupling Tele directly to a paid API.

## Deployment Readiness

- `.env.example` added.
- `docs/DEPLOYMENT.md` added with Windows service options and backup checklist.
- Admin exports: full JSON backup, not-joined CSV, participants CSV.
- Export endpoints require admin auth.
- Smoke test confirmed unauthenticated export returns 401 and authenticated exports contain expected data.

## Production Dry-run

A clean clone production-style dry-run passed on temp port `8108` with temp DB:

- `npm ci`
- `npm run build`
- started with production env vars
- public/admin/tele surfaces served
- unauth admin API rejected
- admin login succeeded
- uploaded 48 synthetic employee CSV
- registered all 48 users
- ran draw and reveal all
- added final match and winner/runner-up statuses
- backup/not-joined/participants exports verified

## Office Runbook

- Added `docs/OFFICE-CHECKLIST.md`.

## Football-Data / Tele Summary Layer

- Added optional Football-Data provider sync endpoint.
- Env vars: `FOOTBALL_DATA_API_KEY`, `FOOTBALL_DATA_COMPETITION=WC`, `FOOTBALL_DATA_SEASON=2026`.
- Sync records provider status, imported/skipped counts, and rate-limit headers when available.
- Sync safely skips API matches when both teams cannot be mapped to local team slots.
- Added cached Tele summaries.
- Env vars: `OPENAI_API_KEY`, optional `OPENAI_MODEL`.
- Without LLM env, Tele summary generation falls back to deterministic local copy.
- Live Football-Data smoke with temp key returned WC matches and safely skipped unmatched placeholder teams.

## Football-Data Team Import

- Added Admin `Import teams` action for Football-Data.
- Imports the 48 World Cup teams from Football-Data fixture teams before the draw.
- Blocks team replacement after the draw has run.
- Stores crest URLs in the existing team flag field and renders them as images where appropriate.
- Live smoke with temp key imported 48 teams; subsequent match sync imported 72 matches and skipped 32 unmatched/TBD provider entries.

## Football-Data Auto-sync

- Added optional in-app scheduler.
- Env vars: `FOOTBALL_DATA_AUTO_SYNC=1`, `FOOTBALL_DATA_SYNC_INTERVAL_MINUTES=15`.
- Minimum interval is clamped to 5 minutes.
- Scheduler respects low request budget by skipping sync when `X-RequestsAvailable <= 2`.
- Admin shows scheduler enabled/running/last message.
- Automatic status derivation is limited to knockout/final matches. Group-stage elimination remains manual/safe.

## OpenRouter Tele Drama

- Added OpenRouter support via `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- Finished matches can generate cached drama summaries keyed by match/result.
- Tele drama feed now prefers cached summaries, then falls back to Match impact events.
- Manual `Generate Tele summary` works with OpenRouter/OpenAI/fallback.
- OpenRouter smoke with temp key succeeded; key not committed.


## End-of-day state — 2026-06-10

- Main branch is pushed and clean through `27d0dd6 Polish provider admin controls`.
- Local preview on `http://100.86.180.12:8097/` was restarted and verified.
- Windows dry run worked after pulling latest, building, setting env vars, and restarting NSSM service.
- Dr. Wells reset the Windows SQLite DB by deleting `C:\Apps\world-cup-sweepstake\data\sweepstake.sqlite*`, wiping test employees/data.
- Current public flow: employee enters via allowlist email, gets centered registration confirmation, browser remembers participant, Draw can also find teams by email, and personal team reveal animates through flags before showing assignment.
- Current Tele flow: office TV shows only fixtures/results and the drama feed; alive/survival/prize clutter removed. Drama prompt is intentionally sarcastic/funny but office-safe.
- Current Admin flow: protected `/admin`, clean Football-Data/Tele controls, provider status cards, match sync/import teams, cached Tele summary generation, auto-sync status.
- Important env vars for Windows: `FOOTBALL_DATA_API_KEY`, `FOOTBALL_DATA_AUTO_SYNC=1`, `FOOTBALL_DATA_SYNC_INTERVAL_MINUTES=15`, `FOOTBALL_DATA_COMPETITION=WC`, `FOOTBALL_DATA_SEASON=2026`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=openai/gpt-4o-mini`, `ADMIN_USER`, `ADMIN_PASSWORD`, `COOKIE_SECURE=0`.
- Next sensible step: upload the real employee CSV on Windows, import teams, sync matches, do a final admin/Tele smoke, then share the public URL internally.
