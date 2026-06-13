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

## 2026-06-11 — Tele prompt configuration

- Added optional `TELE_DRAMA_PROMPT` env var for OpenRouter/OpenAI Tele drama generation.
- If unset, the app keeps the existing sarcastic office-safe default prompt.
- The app still appends mandatory JSON output instructions and capped context after the configured prompt.
- Literal `\n` sequences in the env var are converted to new lines.

## 2026-06-11 — LLM privacy tightening

- Removed participant names from OpenRouter/OpenAI Tele drama context.
- LLM context now uses team name, team status, match data, and department where available.
- Sanitized match-impact context so historical audit details do not pass owner names to the LLM.
- Default prompt now explicitly says not to use participant names.

## 2026-06-11 — Tele yesterday-only drama feed

- Tele drama feed now shows only cached summaries tied to finished matches from yesterday, using Europe/Dublin date comparison.
- Removed the Tele fallback that showed older/all match-impact audit items when no current summaries matched.
- Increased summary payload from latest 8 to latest 50 so yesterday's match summaries are still available after multiple generated items.

## 2026-06-11 — Non-destructive employee add flow

- Added admin-only append endpoint `/api/allowlist/append` for adding missed employees without clearing existing participants.
- Admin UI now has separate buttons: `Add employees` and `Replace full list`.
- `Replace full list` remains available before the draw but now shows a confirmation because it clears current participants.
- Append smoke test confirmed adding a second CSV preserves existing participants.
- Admin employee CSV panel polished: safer copy, clearer Add-vs-Replace hierarchy, full-width primary action, and subdued destructive replace action.

## 2026-06-11 — Latest drama and startup sync

- Tele drama panel now shows `Latest drama` instead of yesterday-only summaries.
- It prefers summaries tied to the latest finished match, then recent finished-match summaries, then any generated Tele summaries as fallback.
- Football-Data auto-sync now runs once immediately on server startup, then continues on the configured interval.

## 2026-06-11 — Preserve scores and avoid stale drama

- Provider sync now preserves existing SQLite scores when Football-Data returns a finished match with `null` scores.
- Automatic drama generation now skips finished matches without both scores present.
- Tele `Latest drama` now only shows summaries tied to finished matches with real scores, and no longer falls back to stale/general summaries.
- Smoke test confirmed provider `null/null` score payload does not erase an existing `2-0` result.

## 2026-06-11 — Editable imported match results

- Admin fixture rows now include an `Edit` action.
- Editing loads the imported/manual match into the form and `Update match` patches the existing fixture instead of creating a duplicate.
- This allows manual score correction when Football-Data marks a match finished but returns null scores.

## 2026-06-11 — Inline match result editing

- Reworked Admin match editing after preview feedback.
- Match list now sorts by kickoff ascending so the earliest fixture appears first.
- Imported/manual fixture rows now expand inline for result editing instead of loading into the top add-match form.
- Inline editor PATCHes the existing fixture with team IDs, score, status, and notes.

## 2026-06-12 — Public backup button removed

- Removed the public Enter-page `Export backup` button immediately after it was spotted on the employee-facing surface.
- Removed the unused client-side JSON backup helper from `src/main.jsx`.
- Admin-only backup/export links remain under `/admin` and still rely on authenticated server endpoints.
- Verification passed: `npm test`, `npm run build`, and built public bundle no longer contains the `Export backup` button text.

## 2026-06-12 — Production/server boundary

- This VPS is Dr. Wells' personal/dev server for inspection and development.
- Production is a separate company server.
- The production deployment is Docker-based at `/opt/world-cup-sweepstake` on the company server.
- Do not expect `/opt/world-cup-sweepstake` to exist on this VPS; absence here does not mean production is missing.

## 2026-06-12 — Handoff after public export fix

- Public backup/export exposure was removed from the employee Enter page and pushed in commit `12cd99b Remove public backup export button`.
- Dr. Wells deployed the fix to the Linux Docker production server after pulling/rebuilding/restarting.
- Future Linux production commands should be run from `/opt/world-cup-sweepstake`.
- Use `docker compose down`, `git pull`, `docker compose up -d --build`; do not use `docker compose down -v` unless intentionally removing Docker volumes/data.

