# STATUS.md

## Status

MVP built and pushed.

GitHub: https://github.com/dr-gideon/world-cup-sweepstake

## Current Direction

Small polished local-first React/Vite app for an office 2026 World Cup sweepstake:

- free entry
- CEO-sponsored prizes
- €50 for winning team owner
- €30 for runner-up team owner
- all 48 teams assigned
- bonus-team allocation if fewer than 48 people join
- draw blocked if more than 48 participants join until shared-team rules are agreed
- big-screen reveal and live ownership board
- manual tournament result updates

## Implemented

- Participant registration with optional department.
- Admin registration open/close.
- Fair seeded draw logic.
- 48 editable team slots with pots and statuses.
- Live reveal screen.
- Public searchable team board.
- Prize cards for champion and runner-up owners.
- Local JSON import/export.
- LocalStorage persistence.
- Draw tests for uniqueness, everyone-gets-one, balanced bonus spread, and >48 blocking.
- Resolve-inspired visual theme.

## Verification

Latest local gates:

- `npm test` — passed
- `npm run build` — passed
- served Vite app responded on localhost via curl

## Next Steps

1. Optional: deploy internally after approval.
2. Optional: add shared-team mode if all 52 colleagues want to join.
3. Optional: replace qualifier placeholders when the 2026 field is final.
4. Optional: add CSV participant import.

## Operating Notes

- Keep it simple and office-friendly.
- No payment/buy-in handling.
- No paid sports API.
- Prefer manual result updates for MVP unless live sports API is approved later.
- Export a backup before the real office draw.
