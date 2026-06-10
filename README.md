# World Cup Sweepstake

Office sweepstake app for the 2026 FIFA World Cup.

## Concept

A free-entry, CEO-sponsored office sweepstake where participating colleagues receive one or more World Cup teams. The app handles registration, a fair random draw, a big-screen reveal, a public ownership board, manual result updates, and prize tracking.

## Prize Rules

- Champion team owner wins **€50**.
- Runner-up team owner wins **€30**.
- Entry is free for all participants.
- If one participant owns both finalist teams, they may win both prizes.

## MVP Features

- Participant registration with optional department.
- Admin-controlled registration open/close.
- Fair draw across all 48 World Cup team slots.
- Bonus teams distributed evenly when fewer than 48 people join.
- Draw blocked if more than 48 participants join, until shared-team rules are agreed.
- Big-screen reveal mode.
- Public team ownership board with search.
- Editable team slots for 2026 qualifiers.
- Manual result/status updates.
- Prize tracker for winner and runner-up.
- Local import/export JSON backup.
- Local-first browser storage; no staff data leaves the browser.

## Stack

- React
- Vite
- LocalStorage persistence
- Node test runner
- Resolve-inspired UI theme

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Verify

```bash
npm test
npm run build
```

## Operating Notes

- The app is intentionally local-first for the MVP.
- Export a JSON backup before running a real office draw.
- Once a draw exists, participant edits are locked to protect the board.
- Reset the sweepstake if the participant list needs to change after a draw.
- 2026 qualifiers are not all final yet, so most team slots are editable placeholders.

## Repository

Private GitHub repo:

```text
https://github.com/dr-gideon/world-cup-sweepstake
```