## 2026-06-12 — Draw countdown local preview

- Added a server-backed reveal countdown setting for the Draw page.
- Admin Draw controls can now set reveal open time, start now, or clear the countdown.
- Public Draw page shows the countdown using server time from `/api/state` and disables the reveal button until the countdown reaches zero.
- Added `app_settings` SQLite table for lightweight app settings.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`.
- Verification passed: `node --check server/index.js`, `node --check server/db.js`, `npm test`, `npm run build`, `git diff --check`, `/api/state` HTTP 200, and authenticated countdown set/clear smoke.

## 2026-06-12 — Draw time placeholder simplification

- Replaced the earlier reveal-lock countdown with a simpler public draw-time placeholder.
- Admin Draw controls now show only `Draw time`, `Save draw time`, and `Clear draw time`; confusing `Start now` was removed.
- Public Draw page now renders the draw countdown whenever a draw time is set, even before the draw has run, so employees can see when to come back.
- Removed reveal-button locking from the countdown; this is now announcement/placeholder behavior only.
- Settings API now stores `drawStartsAt` in SQLite `app_settings` under `draw_starts_at` and ignores the previous `reveal_starts_at` fallback.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`; production company server was not touched.
- Verification passed: `node --check server/index.js`, `node --check server/db.js`, `npm test`, `npm run build`, authenticated draw time set/clear smoke, `/api/state` HTTP 200, and `git diff --check`.

## 2026-06-12 — Draw countdown UI polish

- Polished the public Draw page countdown card into a clearer event-style draw-time panel with separate Days/Hours/Mins/Secs blocks.
- Fixed countdown jitter/stutter by memoizing the server-time offset instead of recalculating it on every render.
- Countdown no longer disappears automatically when it reaches zero; it changes to a "Draw time has arrived" state and keeps the placeholder visible until Admin clears the draw time.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`; production company server was not touched.
- Verification passed: `node --check server/index.js`, `node --check server/db.js`, `npm test`, `npm run build`, `git diff --check`, `/api/state` HTTP 200, and served bundle readback.

## 2026-06-12 — Email required for personal reveal

- Updated Draw page personal reveal flow so assignments are only shown after an email lookup succeeds.
- Removed the browser-memory fallback from reveal selection; local browser memory can suggest the previous email, but it no longer unlocks reveal by itself.
- Updated registration confirmation and Draw copy to say the same work email is required for reveal.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`; production company server was not touched.
- Verification passed: `npm run build`, `npm test`, `git diff --check`, source readback confirmed no remembered-participant fallback, `/api/state` HTTP 200, and served bundle readback.

## 2026-06-13 — Reveal confetti and pot audio

- Added local reveal audio assets under `public/audio/`, copied from `/home/giddy/temp/sound/` and normalized to `reveal-pot-<pot>-a/b.mp3`.
- Draw reveal now plays one random audio sting for the revealed team pot: 2 files per pot, 8 files total.
- Added lightweight in-app confetti burst on reveal, with intensity scaled by pot and `prefers-reduced-motion` respected.
- Added a `Sound on/off` toggle next to reveal controls; audio failure is non-blocking so reveal continues silently if blocked or muted.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`; production company server was not touched.
- Verification passed: `npm run build`, `npm test`, `git diff --check`, `/api/state` HTTP 200, served bundle readback, and all 8 audio files returned HTTP 200 from preview.

## 2026-06-13 — Sealed model personal reveal

- Converted personal reveal into a persisted sealed-draw flow: Admin draw still assigns all teams up front, but each personal reveal now marks that assignment as revealed in SQLite.
- Added public reveal endpoint `POST /api/assignments/:id/reveal` that requires the matching participant email and rejects wrong-email reveal attempts.
- Draw page now treats browser/local state as temporary only; persisted `assignment.revealed` controls what is visible across browsers and refreshes.
- Added sealed draw summary on Draw page showing total revealed and per-pot revealed/still-in-pot counts.
- Full draw board continues to show hidden placeholders for unrevealed assignments and team/owner only after reveal.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/`; production company server was not touched.
- Verification passed: temp SQLite sealed-reveal smoke including wrong-email rejection, `node --check server/index.js`, `node --check server/db.js`, `npm test`, `npm run build`, `git diff --check`, `/api/state` HTTP 200, and served bundle readback.

