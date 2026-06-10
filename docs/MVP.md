# MVP — World Cup Sweepstake

## Users

- Participant: joins the sweepstake and views assigned team(s).
- Admin: manages registration, runs the draw, updates results.
- Office viewer: watches the draw or leaderboard on a shared screen.

## Core Flow

1. Admin opens registration.
2. Participants enter name and optional department.
3. Admin closes registration.
4. App assigns all 48 World Cup teams fairly across participants.
5. Big-screen draw reveals assignments.
6. Public board shows team ownership.
7. Admin updates champion and runner-up at the end.
8. Prize winners are displayed.

## Draw Rules

- Every participant receives at least one team.
- All 48 teams are assigned.
- If participants < 48, bonus teams are randomly distributed.
- If participants > 48, only 48 entries can receive teams unless the office chooses shared/team-pair entries.
- Future enhancement: use pots to balance favourites, strong teams, mid-tier teams, and outsiders.

## MVP Screens

- Landing / join page
- Admin dashboard
- Draw setup page
- Animated reveal page
- Team ownership board
- Prize outcome page

## Out of Scope for MVP

- Payments or buy-ins
- Live sports API integration
- Authentication beyond a simple admin passcode
- Complex prediction game