## 2026-06-13 — Reveal stream page

- Added `/stream` as a standalone office-screen reveal stream page.
- Stream auto-refreshes every 3 seconds and shows latest reveal, reveal feed, and the existing sealed pot summary.
- Added persisted `revealed_at` timestamps to assignments so stream ordering is stable across refreshes and browsers.
- Personal reveal now stores `revealed_at` the first time an assignment is revealed; admin reveal-next/reveal-all also backfill timestamps.
- Added `Enable sound` stream control. After user enables sound, new reveals detected by auto-refresh play a short generated drumroll/pop via Web Audio and highlight the latest card.
- `/stream` is served by the Express SPA router alongside `/`, `/tele`, and `/admin`.
- Local preview rebuilt and restarted on `http://100.86.180.12:8097/stream`; production company server was not touched.
- Verification passed: temp SQLite timestamp smoke, `node --check server/index.js`, `node --check server/db.js`, `npm test`, `npm run build`, `git diff --check`, `/api/state` HTTP 200, `/stream` HTTP 200, and served bundle readback.

## 2026-06-13 — Reveal UX fixes from simulation

- During temp simulation testing, Dr. Wells found `Start again` was misleading after a persisted sealed reveal and the sound state was unclear.
- Replaced `Start again` with `Reveal another email`, which clears the email lookup and returns to the email-required reveal form.
- Clarified reveal audio toggle copy to `Sound: On/Off` with distinct on/off styling.
- Locked the full draw board until all 48 assignments are revealed; before then it shows progress and cannot be opened.
- Rebuilt and restarted both the main local preview (`8097`) and temp simulation server (`8110`); production company server was not touched.
- Verification passed: `npm run build`, `npm test`, `git diff --check`, main `/api/state` HTTP 200, sim `/api/state` HTTP 200, sim `/stream` HTTP 200, and sim served bundle readback.

## 2026-06-13 — Reveal replay button correction

- Dr. Wells confirmed audio works and corrected the reveal UX: users should not be invited to reveal another email from the post-reveal state.
- Replaced `Reveal another email` with `Start again` as a replay-only action for the same verified assignment.
- `Start again` now reruns the reveal animation, pot audio, and confetti locally without clearing the email lookup or changing persisted sealed reveal state.
- Rebuilt and restarted both main preview (`8097`) and temp simulation server (`8110`); production company server was not touched.
- Verification passed: `npm run build`, `npm test`, `git diff --check`, main `/api/state` HTTP 200, sim `/api/state` HTTP 200, and sim served bundle readback.

## 2026-06-13 — Stream reveal confetti and audio asset

- Added stream-page confetti when a new reveal appears via auto-refresh.
- Replaced the mild generated stream sound with Dr. Wells' provided `/home/giddy/temp/sound/stream.mp3`, copied to `public/audio/stream-reveal.mp3`.
- Stream page now plays the provided audio at higher volume when sound is enabled and a new reveal is detected.
- Rebuilt and restarted both main preview (`8097`) and temp simulation server (`8110`); production company server was not touched.
- Verification passed: `npm run build`, `npm test`, `git diff --check`, main/sim `/api/state` HTTP 200, sim stream bundle readback, and `stream-reveal.mp3` HTTP 200.

## 2026-06-13 — Temp simulation stopped

- Stopped the isolated temp simulation server on port `8110` after end-to-end testing passed.
- Final local gate before commit/push prep passed: `npm run build`, `npm test`, and `git diff --check`.
